type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  sessionId?: string;
  sdkSessionId?: string;
  directory?: string;
  [key: string]: unknown;
}

const COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",  // gray
  info: "\x1b[36m",   // cyan
  warn: "\x1b[33m",   // yellow
  error: "\x1b[31m",  // red
};
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function formatTimestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 23);
}

function formatContext(ctx: LogContext): string {
  const parts: string[] = [];
  if (ctx.sessionId) parts.push(`session=${ctx.sessionId.slice(0, 8)}`);
  if (ctx.sdkSessionId) parts.push(`sdk=${ctx.sdkSessionId.slice(0, 8)}`);
  if (ctx.directory) parts.push(`dir=${ctx.directory}`);

  // Add any extra context fields
  for (const [key, value] of Object.entries(ctx)) {
    if (["sessionId", "sdkSessionId", "directory"].includes(key)) continue;
    if (value === undefined || value === null) continue;
    const str = typeof value === "string" ? value : JSON.stringify(value);
    const truncated = str.length > 100 ? str.slice(0, 100) + "..." : str;
    parts.push(`${key}=${truncated}`);
  }

  return parts.length > 0 ? ` ${DIM}[${parts.join(" ")}]${RESET}` : "";
}

function log(level: LogLevel, category: string, message: string, ctx: LogContext = {}) {
  const color = COLORS[level];
  const ts = formatTimestamp();
  const ctxStr = formatContext(ctx);
  const levelTag = level.toUpperCase().padEnd(5);
  console.log(
    `${DIM}${ts}${RESET} ${color}${levelTag}${RESET} ${BOLD}${category}${RESET} ${message}${ctxStr}`
  );
}

/** Create a scoped logger for a specific category (e.g., "ws", "auth", "session") */
export function createLogger(category: string) {
  return {
    debug: (message: string, ctx?: LogContext) => log("debug", category, message, ctx),
    info: (message: string, ctx?: LogContext) => log("info", category, message, ctx),
    warn: (message: string, ctx?: LogContext) => log("warn", category, message, ctx),
    error: (message: string, ctx?: LogContext) => log("error", category, message, ctx),
  };
}
