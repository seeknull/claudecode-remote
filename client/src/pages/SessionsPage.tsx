import { useEffect, useState, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../api/http";
import { useSessionStore, SessionInfo } from "../stores/sessionStore";
import { useAuthStore } from "../stores/authStore";
import { decodeDir } from "../utils/url";

function collapsePath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}

function dirDisplayName(p: string): string {
  const parts = p.replace(/\/$/, "").split("/").filter(Boolean);
  if (parts.length <= 2) return parts.join("/");
  return parts.slice(-2).join("/");
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

function SessionCard({
  session,
  projectId,
  onDelete,
}: {
  session: SessionInfo;
  projectId: string;
  onDelete: (id: string, e: React.MouseEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const toggleExpand = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const statusLabel = session.waitingOnUser
    ? "Waiting for input"
    : session.isProcessing
    ? "Processing"
    : "Idle";

  const statusColor = session.waitingOnUser
    ? "text-yellow-400"
    : session.isProcessing
    ? "text-accent"
    : "text-gray-500";

  return (
    <div className="bg-surface-lighter rounded-md border border-gray-700/50 transition-colors group">
      <Link
        to={`/projects/${projectId}/${session.id}`}
        className="block w-full text-left p-4 min-h-[48px]"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {/* Source icon */}
              {session.source === "cli" ? (
                <span className="flex-shrink-0" title="CLI / VS Code session">
                  <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </span>
              ) : (
                <span className="flex-shrink-0" title="Web session">
                  <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </span>
              )}
              <span className="text-sm font-medium text-gray-200 truncate">
                {session.label}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1 truncate pl-6">
              {session.messagePreview}
            </p>
          </div>
          <div className="flex items-center gap-1 ml-3 flex-shrink-0">
            <span className="text-xs text-gray-500">
              {formatDate(session.lastActivity)}
            </span>
            {/* Delete button for web sessions */}
            {session.source === "web" && (
              <button
                onClick={(e) => onDelete(session.id, e)}
                className="p-1.5 text-gray-600 hover:text-red-400 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Delete session"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            {/* Expand button */}
            <button
              onClick={toggleExpand}
              className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              title={expanded ? "Collapse" : "Details"}
            >
              <svg
                className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </Link>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-3 pt-0 border-t border-gray-700/30 mt-0">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-3 text-xs">
            <div>
              <span className="text-gray-600">Status</span>
              <p className={`font-medium ${statusColor}`}>
                {session.waitingOnUser && (
                  <span className="inline-block w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse mr-1 align-middle" />
                )}
                {session.isProcessing && !session.waitingOnUser && (
                  <span className="inline-block w-1.5 h-1.5 bg-accent rounded-full animate-pulse mr-1 align-middle" />
                )}
                {statusLabel}
              </p>
            </div>
            <div>
              <span className="text-gray-600">Messages</span>
              <p className="text-gray-300">{session.messageCount}</p>
            </div>
            <div>
              <span className="text-gray-600">Source</span>
              <p className="text-gray-300">{session.source === "cli" ? "CLI / VS Code" : "Web"}</p>
            </div>
            <div>
              <span className="text-gray-600">Created</span>
              <p className="text-gray-300">{formatDate(session.createdAt)}</p>
            </div>
          </div>
          {session.source === "web" && (
            <div className="mt-3 pt-2 border-t border-gray-700/30">
              <button
                onClick={(e) => onDelete(session.id, e)}
                className="text-xs text-red-400 hover:text-red-300 transition-colors min-h-[44px] flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete session
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SessionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const { sessions, setSessions } = useSessionStore();
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const directory = projectId ? decodeDir(projectId) : "";

  useEffect(() => {
    if (!directory) return;
    setLoading(true);
    api<SessionInfo[]>(
      `/sessions?directory=${encodeURIComponent(directory)}`
    )
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [directory]);

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

  const createSession = async () => {
    if (!directory) return;
    try {
      const session = await api<{ id: string }>("/sessions", {
        method: "POST",
        body: JSON.stringify({ directory }),
      });
      navigate(`/projects/${projectId}/${session.id}`);
    } catch (err) {
      console.error("Failed to create session:", err);
    }
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api(`/sessions/${id}`, { method: "DELETE" });
      setSessions(sessions.filter((s) => s.id !== id));
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-surface border-b border-gray-700/50 px-4 py-3 flex items-center gap-2 flex-shrink-0">
        <Link
          to="/projects"
          className="p-1 text-gray-500 hover:text-gray-300 transition-colors min-h-[44px] flex items-center"
          title="Back to projects"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-gray-200 truncate">
            {dirDisplayName(directory)}
          </h1>
          <p className="text-xs text-gray-500 truncate">{collapsePath(directory)}</p>
        </div>
        <button
          onClick={createSession}
          className="p-2 bg-accent hover:bg-accent-hover rounded-md text-white transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          title="New session"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
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

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 bg-surface-lighter rounded-md animate-pulse"
                />
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No sessions yet</p>
              <p className="text-sm mt-1">
                Create a new session to start chatting
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  projectId={projectId!}
                  onDelete={deleteSession}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
