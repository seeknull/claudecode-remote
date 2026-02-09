import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createLogger } from "./logger.js";

const log = createLogger("prefs");

const STORAGE_DIR = join(homedir(), ".claude-code-remote");
const PREFS_FILE = join(STORAGE_DIR, "preferences.json");

interface Preferences {
  starredSessions: string[];
  hiddenSessions: string[];
  starredProjects: string[];
  hiddenProjects: string[];
  lastSeenMessageCount: Record<string, number>;
}

function emptyPrefs(): Preferences {
  return {
    starredSessions: [],
    hiddenSessions: [],
    starredProjects: [],
    hiddenProjects: [],
    lastSeenMessageCount: {},
  };
}

class PreferencesManager {
  private prefs: Preferences;

  constructor() {
    this.prefs = emptyPrefs();
    this.loadFromDisk();
  }

  get(): Preferences {
    return this.prefs;
  }

  // --- Sessions ---

  toggleStarSession(id: string): boolean {
    const idx = this.prefs.starredSessions.indexOf(id);
    if (idx >= 0) {
      this.prefs.starredSessions.splice(idx, 1);
      this.saveToDisk();
      return false;
    }
    this.prefs.starredSessions.push(id);
    this.saveToDisk();
    return true;
  }

  toggleHideSession(id: string): boolean {
    const idx = this.prefs.hiddenSessions.indexOf(id);
    if (idx >= 0) {
      this.prefs.hiddenSessions.splice(idx, 1);
      this.saveToDisk();
      return false;
    }
    this.prefs.hiddenSessions.push(id);
    this.saveToDisk();
    return true;
  }

  isSessionStarred(id: string): boolean {
    return this.prefs.starredSessions.includes(id);
  }

  isSessionHidden(id: string): boolean {
    return this.prefs.hiddenSessions.includes(id);
  }

  // --- Projects ---

  toggleStarProject(path: string): boolean {
    const idx = this.prefs.starredProjects.indexOf(path);
    if (idx >= 0) {
      this.prefs.starredProjects.splice(idx, 1);
      this.saveToDisk();
      return false;
    }
    this.prefs.starredProjects.push(path);
    this.saveToDisk();
    return true;
  }

  toggleHideProject(path: string): boolean {
    const idx = this.prefs.hiddenProjects.indexOf(path);
    if (idx >= 0) {
      this.prefs.hiddenProjects.splice(idx, 1);
      this.saveToDisk();
      return false;
    }
    this.prefs.hiddenProjects.push(path);
    this.saveToDisk();
    return true;
  }

  isProjectStarred(path: string): boolean {
    return this.prefs.starredProjects.includes(path);
  }

  isProjectHidden(path: string): boolean {
    return this.prefs.hiddenProjects.includes(path);
  }

  // --- Last seen ---

  setLastSeen(sessionId: string, count: number) {
    this.prefs.lastSeenMessageCount[sessionId] = count;
    this.saveToDisk();
  }

  getLastSeen(sessionId: string): number {
    return this.prefs.lastSeenMessageCount[sessionId] ?? 0;
  }

  // --- Persistence ---

  private saveToDisk() {
    if (!existsSync(STORAGE_DIR)) {
      mkdirSync(STORAGE_DIR, { recursive: true });
    }
    writeFileSync(PREFS_FILE, JSON.stringify(this.prefs, null, 2));
  }

  private loadFromDisk() {
    if (!existsSync(PREFS_FILE)) return;
    try {
      const raw = readFileSync(PREFS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      this.prefs = {
        ...emptyPrefs(),
        ...parsed,
      };
      log.info("Loaded preferences from disk");
    } catch (err) {
      log.warn("Failed to load preferences", { error: (err as Error).message });
    }
  }
}

export const preferencesManager = new PreferencesManager();
