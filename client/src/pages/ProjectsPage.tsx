import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/http";
import { useSessionStore, DirectoryInfo } from "../stores/sessionStore";
import { useAuthStore } from "../stores/authStore";
import { usePreferencesStore } from "../stores/preferencesStore";
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
  const [showHidden, setShowHidden] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    hiddenProjects,
    starredProjects,
    toggleHideProject,
    toggleStarProject,
    isProjectHidden,
    isProjectStarred,
  } = usePreferencesStore();

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

  // Sort: starred first, then by label/path
  const sortedDirs = [...directories].sort((a, b) => {
    const aStarred = isProjectStarred(a.path);
    const bStarred = isProjectStarred(b.path);
    if (aStarred && !bStarred) return -1;
    if (!aStarred && bStarred) return 1;
    return a.path.localeCompare(b.path);
  });

  const visibleDirs = showHidden
    ? sortedDirs
    : sortedDirs.filter((d) => !isProjectHidden(d.path));

  const hiddenCount = directories.filter((d) => isProjectHidden(d.path)).length;

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.preventDefault();
    e.stopPropagation();
    action();
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-surface border-b border-gray-700/50 px-4 py-3 flex items-center flex-shrink-0">
        <h1 className="text-sm font-semibold text-gray-200 flex-1">Projects</h1>
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowHidden(!showHidden)}
            className={`mr-2 px-2.5 py-1 text-xs rounded-md transition-colors min-h-[32px] ${
              showHidden
                ? "bg-accent/20 text-accent"
                : "text-gray-500 hover:text-gray-300"
            }`}
            title={showHidden ? "Hide hidden projects" : "Show hidden projects"}
          >
            {showHidden ? `Hide ${hiddenCount} hidden` : `${hiddenCount} hidden`}
          </button>
        )}
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
          ) : visibleDirs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No projects found</p>
              <p className="text-sm mt-1">
                {hiddenCount > 0
                  ? "All projects are hidden. Click the hidden button above to show them."
                  : "Use Claude Code CLI in a project to have it appear here"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleDirs.map((dir) => {
                const starred = isProjectStarred(dir.path);
                const hidden = isProjectHidden(dir.path);
                return (
                  <div key={dir.path} className="relative">
                    <Link
                      to={`/projects/${encodeDir(dir.path)}`}
                      className={`block w-full text-left p-4 rounded-md transition-colors
                                 border min-h-[48px]
                                 ${hidden
                                   ? "bg-surface-lighter/50 border-gray-700/30 opacity-60"
                                   : "bg-surface-lighter hover:bg-surface-lighter/80 border-gray-700/50"
                                 }`}
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
                          <div className="flex items-center gap-1.5">
                            {starred && (
                              <svg className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              </svg>
                            )}
                            <span className="text-sm font-medium text-gray-200 block truncate">
                              {dirDisplayName(dir.path)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {collapsePath(dir.path)}
                          </p>
                          <p className="text-xs text-gray-600 mt-1">
                            {dir.sessionCount} {dir.sessionCount === 1 ? "session" : "sessions"}
                          </p>
                        </div>
                        {/* Action buttons */}
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            onClick={(e) => handleAction(e, () => toggleStarProject(dir.path))}
                            className="p-1.5 text-gray-500 hover:text-yellow-400 transition-colors"
                            title={starred ? "Unstar" : "Star"}
                          >
                            <svg className="w-4 h-4" fill={starred ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => handleAction(e, () => toggleHideProject(dir.path))}
                            className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors"
                            title={hidden ? "Unhide" : "Hide"}
                          >
                            {hidden ? (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            )}
                          </button>
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
