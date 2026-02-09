import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PreferencesState {
  hiddenProjects: string[];   // directory paths
  starredProjects: string[];  // directory paths
  hiddenSessions: string[];   // session ids
  starredSessions: string[];  // session ids

  toggleHideProject: (path: string) => void;
  toggleStarProject: (path: string) => void;
  toggleHideSession: (id: string) => void;
  toggleStarSession: (id: string) => void;

  isProjectHidden: (path: string) => boolean;
  isProjectStarred: (path: string) => boolean;
  isSessionHidden: (id: string) => boolean;
  isSessionStarred: (id: string) => boolean;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      hiddenProjects: [],
      starredProjects: [],
      hiddenSessions: [],
      starredSessions: [],

      toggleHideProject: (path) =>
        set((s) => ({
          hiddenProjects: s.hiddenProjects.includes(path)
            ? s.hiddenProjects.filter((p) => p !== path)
            : [...s.hiddenProjects, path],
        })),

      toggleStarProject: (path) =>
        set((s) => ({
          starredProjects: s.starredProjects.includes(path)
            ? s.starredProjects.filter((p) => p !== path)
            : [...s.starredProjects, path],
        })),

      toggleHideSession: (id) =>
        set((s) => ({
          hiddenSessions: s.hiddenSessions.includes(id)
            ? s.hiddenSessions.filter((i) => i !== id)
            : [...s.hiddenSessions, id],
        })),

      toggleStarSession: (id) =>
        set((s) => ({
          starredSessions: s.starredSessions.includes(id)
            ? s.starredSessions.filter((i) => i !== id)
            : [...s.starredSessions, id],
        })),

      isProjectHidden: (path) => get().hiddenProjects.includes(path),
      isProjectStarred: (path) => get().starredProjects.includes(path),
      isSessionHidden: (id) => get().hiddenSessions.includes(id),
      isSessionStarred: (id) => get().starredSessions.includes(id),
    }),
    {
      name: "claude-remote-preferences",
    }
  )
);
