import { useState } from "react";
import { SessionStats } from "../stores/chatStore";

export interface GitFileStatus {
  file: string;
  status: string;
}

export interface GitInfo {
  isRepo: boolean;
  branch: string;
  files: GitFileStatus[];
}

interface Props {
  sessionLabel: string;
  directory: string;
  stats: SessionStats;
  settings: { permissionMode: string; model: string };
  onSettingsChange: (settings: Partial<{ permissionMode: string; model: string }>) => void;
  wsConnected: boolean;
  isStreaming: boolean;
  gitInfo: GitInfo | null;
  onRefreshGit: () => void;
  onViewDiff: (file?: string) => void;
  isCliSession?: boolean;
  mobile?: boolean;
  onClose?: () => void;
}

const PERMISSION_MODES = [
  { value: "bypassPermissions", label: "Bypass" },
  { value: "default", label: "Default" },
  { value: "plan", label: "Plan" },
];

const MODELS = [
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
  { value: "haiku", label: "Haiku" },
];

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n === 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function formatDuration(ms: number): string {
  if (ms === 0) return "0s";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.floor(s % 60);
  return `${m}m ${rem}s`;
}

function collapsePath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}

const STATUS_COLORS: Record<string, string> = {
  M: "text-yellow-400",
  A: "text-green-400",
  D: "text-red-400",
  "??": "text-gray-400",
  R: "text-blue-400",
  U: "text-orange-400",
};

function SidebarContent({
  sessionLabel,
  directory,
  stats,
  settings,
  onSettingsChange,
  wsConnected,
  isStreaming,
  gitInfo,
  onRefreshGit,
  onViewDiff,
  isCliSession,
}: Omit<Props, "mobile" | "onClose">) {
  return (
    <>
      {/* Session info */}
      <div className="px-4 py-3 border-b border-gray-700/50">
        <div className="text-sm text-gray-200 font-medium truncate" title={sessionLabel}>
          {sessionLabel}
        </div>
        <div className="text-xs text-gray-500 truncate mt-1" title={directory}>
          {collapsePath(directory)}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-xs text-gray-500">
            {wsConnected ? "Connected" : "Disconnected"}
          </span>
          {isStreaming && (
            <span className="text-xs text-accent flex items-center gap-1 ml-auto">
              <span className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
              Active
            </span>
          )}
        </div>
      </div>

      {/* Git info */}
      {gitInfo?.isRepo && (
        <div className="px-4 py-3 border-b border-gray-700/50">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Git</div>
            <button
              onClick={onRefreshGit}
              className="p-1 text-gray-500 hover:text-gray-300 transition-colors rounded hover:bg-surface-lighter min-h-[44px] min-w-[44px] flex items-center justify-center md:min-h-0 md:min-w-0 md:p-0.5"
              title="Refresh git status"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          {/* Branch */}
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-xs text-gray-300 font-mono truncate">{gitInfo.branch}</span>
          </div>

          {/* Modified files */}
          {gitInfo.files.length === 0 ? (
            <div className="text-xs text-gray-600 italic">Clean working tree</div>
          ) : (
            <>
              <button
                onClick={() => onViewDiff()}
                className="text-xs text-accent hover:text-accent-hover transition-colors mb-1.5"
              >
                View all changes ({gitInfo.files.length} files)
              </button>
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {gitInfo.files.map((f) => (
                  <button
                    key={f.file}
                    onClick={() => onViewDiff(f.file)}
                    className="w-full flex items-center gap-1.5 text-left py-1 px-1 rounded hover:bg-surface-lighter transition-colors group min-h-[36px] md:min-h-0 md:py-0.5"
                    title={f.file}
                  >
                    <span className={`text-[10px] font-mono font-bold w-4 text-center flex-shrink-0 ${STATUS_COLORS[f.status] || "text-gray-400"}`}>
                      {f.status}
                    </span>
                    <span className="text-xs text-gray-400 group-hover:text-gray-200 truncate transition-colors">
                      {f.file.split("/").pop()}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Usage stats */}
      <div className="px-4 py-3 border-b border-gray-700/50">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Usage</div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Cost</span>
            <span className="text-gray-300 font-mono">{formatCost(stats.totalCost)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Queries</span>
            <span className="text-gray-300 font-mono">{stats.queryCount}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Turns</span>
            <span className="text-gray-300 font-mono">{stats.totalTurns}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Duration</span>
            <span className="text-gray-300 font-mono">{formatDuration(stats.totalDuration)}</span>
          </div>
        </div>
      </div>

      {/* Token breakdown */}
      <div className="px-4 py-3 border-b border-gray-700/50">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Tokens</div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Input</span>
            <span className="text-gray-300 font-mono">{formatTokens(stats.totalInputTokens)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Output</span>
            <span className="text-gray-300 font-mono">{formatTokens(stats.totalOutputTokens)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Cache read</span>
            <span className="text-gray-300 font-mono">{formatTokens(stats.totalCacheReadTokens)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Cache write</span>
            <span className="text-gray-300 font-mono">{formatTokens(stats.totalCacheWriteTokens)}</span>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="px-4 py-3">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Settings</div>

        {/* Model select */}
        <div className="mb-3">
          <label className="text-xs text-gray-500 mb-1 block">Model</label>
          <select
            value={settings.model}
            onChange={(e) => onSettingsChange({ model: e.target.value })}
            className="w-full bg-surface-lighter border border-gray-600 rounded px-2 py-2
                       text-sm text-gray-200 focus:outline-none focus:border-accent min-h-[44px] md:min-h-0 md:py-1.5 md:text-xs"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Permission mode select */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Permission Mode</label>
          <select
            value={settings.permissionMode}
            onChange={(e) => onSettingsChange({ permissionMode: e.target.value })}
            className="w-full bg-surface-lighter border border-gray-600 rounded px-2 py-2
                       text-sm text-gray-200 focus:outline-none focus:border-accent min-h-[44px] md:min-h-0 md:py-1.5 md:text-xs"
          >
            {PERMISSION_MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        <p className="text-[10px] text-gray-600 mt-2">
          Applied on next message.
        </p>
      </div>
    </>
  );
}

export default function Sidebar(props: Props) {
  const { mobile, onClose, ...contentProps } = props;
  const [collapsed, setCollapsed] = useState(false);

  // Mobile: render as overlay drawer
  if (mobile) {
    return (
      <div className="fixed inset-0 z-40" onClick={onClose}>
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60" />
        {/* Panel */}
        <div
          className="absolute right-0 top-0 bottom-0 w-[85vw] max-w-sm bg-surface border-l border-gray-700/50 overflow-y-auto pb-20"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Session Info</span>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-300 transition-colors rounded hover:bg-surface-lighter min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <SidebarContent {...contentProps} />
        </div>
      </div>
    );
  }

  // Desktop: collapsible sidebar
  if (collapsed) {
    return (
      <div className="w-10 border-r border-gray-700/50 flex flex-col items-center py-3 flex-shrink-0">
        <button
          onClick={() => setCollapsed(false)}
          className="p-1.5 text-gray-500 hover:text-gray-300 transition-colors rounded hover:bg-surface-lighter"
          title="Expand sidebar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-gray-700/50 flex flex-col flex-shrink-0 overflow-y-auto">
      {/* Collapse button */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700/50">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Session</span>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 text-gray-500 hover:text-gray-300 transition-colors rounded hover:bg-surface-lighter"
          title="Collapse sidebar"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
      <SidebarContent {...contentProps} />
    </div>
  );
}
