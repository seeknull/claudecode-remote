import { Router, Request, Response } from "express";
import { sessionManager } from "../session-manager.js";
import { listCliSessions, discoverDirectories } from "../claude-session-scanner.js";
import { preferencesManager } from "../preferences-manager.js";
import { createLogger } from "../logger.js";

const log = createLogger("session");

export function createSessionsRouter(): Router {
  const router = Router();

  router.get("/", (req: Request, res: Response) => {
    const directory = req.query.directory as string;
    if (!directory) {
      res.status(400).json({ error: "directory query param required" });
      return;
    }

    // No longer require whitelisting — any discovered directory is valid

    // Web-created sessions (includes imported CLI sessions)
    const webSessions = sessionManager.listByDirectory(directory).map((s) => {
      const messageCount = s.messageBuffer.filter(
        (e) => e.type === "user_message" || e.type === "assistant_text"
      ).length;
      return {
        id: s.id,
        label: s.label,
        directory: s.directory,
        createdAt: s.createdAt,
        lastActivity: s.lastActivity,
        messagePreview: sessionManager.getMessagePreview(s.id),
        isProcessing: s.isProcessing,
        messageCount,
        waitingOnUser: sessionManager.isWaitingOnUser(s.id),
        // Imported CLI sessions have sdkSessionId === id
        source: (s.sdkSessionId === s.id ? "cli" : "web") as "cli" | "web",
        starred: preferencesManager.isSessionStarred(s.id),
        hidden: preferencesManager.isSessionHidden(s.id),
        hasUnread: messageCount > preferencesManager.getLastSeen(s.id),
      };
    });

    // CLI/VSCode sessions from ~/.claude/projects/
    const cliSessions = listCliSessions(directory).map((s) => ({
      id: s.id,
      label: s.label,
      directory: s.directory,
      createdAt: s.createdAt,
      lastActivity: s.lastActivity,
      messagePreview: s.messagePreview,
      isProcessing: false,
      messageCount: s.messageCount,
      waitingOnUser: s.waitingOnUser,
      source: "cli" as const,
      starred: preferencesManager.isSessionStarred(s.id),
      hidden: preferencesManager.isSessionHidden(s.id),
      hasUnread: s.messageCount > preferencesManager.getLastSeen(s.id),
    }));

    // Filter out CLI sessions that are already registered as web sessions
    // (a web session stores sdkSessionId which is the CLI UUID)
    const webSdkIds = new Set(
      sessionManager.listByDirectory(directory)
        .map((s) => s.sdkSessionId)
        .filter(Boolean)
    );
    const webIds = new Set(webSessions.map((s) => s.id));
    const uniqueCliSessions = cliSessions.filter(
      (s) => !webSdkIds.has(s.id) && !webIds.has(s.id)
    );

    // Merge and sort by last activity
    const all = [...webSessions, ...uniqueCliSessions].sort(
      (a, b) =>
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );

    log.debug(`Listed ${webSessions.length} web + ${uniqueCliSessions.length} CLI sessions`, {
      directory,
    });

    res.json(all);
  });

  router.post("/", (req: Request, res: Response) => {
    const { directory, label } = req.body;
    if (!directory) {
      res.status(400).json({ error: "directory is required" });
      return;
    }

    const session = sessionManager.create(directory, label);
    log.info("Session created", {
      sessionId: session.id,
      directory: session.directory,
    });
    res.status(201).json({
      id: session.id,
      label: session.label,
      directory: session.directory,
      createdAt: session.createdAt,
      source: "web",
    });
  });

  // Direct session lookup by ID (checks web sessions, then scans CLI sessions)
  router.get("/:id", (req: Request, res: Response) => {
    const { id } = req.params;

    // Check web sessions first
    const webSession = sessionManager.get(id);
    if (webSession) {
      res.json({
        id: webSession.id,
        label: webSession.label,
        directory: webSession.directory,
        source: webSession.sdkSessionId === webSession.id ? "cli" : "web",
      });
      return;
    }

    // Scan CLI sessions across all discovered directories
    const dirs = discoverDirectories();
    for (const dir of dirs) {
      const cliSessions = listCliSessions(dir.path);
      const found = cliSessions.find((s) => s.id === id);
      if (found) {
        res.json({
          id: found.id,
          label: found.label,
          directory: found.directory,
          source: "cli",
        });
        return;
      }
    }

    res.status(404).json({ error: "Session not found" });
  });

  router.delete("/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    const session = sessionManager.get(id);
    const deleted = sessionManager.delete(id);
    if (!deleted) {
      log.warn("Delete failed: session not found", { sessionId: id });
      res.status(404).json({ error: "Session not found" });
      return;
    }
    log.info("Session deleted", {
      sessionId: id,
      directory: session?.directory,
    });
    res.json({ ok: true });
  });

  return router;
}
