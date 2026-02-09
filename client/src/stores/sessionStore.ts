import { create } from "zustand";

export interface DirectoryInfo {
  path: string;
  label: string;
  sessionCount: number;
}

export interface SessionInfo {
  id: string;
  label: string;
  directory: string;
  createdAt: string;
  lastActivity: string;
  messagePreview: string;
  isProcessing: boolean;
  messageCount: number;
  waitingOnUser: boolean;
  source: "web" | "cli";
  starred: boolean;
  hidden: boolean;
  hasUnread: boolean;
}

interface SessionState {
  directories: DirectoryInfo[];
  sessions: SessionInfo[];
  setDirectories: (dirs: DirectoryInfo[]) => void;
  setSessions: (sessions: SessionInfo[]) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  directories: [],
  sessions: [],
  setDirectories: (directories) => set({ directories }),
  setSessions: (sessions) => set({ sessions }),
}));
