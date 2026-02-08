import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { useSessionStore, DirectoryInfo } from "../stores/sessionStore";
import { useAuthStore } from "../stores/authStore";
import { encodeDir } from "../utils/url";

function collapsePath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}

function dirDisplayName(p: string): string {
  const parts = p.replace(/\/$/, "").split("/").filter(Boolean);
  if (parts.length <= 2) return parts.join("/");
  return parts.slice(-2).join("/");
}

export default function ProjectsPage() {
  const logout = useAuthStore((s) => s.logout);
  const { directories, setDirectories } = useSessionStore();
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<DirectoryInfo[]>("/directories")
      .then(setDirectories)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  return (
    <div className="h-screen flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-surface border-b border-gray-700/50 px-4 py-3 flex items-center flex-shrink-0">
        <h1 className="text-sm font-semibold text-gray-200 flex-1">Projects</h1>
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 text-gray-500 hover:text-gray-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-surface-lighter border border-gray-700/50 rounded-md shadow-xl z-20 py-1">
              <button
                onClick={() => { setMenuOpen(false); logout(); }}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-light transition-colors min-h-[44px] flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 bg-surface-lighter rounded-md animate-pulse"
                />
              ))}
            </div>
          ) : directories.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No projects found</p>
              <p className="text-sm mt-1">
                Use Claude Code CLI in a project to have it appear here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {directories.map((dir) => (
                <Link
                  key={dir.path}
                  to={`/projects/${encodeDir(dir.path)}`}
                  className="block w-full text-left p-4 rounded-md transition-colors
                             bg-surface-lighter hover:bg-surface-lighter/80
                             border border-gray-700/50 min-h-[48px]"
                >
                  <div className="flex items-center gap-3">
                    <svg
                      className="w-5 h-5 text-accent flex-shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-200 block">
                        {dirDisplayName(dir.path)}
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {collapsePath(dir.path)}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {dir.sessionCount} {dir.sessionCount === 1 ? "session" : "sessions"}
                      </p>
                    </div>
                    <svg
                      className="w-4 h-4 text-gray-600 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
