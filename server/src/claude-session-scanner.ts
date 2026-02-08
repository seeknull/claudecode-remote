import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, sep } from "path";
import { homedir } from "os";
import { createLogger } from "./logger.js";
import { WsEvent } from "./session-manager.js";
import { translateJsonlLine } from "./jsonl-translator.js";

const log = createLogger("scanner");

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

export interface CliSessionInfo {
  id: string; // UUID from filename
  directory: string; // Decoded from folder name
  label: string; // First user message (truncated)
  createdAt: string;
  lastActivity: string;
  messagePreview: string;
  messageCount: number; // user + assistant count
  waitingOnUser: boolean; // true if last tool_use is AskUserQuestion without a result
  source: "cli";
}

export interface DiscoveredDirectory {
  path: string;
  label: string; // Last 2 path segments
  sessionCount: number;
}

/**
 * Decode a Claude projects folder name back to an absolute path.
 * e.g. "-Users-guru-garage-myapp" → "/Users/guru/garage/myapp"
 *
 * The encoding replaces path separators with "-", but this is ambiguous when
 * path segments contain dashes (e.g. "claudecode-remote").
 * We resolve ambiguity by testing which interpretation produces a valid path.
 */
function decodeFolderName(name: string): string {
  const parts = name.split("-").filter(Boolean);

  function resolve(idx: number, current: string): string | null {
    if (idx >= parts.length) {
      return existsSync(current) ? current : null;
    }

    const asSeparator = current + sep + parts[idx];
    const r1 = resolve(idx + 1, asSeparator);
    if (r1) return r1;

    const asDash = current + "-" + parts[idx];
    const r2 = resolve(idx + 1, asDash);
    if (r2) return r2;

    return null;
  }

  const resolved = resolve(0, "");
  if (resolved) return resolved;

  // Fallback: naive replacement
  return name.replace(/-/g, sep);
}

/**
 * Encode an absolute path to a Claude projects folder name.
 */
export function encodeDirToFolderName(dir: string): string {
  return dir.replace(/[\\/]/g, "-");
}

/**
 * Discover all project directories from ~/.claude/projects/
 */
export function discoverDirectories(): DiscoveredDirectory[] {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) return [];

  const dirs: DiscoveredDirectory[] = [];

  try {
    const entries = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const decodedPath = decodeFolderName(entry.name);

      // Check if the decoded directory actually exists on disk
      if (!existsSync(decodedPath)) continue;

      // Count real sessions using the same filtering as listCliSessions
      const sessionCount = listCliSessions(decodedPath).length;
      if (sessionCount === 0) continue;

      // Generate label from last 2 path segments
      const pathParts = decodedPath.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean);
      const label = pathParts.length <= 2 ? pathParts.join("/") : pathParts.slice(-2).join("/");

      dirs.push({ path: decodedPath, label, sessionCount });
    }
  } catch (err) {
    log.error("Failed to scan ~/.claude/projects/", { error: (err as Error).message });
  }

  // Sort by path
  return dirs.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Strip IDE-injected system context tags from user text.
 * VS Code extension injects <ide_opened_file>, <ide_selection>, etc.
 */
function stripSystemTags(text: string): string {
  // Remove <tag>...</tag> blocks and <tag>... (unterminated) for known IDE tags
  let cleaned = text.replace(/<(?:ide_opened_file|ide_selection|ide_action|system-reminder|command-name|user-prompt-submit-hook)[^>]*>[\s\S]*?(?:<\/(?:ide_opened_file|ide_selection|ide_action|system-reminder|command-name|user-prompt-submit-hook)>|$)/gi, "");
  // Also remove standalone tags like <ide_opened_file>... that span to end of text or next real content
  cleaned = cleaned.replace(/<(?:ide_opened_file|ide_selection|ide_action|system-reminder)[^>]*>[^\n]*/gi, "");
  // Remove [Request interrupted by user...] markers
  cleaned = cleaned.replace(/\[Request interrupted by user[^\]]*\]/g, "");
  // Remove [Image: ...] references (e.g. "[Image: original 3332x578, displayed at 2000x347. ...]")
  cleaned = cleaned.replace(/\[Image:[^\]]*\]/g, "");
  // Trim leftover whitespace
  return cleaned.trim();
}

/**
 * Parse a JSONL session file to extract metadata for listing.
 * Skips summary-only stubs and sessions with no real user messages.
 */
function parseSessionMeta(filePath: string): {
  label: string;
  createdAt: string;
  lastActivity: string;
  messagePreview: string;
  messageCount: number;
  waitingOnUser: boolean;
} | null {
  try {
    const stat = statSync(filePath);
    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());

    if (lines.length === 0) return null;

    let firstUserText = "";
    let lastUserText = "";
    let summaryText = "";
    let firstTimestamp = "";
    let messageCount = 0;
    let lastPendingToolName = ""; // tracks last tool_use without a result

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);

        if (obj.type === "user" && obj.message?.content) {
          messageCount++;
          // Iterate all text blocks — the first may be IDE-injected tags
          for (const block of obj.message.content) {
            if (block.type !== "text" || !block.text) continue;
            const cleaned = stripSystemTags(block.text);
            if (cleaned) {
              if (!firstUserText) firstUserText = cleaned;
              lastUserText = cleaned;
              break; // use the first real user text from this message
            }
          }
          if (!firstTimestamp && obj.timestamp) {
            firstTimestamp = obj.timestamp;
          }
          // tool_result blocks in user messages clear the pending tool
          const hasToolResult = obj.message.content.some(
            (b: any) => b.type === "tool_result"
          );
          if (hasToolResult) lastPendingToolName = "";
        } else if (obj.type === "assistant") {
          messageCount++;
          // Track tool_use blocks to detect pending AskUserQuestion
          if (Array.isArray(obj.message?.content)) {
            for (const block of obj.message.content) {
              if (block.type === "tool_use") {
                lastPendingToolName = block.name || "";
              }
            }
          }
        } else if (obj.type === "summary") {
          if (!summaryText && obj.summary) {
            summaryText = obj.summary;
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    // Skip if no user-typed text was found (only system-injected context)
    if (!firstUserText && !summaryText) return null;

    const truncate = (s: string, n: number) =>
      s.length > n ? s.slice(0, n) + "..." : s;

    const label = firstUserText || summaryText || "Untitled session";

    return {
      label: truncate(label, 80),
      createdAt: firstTimestamp || stat.birthtime.toISOString(),
      lastActivity: stat.mtime.toISOString(),
      messagePreview: truncate(lastUserText || firstUserText || "", 100),
      messageCount,
      waitingOnUser: lastPendingToolName === "AskUserQuestion",
    };
  } catch {
    return null;
  }
}

/**
 * List CLI sessions for a given directory by scanning ~/.claude/projects/<encoded>/
 */
export function listCliSessions(directory: string): CliSessionInfo[] {
  const folderName = encodeDirToFolderName(directory);
  const projectDir = join(CLAUDE_PROJECTS_DIR, folderName);

  if (!existsSync(projectDir)) return [];

  const sessions: CliSessionInfo[] = [];

  try {
    const files = readdirSync(projectDir);
    for (const file of files) {
      if (!file.endsWith(".jsonl")) continue;

      const sessionId = file.replace(".jsonl", "");
      // Skip non-UUID filenames (like memory files, etc.)
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(sessionId)) {
        continue;
      }

      const filePath = join(projectDir, file);
      const meta = parseSessionMeta(filePath);
      if (!meta) continue;

      sessions.push({
        id: sessionId,
        directory,
        source: "cli",
        ...meta,
      });
    }
  } catch (err) {
    log.error("Failed to scan CLI sessions", {
      directory,
      error: (err as Error).message,
    });
  }

  // Sort by last activity, newest first
  return sessions.sort(
    (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );
}

/**
 * Parse a full CLI session JSONL file into WsEvent[] format for history replay.
 * This translates the Anthropic/Claude JSONL format into our simplified WS events.
 */
export function parseCliSessionHistory(sessionId: string, directory: string): WsEvent[] {
  const folderName = encodeDirToFolderName(directory);
  const filePath = join(CLAUDE_PROJECTS_DIR, folderName, `${sessionId}.jsonl`);

  if (!existsSync(filePath)) return [];

  const events: WsEvent[] = [];

  try {
    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.split("\n").filter((l) => l.trim());

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const translated = translateJsonlLine(obj);
        events.push(...translated);
      } catch {
        // Skip malformed lines
      }
    }
  } catch (err) {
    log.error("Failed to parse CLI session JSONL", {
      sessionId,
      error: (err as Error).message,
    });
  }

  return events;
}
