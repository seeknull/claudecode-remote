import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useChatStore } from "../stores/chatStore";
import { usePreferencesStore } from "../stores/preferencesStore";
import { WsClient } from "../api/ws";
import { api } from "../api/http";
import { decodeDir } from "../utils/url";
import MessageList from "../components/MessageList";
import ChatInput, { ImageAttachment } from "../components/ChatInput";
import Sidebar, { GitInfo } from "../components/Sidebar";
import PermissionPrompt from "../components/PermissionPrompt";
import UserQuestionPrompt from "../components/UserQuestionPrompt";
import PlanApprovalPrompt from "../components/PlanApprovalPrompt";
import DiffViewer from "../components/DiffViewer";
import ExportModal from "../components/ExportModal";

interface SessionMeta {
  id: string;
  label: string;
  directory: string;
  source?: "web" | "cli";
}

export default function ChatPage() {
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const {
    messages,
    isStreaming,
    wsConnected,
    isWatching,
    settings,
    sessionStats,
    permissionRequest,
    userQuestion,
    planApproval,
    setWsConnected,
    setSettings,
    clearMessages,
    processWsEvent,
    timeoutStuckTools,
  } = useChatStore();

  const wsRef = useRef<WsClient | null>(null);
  const sessionSourceRef = useRef<string | null>(null);
  const [sessionMeta, setSessionMeta] = useState<SessionMeta | null>(null);
  const [reconnectBanner, setReconnectBanner] = useState(false);
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [diffModal, setDiffModal] = useState<{ diff: string; fileName?: string } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Directory from URL
  const directory = projectId ? decodeDir(projectId) : sessionMeta?.directory || "";

  // Fetch session metadata
  useEffect(() => {
    if (!sessionId) return;
    setSessionMeta(null);
  }, [sessionId]);

  // WebSocket lifecycle
  useEffect(() => {
    if (!token || !sessionId) return;

    clearMessages();

    const ws = new WsClient(token, (connected) => {
      setWsConnected(connected);
      setReconnectBanner(!connected);

      if (connected) {
        ws.send({ type: "join", sessionId });
      }
    });

    const unsub = ws.onMessage((event) => {
      processWsEvent(event);
    });

    ws.connect();
    wsRef.current = ws;

    // Fetch session metadata via REST
    fetchSessionMeta(sessionId);

    return () => {
      if (useChatStore.getState().isWatching && sessionId) {
        ws.send({ type: "unwatch", sessionId });
      }
      unsub();
      ws.close();
      wsRef.current = null;

      // Auto-delete empty web sessions when leaving
      if (sessionSourceRef.current === "web") {
        const state = useChatStore.getState();
        const hasUserMessages = state.messages.some((m) => m.role === "user");
        if (!hasUserMessages) {
          // Fire-and-forget delete for sessions with no user messages
          api(`/sessions/${sessionId}`, { method: "DELETE" }).catch(() => {});
        }
      }
    };
  }, [token, sessionId]);

  // Periodic check for stuck tools
  useEffect(() => {
    const interval = setInterval(() => {
      timeoutStuckTools();
    }, 5000);

    return () => clearInterval(interval);
  }, [timeoutStuckTools]);

  const fetchSessionMeta = async (id: string) => {
    try {
      const meta = await api<SessionMeta>(`/sessions/${id}`);
      setSessionMeta(meta);
      sessionSourceRef.current = meta.source || null;
      const dir = projectId ? decodeDir(projectId) : meta.directory;
      if (dir) fetchGitInfo(dir);
    } catch {
      // Ignore — not critical
    }
  };

  const fetchGitInfo = async (dir: string) => {
    try {
      const info = await api<GitInfo>(`/git/status?directory=${encodeURIComponent(dir)}`);
      setGitInfo(info);
    } catch {
      setGitInfo(null);
    }
  };

  const handleRefreshGit = () => {
    if (directory) fetchGitInfo(directory);
  };

  const handleViewDiff = async (file?: string) => {
    if (!directory) return;
    try {
      const params = new URLSearchParams({ directory });
      if (file) params.set("file", file);
      const { diff } = await api<{ diff: string }>(`/git/diff?${params}`);
      setDiffModal({ diff, fileName: file });
    } catch {
      // Ignore
    }
  };

  const handleSend = (message: string, images?: ImageAttachment[]) => {
    wsRef.current?.send({
      type: "chat",
      sessionId,
      message,
      images: images?.map((img) => ({
        data: img.data,
        mimeType: img.mimeType,
      })),
      settings,
    });
  };

  const handleAbort = () => {
    wsRef.current?.send({
      type: "abort",
      sessionId,
    });
  };

  const handlePermissionResponse = (requestId: string, allowed: boolean) => {
    wsRef.current?.send({
      type: "permission_response",
      requestId,
      allowed,
    });
  };

  const handleUserQuestionResponse = (requestId: string, answers: Record<string, string>) => {
    wsRef.current?.send({
      type: "ask_user_response",
      requestId,
      answers,
    });
  };

  const handlePlanApprovalResponse = (requestId: string, approved: boolean, message?: string) => {
    wsRef.current?.send({
      type: "plan_approval_response",
      requestId,
      approved,
      message,
    });
  };

  const handleWatch = () => {
    if (isWatching) {
      wsRef.current?.send({ type: "unwatch", sessionId });
    } else {
      wsRef.current?.send({ type: "watch", sessionId });
    }
  };

  const handleReload = () => {
    wsRef.current?.send({ type: "reload", sessionId });
  };

  const { markRead } = usePreferencesStore();

  // Mark session as read when user is at bottom of messages
  const handleAtBottom = useCallback(() => {
    if (!sessionId) return;
    const msgs = useChatStore.getState().messages;
    const count = msgs.filter((m) => m.role === "user" || m.role === "assistant").length;
    if (count > 0) markRead(sessionId, count);
  }, [sessionId, markRead]);

  const handleBack = () => {
    if (projectId) {
      navigate(`/projects/${projectId}`);
    } else {
      navigate("/projects");
    }
  };

  const isCliSession = sessionMeta?.source === "cli";

  // Status dot for mobile header
  const statusDot = (() => {
    if (!wsConnected && reconnectBanner) return "bg-yellow-400 animate-pulse";
    if (!wsConnected) return "bg-red-500";
    if (isStreaming) return "bg-green-500 animate-pulse";
    return "bg-green-500";
  })();

  const statusTitle = (() => {
    if (!wsConnected && reconnectBanner) return "Reconnecting";
    if (!wsConnected) return "Disconnected";
    if (isStreaming) return "Processing";
    return "Connected";
  })();

  const sidebarProps = {
    sessionLabel: sessionMeta?.label || "Chat Session",
    directory,
    stats: sessionStats,
    settings,
    onSettingsChange: setSettings,
    wsConnected,
    isStreaming,
    gitInfo,
    onRefreshGit: handleRefreshGit,
    onViewDiff: handleViewDiff,
  };

  return (
    <div className={`h-screen flex flex-col md:flex-row ${drawerOpen ? "overflow-hidden" : ""}`}>
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar {...sidebarProps} />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-surface border-b border-gray-700/50 px-3 py-2 md:px-4 md:py-3 flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleBack}
            className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center md:min-h-0 md:min-w-0 md:p-1"
            title="Back to sessions"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            onClick={() => setExportModalOpen(true)}
            disabled={messages.length === 0}
            className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center md:min-h-0 md:min-w-0 md:p-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Share session"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          </button>

          <h1 className="text-sm font-medium text-gray-200 flex-1 flex items-center gap-2 min-w-0">
            <span className="truncate">{sessionMeta?.label || "Chat Session"}</span>
            {sessionMeta?.source && (
              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                sessionMeta.source === "cli"
                  ? "bg-purple-900/40 text-purple-400 border border-purple-700/50"
                  : "bg-blue-900/40 text-blue-400 border border-blue-700/50"
              }`}>
                {sessionMeta.source}
              </span>
            )}
          </h1>

          {/* Status dot (mobile only — desktop has sidebar) */}
          <span
            className={`w-2.5 h-2.5 rounded-full md:hidden ${statusDot}`}
            title={statusTitle}
          />

          {/* CLI controls */}
          {isCliSession && (
            <>
              <button
                onClick={handleReload}
                className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center md:min-h-0 md:min-w-0"
                title="Reload session from disk"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={handleWatch}
                className={`p-1.5 transition-colors flex items-center gap-1.5 rounded-md text-xs font-medium min-h-[44px] md:min-h-0 ${
                  isWatching
                    ? "text-green-400 bg-green-900/30 hover:bg-green-900/50"
                    : "text-gray-500 hover:text-gray-300"
                }`}
                title={isWatching ? "Stop watching" : "Watch for live updates"}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span className="hidden sm:inline">{isWatching ? "Watching" : "Watch"}</span>
              </button>
            </>
          )}

          {/* Info button (mobile only — opens drawer) */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Session info"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </header>

        {/* Reconnect banner */}
        {reconnectBanner && (
          <div className="bg-yellow-900/30 border-b border-yellow-800/50 px-4 py-2 text-xs text-yellow-400 flex items-center gap-2 flex-shrink-0">
            <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Reconnecting...
          </div>
        )}

        {/* Scrollable messages + prompts area */}
        <div className={`flex-1 min-h-0 overflow-y-auto flex flex-col ${!isCliSession ? 'pb-32' : ''}`}>
          <MessageList messages={messages} isStreaming={isStreaming} onAtBottom={handleAtBottom} />

          {/* Permission prompt */}
          {permissionRequest && (
            <PermissionPrompt
              request={permissionRequest}
              onRespond={handlePermissionResponse}
            />
          )}

          {/* AskUserQuestion interactive prompt */}
          {userQuestion && (
            <UserQuestionPrompt
              question={userQuestion}
              onRespond={handleUserQuestionResponse}
            />
          )}

          {/* Plan approval prompt */}
          {planApproval && (
            <PlanApprovalPrompt
              planApproval={planApproval}
              onRespond={handlePlanApprovalResponse}
            />
          )}
        </div>

        {/* Input — fixed at bottom, hidden for CLI sessions */}
        {!isCliSession && (
          <div className="fixed bottom-0 left-0 right-0 md:relative md:bottom-auto md:left-auto md:right-auto z-10">
            <ChatInput
              onSend={handleSend}
              onAbort={handleAbort}
              isStreaming={isStreaming}
              disabled={!wsConnected}
            />
          </div>
        )}
        {isCliSession && !isWatching && (
          <div className="border-t border-gray-700/50 px-4 py-3 text-center text-xs text-gray-500 flex-shrink-0">
            CLI session — read-only. Use Watch to see live updates.
          </div>
        )}
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <Sidebar
          {...sidebarProps}
          mobile
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {/* Diff viewer modal */}
      {diffModal && (
        <DiffViewer
          diff={diffModal.diff}
          fileName={diffModal.fileName}
          onClose={() => setDiffModal(null)}
        />
      )}

      {/* Export modal */}
      {exportModalOpen && sessionMeta && (
        <ExportModal
          sessionId={sessionId!}
          sessionLabel={sessionMeta.label}
          directory={sessionMeta.directory}
          createdAt={sessionMeta.source === 'cli' ? '' : new Date().toISOString()}
          messages={messages}
          stats={sessionStats}
          onClose={() => setExportModalOpen(false)}
        />
      )}
    </div>
  );
}
