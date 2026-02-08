import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { v4 as uuidv4 } from "uuid";
import { createLogger } from "./logger.js";

const log = createLogger("session");

export interface WsEvent {
  type: string;
  [key: string]: unknown;
}

export interface Session {
  id: string;
  sdkSessionId?: string;
  directory: string;
  label: string;
  createdAt: string;
  lastActivity: string;
  messageBuffer: WsEvent[];
  isProcessing: boolean;
}

interface PersistedSession {
  id: string;
  sdkSessionId?: string;
  directory: string;
  label: string;
  createdAt: string;
  lastActivity: string;
  messageBuffer?: WsEvent[];
}

const STORAGE_DIR = join(homedir(), ".claude-code-remote");
const SESSIONS_FILE = join(STORAGE_DIR, "sessions.json");

/**
 * Strip non-meaningful content from session labels (image refs, system tags, etc.)
 */
function cleanLabel(text: string): string {
  return text.replace(/\[Image:[^\]]*\]/g, "").trim();
}

class SessionManager {
  private sessions = new Map<string, Session>();

  constructor() {
    this.loadFromDisk();
  }

  create(directory: string, label?: string): Session {
    const id = uuidv4();
    const now = new Date().toISOString();
    const session: Session = {
      id,
      directory,
      label: label || `Session ${this.listByDirectory(directory).length + 1}`,
      createdAt: now,
      lastActivity: now,
      messageBuffer: [],
      isProcessing: false,
    };
    this.sessions.set(id, session);
    this.saveToDisk();
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  listByDirectory(directory: string): Session[] {
    const sessions: Session[] = [];
    for (const session of this.sessions.values()) {
      if (session.directory === directory) {
        sessions.push(session);
      }
    }
    return sessions.sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() -
        new Date(a.lastActivity).getTime()
    );
  }

  listAll(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() -
        new Date(a.lastActivity).getTime()
    );
  }

  delete(id: string): boolean {
    const deleted = this.sessions.delete(id);
    if (deleted) this.saveToDisk();
    return deleted;
  }

  appendEvent(id: string, event: WsEvent) {
    const session = this.sessions.get(id);
    if (session) {
      session.messageBuffer.push(event);
      session.lastActivity = new Date().toISOString();

      // Auto-set label to first user message (like Claude Code does)
      if (
        event.type === "user_message" &&
        session.label.startsWith("Session ")
      ) {
        let text = cleanLabel((event.text as string) || "");
        if (text) {
          session.label = text.length > 60 ? text.slice(0, 60) + "..." : text;
          this.saveToDisk();
        }
      }
    }
  }

  updateSdkSessionId(id: string, sdkSessionId: string) {
    const session = this.sessions.get(id);
    if (session) {
      session.sdkSessionId = sdkSessionId;
      this.saveToDisk();
    }
  }

  setProcessing(id: string, isProcessing: boolean) {
    const session = this.sessions.get(id);
    if (session) {
      session.isProcessing = isProcessing;
      session.lastActivity = new Date().toISOString();
      this.saveToDisk();
    }
  }

  /**
   * Import a CLI/VSCode session into the session manager.
   * Used when a user joins a CLI session from the web UI for the first time.
   * The CLI session UUID becomes the sdkSessionId for resume.
   */
  importCliSession(
    cliSessionId: string,
    directory: string,
    label: string,
    messageBuffer: WsEvent[]
  ): Session {
    // Check if already imported
    const existing = this.sessions.get(cliSessionId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const session: Session = {
      id: cliSessionId, // Use CLI UUID as our session ID too
      sdkSessionId: cliSessionId, // Same UUID for resume
      directory,
      label: cleanLabel(label) || label,
      createdAt: now,
      lastActivity: now,
      messageBuffer,
      isProcessing: false,
    };
    this.sessions.set(cliSessionId, session);
    this.saveToDisk();
    return session;
  }

  /**
   * Check if the session has a pending AskUserQuestion (tool_use_start with no matching result).
   */
  isWaitingOnUser(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    const buf = session.messageBuffer;

    // Walk backwards to find the last tool_use_start
    for (let i = buf.length - 1; i >= 0; i--) {
      const e = buf[i];
      if (e.type === "tool_result") {
        // Found a result before finding an unmatched tool_use — not waiting
        return false;
      }
      if (e.type === "tool_use_start" && e.toolName === "AskUserQuestion") {
        return true;
      }
      if (e.type === "tool_use_start") {
        return false;
      }
    }
    return false;
  }

  getMessagePreview(id: string): string {
    const session = this.sessions.get(id);
    if (!session) return "";
    // Show last user message as preview
    const userMessages = session.messageBuffer.filter(
      (e) => e.type === "user_message"
    );
    if (userMessages.length === 0) return "New session";
    const last = userMessages[userMessages.length - 1];
    const text = (last.text as string) || "";
    return text.length > 80 ? text.slice(0, 80) + "..." : text;
  }

  saveToDisk() {
    if (!existsSync(STORAGE_DIR)) {
      mkdirSync(STORAGE_DIR, { recursive: true });
    }
    const persisted: PersistedSession[] = [];
    for (const session of this.sessions.values()) {
      persisted.push({
        id: session.id,
        sdkSessionId: session.sdkSessionId,
        directory: session.directory,
        label: session.label,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
        messageBuffer: session.messageBuffer,
      });
    }
    writeFileSync(SESSIONS_FILE, JSON.stringify(persisted, null, 2));
  }

  private loadFromDisk() {
    if (!existsSync(SESSIONS_FILE)) return;
    try {
      const raw = readFileSync(SESSIONS_FILE, "utf-8");
      const persisted: PersistedSession[] = JSON.parse(raw);
      let needsSave = false;
      for (const p of persisted) {
        const cleaned = cleanLabel(p.label);
        if (cleaned !== p.label) {
          // Label had image refs stripped — try to recover from message buffer
          if (cleaned) {
            p.label = cleaned;
          } else {
            // Label was entirely an image ref — find first meaningful user text
            const msgs = p.messageBuffer || [];
            const firstText = msgs
              .filter((e) => e.type === "user_message")
              .map((e) => cleanLabel((e.text as string) || ""))
              .find((t) => t);
            p.label = firstText
              ? (firstText.length > 60 ? firstText.slice(0, 60) + "..." : firstText)
              : p.label; // keep original if nothing found
          }
          needsSave = true;
        }
        this.sessions.set(p.id, {
          ...p,
          messageBuffer: p.messageBuffer || [],
          isProcessing: false,
        });
      }
      // Clean up empty web sessions (no user messages, no SDK session)
      let cleaned = 0;
      for (const p of persisted) {
        const session = this.sessions.get(p.id);
        if (!session) continue;
        const isWebCreated = !session.sdkSessionId || session.sdkSessionId !== session.id;
        const hasUserMessages = session.messageBuffer.some(
          (e) => e.type === "user_message"
        );
        if (isWebCreated && !hasUserMessages) {
          this.sessions.delete(p.id);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        needsSave = true;
        log.info(`Cleaned up ${cleaned} empty sessions`);
      }

      if (needsSave) this.saveToDisk();
      log.info(`Loaded ${persisted.length - cleaned} sessions from disk`);
    } catch (err) {
      log.warn("Failed to load sessions from disk", { error: (err as Error).message });
    }
  }
}

export const sessionManager = new SessionManager();
