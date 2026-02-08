import { execSync } from "child_process";
import { createRequire } from "module";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { URL, fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import { loadRuntime, getPort } from "./config.js";
import { initAuth, authenticateHTTP, authenticateWS } from "./auth.js";
import { createAuthRouter } from "./routes/auth.js";
import { createDirectoriesRouter } from "./routes/directories.js";
import { createSessionsRouter } from "./routes/sessions.js";
import { createGitRouter } from "./routes/git.js";
import { handleWsConnection, initSdk, abortAllQueries } from "./ws/handler.js";
import { createLogger } from "./logger.js";

const log = createLogger("server");

// ── Preflight: verify Claude CLI is available ────────────────────
// The SDK spawns its own bundled cli.js, so check that it resolves.
try {
  const require = createRequire(import.meta.url);
  const sdkCliPath = join(dirname(require.resolve("@anthropic-ai/claude-agent-sdk")), "cli.js");
  const cliVersion = execSync(`node "${sdkCliPath}" --version`, { stdio: "pipe" }).toString().trim();
  log.info(`Claude Agent SDK CLI: ${cliVersion}`);
} catch {
  log.error(
    [
      "",
      "┌──────────────────────────────────────────────────────┐",
      "│  @anthropic-ai/claude-agent-sdk is not installed.    │",
      "│                                                      │",
      "│  Install it:                                         │",
      "│  $ npm install                                       │",
      "└──────────────────────────────────────────────────────┘",
      "",
    ].join("\n")
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────

// Initialize auth if already configured
const runtime = loadRuntime();
if (runtime) {
  initAuth(runtime.jwtSecret);
  log.info("Loaded existing configuration");
} else {
  log.info("No password configured — waiting for first-time setup via UI");
}

const app = express();
app.use(express.json());

// Public routes
app.use("/api/auth", createAuthRouter());

// Protected routes
app.use("/api/directories", authenticateHTTP, createDirectoriesRouter());
app.use("/api/sessions", authenticateHTTP, createSessionsRouter());
app.use("/api/git", authenticateHTTP, createGitRouter());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Serve built client in production
const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = join(__dirname, "../../client/dist");
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback — serve index.html for non-API routes
  app.get("*", (_req, res) => {
    res.sendFile(join(clientDist, "index.html"));
  });
  log.info("Serving client from " + clientDist);
}

const server = createServer(app);

// WebSocket server
const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const token = url.searchParams.get("token");

  if (!token || !authenticateWS(token)) {
    log.warn("WebSocket upgrade rejected: invalid token", {
      ip: request.socket.remoteAddress,
    });
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (ws) => {
  handleWsConnection(ws);
});

// Graceful shutdown for clean port release (needed for tsx watch restarts)
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) {
    // Already shutting down, force exit immediately
    process.exit(0);
  }
  shuttingDown = true;
  log.info("Shutting down...");
  // Abort all active SDK queries (kills spawned claude CLI child processes)
  abortAllQueries();
  wss.close();
  server.close(() => process.exit(0));
  // Force exit after 1s if still hanging
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Initialize SDK and start
const port = getPort();
async function start() {
  await initSdk();

  server.listen(port, () => {
    const w = 56;
    const pad = (s: string) => "│  " + s.padEnd(w - 4) + "│";
    const blank = pad("");
    const border = (c: string) => (c === "t" ? "┌" : "└") + "─".repeat(w - 2) + (c === "t" ? "┐" : "┘");
    const lines = [
      "",
      border("t"),
      pad("Claude Code Remote"),
      blank,
      pad(`Local:  http://localhost:${port}`),
      blank,
      pad("Expose via ngrok:"),
      pad(`$ ngrok http ${port}`),
      blank,
      pad("With a custom domain:"),
      pad(`$ ngrok http --domain=your-domain.ngrok-free.app ${port}`),
      blank,
      border("b"),
      "",
    ];
    log.info(lines.join("\n"));
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      const lines = [
        "",
        "┌──────────────────────────────────────────────┐",
        `│  Port ${port} is already in use.`.padEnd(47) + "│",
        "│                                              │",
        "│  Kill the process or use a different port:   │",
        `│  $ PORT=${port + 1} npm start`.padEnd(47) + "│",
        "│                                              │",
        "└──────────────────────────────────────────────┘",
        "",
      ];
      log.error(lines.join("\n"));
      process.exit(1);
    }
    throw err;
  });
}

start().catch((err) => {
  log.error(`Failed to start server: ${err.message}`);
  process.exit(1);
});
