import { create } from "zustand";
import { api } from "../api/http";

interface ServerPreferences {
  starredSessions: string[];
  hiddenSessions: string[];
  starredProjects: string[];
  hiddenProjects: string[];
  lastSeenMessageCount: Record<string, number>;
}

interface PreferencesState {
  loaded: boolean;
  hiddenProjects: string[];
  starredProjects: string[];
  hiddenSessions: string[];
  starredSessions: string[];
  lastSeenMessageCount: Record<string, number>;

  fetchPreferences: () => Promise<void>;

  toggleHideProject: (path: string) => void;
  toggleStarProject: (path: string) => void;
  toggleHideSession: (id: string) => void;
  toggleStarSession: (id: string) => void;

  isProjectHidden: (path: string) => boolean;
  isProjectStarred: (path: string) => boolean;
  isSessionHidden: (id: string) => boolean;
  isSessionStarred: (id: string) => boolean;

  markRead: (sessionId: string, count: number) => void;
}

export const usePreferencesStore = create<PreferencesState>()((set, get) => ({
  loaded: false,
  hiddenProjects: [],
  starredProjects: [],
  hiddenSessions: [],
  starredSessions: [],
  lastSeenMessageCount: {},

  fetchPreferences: async () => {
    try {
      const prefs = await api<ServerPreferences>("/preferences");
      set({
        loaded: true,
        starredSessions: prefs.starredSessions,
        hiddenSessions: prefs.hiddenSessions,
        starredProjects: prefs.starredProjects,
        hiddenProjects: prefs.hiddenProjects,
        lastSeenMessageCount: prefs.lastSeenMessageCount,
      });
    } catch {
      set({ loaded: true });
    }
  },

  toggleHideProject: (path) => {
    const s = get();
    const isHidden = s.hiddenProjects.includes(path);
    set({
      hiddenProjects: isHidden
        ? s.hiddenProjects.filter((p) => p !== path)
        : [...s.hiddenProjects, path],
    });
    api("/preferences/hide-project", {
      method: "PUT",
      body: JSON.stringify({ path }),
    }).catch(() => {});
  },

  toggleStarProject: (path) => {
    const s = get();
    const isStarred = s.starredProjects.includes(path);
    set({
      starredProjects: isStarred
        ? s.starredProjects.filter((p) => p !== path)
        : [...s.starredProjects, path],
    });
    api("/preferences/star-project", {
      method: "PUT",
      body: JSON.stringify({ path }),
    }).catch(() => {});
  },

  toggleHideSession: (id) => {
    const s = get();
    const isHidden = s.hiddenSessions.includes(id);
    set({
      hiddenSessions: isHidden
        ? s.hiddenSessions.filter((i) => i !== id)
        : [...s.hiddenSessions, id],
    });
    api(`/preferences/hide-session/${id}`, { method: "PUT" }).catch(() => {});
  },

  toggleStarSession: (id) => {
    const s = get();
    const isStarred = s.starredSessions.includes(id);
    set({
      starredSessions: isStarred
        ? s.starredSessions.filter((i) => i !== id)
        : [...s.starredSessions, id],
    });
    api(`/preferences/star-session/${id}`, { method: "PUT" }).catch(() => {});
  },

  isProjectHidden: (path) => get().hiddenProjects.includes(path),
  isProjectStarred: (path) => get().starredProjects.includes(path),
  isSessionHidden: (id) => get().hiddenSessions.includes(id),
  isSessionStarred: (id) => get().starredSessions.includes(id),

  markRead: (sessionId, count) => {
    const prev = get().lastSeenMessageCount[sessionId] ?? 0;
    if (count <= prev) return;
    set((s) => ({
      lastSeenMessageCount: { ...s.lastSeenMessageCount, [sessionId]: count },
    }));
    api(`/preferences/last-seen/${sessionId}`, {
      method: "PUT",
      body: JSON.stringify({ count }),
    }).catch(() => {});
  },
}));
