import { statSync, openSync, readSync, closeSync, watchFile, unwatchFile, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createLogger } from "./logger.js";
import { WsEvent } from "./session-manager.js";
import { encodeDirToFolderName } from "./claude-session-scanner.js";
import { translateJsonlLine } from "./jsonl-translator.js";

const log = createLogger("watcher");

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

interface WatcherState {
  filePath: string;
  sessionId: string;
  byteOffset: number;
  lastActivity: number;
  idleTimeout: NodeJS.Timeout | null;
}

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes of no file changes → auto-stop
const POLL_INTERVAL_MS = 1000; // Check file every 1 second

// Active watchers keyed by sessionId
const activeWatchers = new Map<string, WatcherState>();

// Callback for broadcasting events to clients
type BroadcastFn = (sessionId: string, event: WsEvent) => void;

let broadcastFn: BroadcastFn | null = null;

/**
 * Register the broadcast function (called once during server init).
 */
export function setWatcherBroadcast(fn: BroadcastFn) {
  broadcastFn = fn;
}

/**
 * Get the JSONL file path for a CLI session.
 */
function getJsonlPath(sessionId: string, directory: string): string | null {
  const folderName = encodeDirToFolderName(directory);
  const filePath = join(CLAUDE_PROJECTS_DIR, folderName, `${sessionId}.jsonl`);
  return existsSync(filePath) ? filePath : null;
}

/**
 * Start watching a CLI session's JSONL file for new lines.
 * Returns true if watcher started, false if already watching or file not found.
 */
export function startWatching(sessionId: string, directory: string): boolean {
  if (activeWatchers.has(sessionId)) {
    // Already watching — just reset idle timer
    resetIdleTimer(sessionId);
    log.debug("Already watching, reset idle timer", { sessionId });
    return true;
  }

  const filePath = getJsonlPath(sessionId, directory);
  if (!filePath) {
    log.warn("Cannot watch — JSONL file not found", { sessionId, directory });
    return false;
  }

  // Get current file size as initial offset (only read NEW content)
  let byteOffset = 0;
  try {
    const stat = statSync(filePath);
    byteOffset = stat.size;
  } catch {
    // File might not exist yet, start from 0
  }

  const state: WatcherState = {
    filePath,
    sessionId,
    byteOffset,
    lastActivity: Date.now(),
    idleTimeout: null,
  };

  activeWatchers.set(sessionId, state);

  // Use fs.watchFile for reliable polling (works across all platforms, handles JSONL appends)
  watchFile(filePath, { interval: POLL_INTERVAL_MS }, (curr, prev) => {
    if (curr.size > state.byteOffset) {
      onFileChanged(state);
    }
  });

  resetIdleTimer(sessionId);

  log.info("Started watching JSONL", {
    sessionId,
    filePath,
    initialOffset: byteOffset,
  });

  // Broadcast watch status to clients
  if (broadcastFn) {
    broadcastFn(sessionId, { type: "watch_status", watching: true });
  }

  return true;
}

/**
 * Stop watching a session's JSONL file.
 */
export function stopWatching(sessionId: string) {
  const state = activeWatchers.get(sessionId);
  if (!state) return;

  unwatchFile(state.filePath);

  if (state.idleTimeout) {
    clearTimeout(state.idleTimeout);
  }

  activeWatchers.delete(sessionId);

  log.info("Stopped watching JSONL", { sessionId });

  // Broadcast watch status to clients
  if (broadcastFn) {
    broadcastFn(sessionId, { type: "watch_status", watching: false });
  }
}

/**
 * Check if a session is being watched.
 */
export function isWatching(sessionId: string): boolean {
  return activeWatchers.has(sessionId);
}

/**
 * Stop all watchers (called during server shutdown).
 */
export function stopAllWatchers() {
  const ids = [...activeWatchers.keys()];
  for (const sessionId of ids) {
    stopWatching(sessionId);
  }
}

/**
 * Read new bytes from the JSONL file, translate new lines, and broadcast.
 */
function onFileChanged(state: WatcherState) {
  try {
    const stat = statSync(state.filePath);
    const newSize = stat.size;

    if (newSize <= state.byteOffset) return;

    // Read only the new bytes using low-level fd operations for correct byte offsets
    const bytesToRead = newSize - state.byteOffset;
    const buffer = Buffer.alloc(bytesToRead);
    const fd = openSync(state.filePath, "r");
    try {
      readSync(fd, buffer, 0, bytesToRead, state.byteOffset);
    } finally {
      closeSync(fd);
    }

    state.lastActivity = Date.now();

    const newContent = buffer.toString("utf-8");

    // Split into lines, but keep any trailing partial line for the next read.
    // A partial line occurs when the CLI is mid-write — we must NOT skip it.
    const lines = newContent.split("\n");
    const lastLine = lines[lines.length - 1];

    // If the last element is non-empty, the chunk didn't end with \n — it's a partial line.
    // Roll back byteOffset so we re-read that partial chunk next time.
    const partialBytes = lastLine.length > 0 ? Buffer.byteLength(lastLine, "utf-8") : 0;
    state.byteOffset = newSize - partialBytes;

    // Process only complete lines (everything except the trailing partial)
    const completeLines = partialBytes > 0 ? lines.slice(0, -1) : lines;

    for (const line of completeLines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        const wsEvents = translateJsonlLine(obj);
        for (const wsEvent of wsEvents) {
          if (broadcastFn) {
            broadcastFn(state.sessionId, wsEvent);
          }
        }
      } catch {
        // Skip malformed lines (corrupted, not partial — partial lines are retained)
      }
    }

    // Reset idle timer on activity
    resetIdleTimer(state.sessionId);
  } catch (err) {
    log.error("Error reading JSONL update", {
      sessionId: state.sessionId,
      error: (err as Error).message,
    });
  }
}

/**
 * Reset the idle auto-stop timer for a session watcher.
 */
function resetIdleTimer(sessionId: string) {
  const state = activeWatchers.get(sessionId);
  if (!state) return;

  if (state.idleTimeout) {
    clearTimeout(state.idleTimeout);
  }

  state.idleTimeout = setTimeout(() => {
    log.info("Watcher idle timeout — auto-stopping", { sessionId });
    stopWatching(sessionId);
  }, IDLE_TIMEOUT_MS);
}
