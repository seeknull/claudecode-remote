import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { sessionManager, WsEvent } from "../session-manager.js";

import { createLogger } from "../logger.js";
import { parseCliSessionHistory, listCliSessions, discoverDirectories } from "../claude-session-scanner.js";
import { startWatching, stopWatching, isWatching, setWatcherBroadcast, stopAllWatchers } from "../jsonl-watcher.js";

const log = createLogger("ws");

// Track connected clients per session
const sessionClients = new Map<string, Set<WebSocket>>();
// Track active AbortControllers per session
const activeAborts = new Map<string, AbortController>();
// Track active query promises per session (for interrupt-and-send)
const activeQueries = new Map<string, Promise<void>>();
// Track pending permission requests — the promise resolve is called when client responds
const pendingPermissions = new Map<
  string,
  { resolve: (result: any) => void; sessionId: string }
>();

let sdkQuery: typeof import("@anthropic-ai/claude-agent-sdk").query | null = null;

export async function initSdk() {
  // Register watcher broadcast so file watcher can push events to WS clients
  setWatcherBroadcast(broadcast);

  try {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    sdkQuery = sdk.query;
    log.info("Claude Agent SDK loaded successfully");
  } catch (err) {
    log.error("Failed to load @anthropic-ai/claude-agent-sdk", {
      error: (err as Error).message,
    });
  }
}

function broadcast(sessionId: string, event: WsEvent) {
  const clients = sessionClients.get(sessionId);
  if (!clients) return;
  const msg = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function addClient(sessionId: string, ws: WebSocket) {
  let clients = sessionClients.get(sessionId);
  if (!clients) {
    clients = new Set();
    sessionClients.set(sessionId, clients);
  }
  clients.add(ws);
}

function removeClient(ws: WebSocket) {
  for (const [sessionId, clients] of sessionClients) {
    if (clients.delete(ws)) {
      const remaining = clients.size;
      log.debug("Client disconnected", { sessionId, clientsRemaining: remaining });
      if (remaining === 0) {
        sessionClients.delete(sessionId);

        // Resolve any pending permission/question promises for this session
        // to prevent the SDK from hanging forever
        for (const [requestId, pending] of pendingPermissions) {
          if (pending.sessionId === sessionId) {
            log.info("Denying pending permission — all clients disconnected", {
              requestId,
              sessionId,
            });
            pendingPermissions.delete(requestId);
            pending.resolve({ behavior: "deny", message: "Client disconnected" });
          }
        }

        // Clean up empty web sessions (no messages sent)
        const session = sessionManager.get(sessionId);
        if (session && session.sdkSessionId !== session.id) {
          // It's a web-created session — check if it has any user messages
          const hasUserMessages = session.messageBuffer.some(
            (e) => e.type === "user_message"
          );
          if (!hasUserMessages) {
            log.info("Deleting empty web session", { sessionId });
            sessionManager.delete(sessionId);
          }
        }
      }
    }
  }
}

function translateContentBlock(block: any): WsEvent | null {
  if (!block) return null;
  if (block.type === "text") {
    return { type: "assistant_text", text: block.text };
  }
  if (block.type === "thinking") {
    return { type: "thinking", text: block.thinking || block.text || "" };
  }
  if (block.type === "tool_use") {
    return {
      type: "tool_use_start",
      toolName: block.name,
      input: block.input,
      toolUseId: block.id,
    };
  }
  if (block.type === "tool_result") {
    return {
      type: "tool_result",
      toolUseId: block.tool_use_id,
      output: typeof block.content === "string"
        ? block.content
        : JSON.stringify(block.content),
      isError: block.is_error || false,
    };
  }
  return null;
}

function translateEvent(event: any): WsEvent[] {
  if (!event) return [];

  switch (event.type) {
    case "assistant": {
      // SDK wraps content blocks in event.message.content
      const contentBlocks = event.message?.content || event.content || [];
      const results: WsEvent[] = [];
      for (const block of contentBlocks) {
        const wsEvent = translateContentBlock(block);
        if (wsEvent) results.push(wsEvent);
      }
      return results;
    }

    case "user": {
      // SDK sends tool results as user messages with content blocks
      const contentBlocks = event.message?.content || event.content || [];
      const results: WsEvent[] = [];
      for (const block of contentBlocks) {
        const wsEvent = translateContentBlock(block);
        if (wsEvent) results.push(wsEvent);
      }
      return results;
    }

    case "system":
      return [];

    case "result":
      return [
        {
          type: "result",
          cost: event.cost_usd || 0,
          duration: event.duration_ms || 0,
          totalCost: event.total_cost_usd || 0,
          numTurns: event.num_turns || 0,
          usage: event.usage || null,
        },
      ];

    default: {
      // Handle bare content blocks (text, thinking, tool_use, tool_result)
      const wsEvent = translateContentBlock(event);
      return wsEvent ? [wsEvent] : [];
    }
  }
}

interface ImageInput {
  data: string; // base64
  mimeType: string;
}

async function runQuery(
  sessionId: string,
  userMessage: string,
  settings: { permissionMode?: string; model?: string },
  images?: ImageInput[]
) {
  const session = sessionManager.get(sessionId);
  if (!session) {
    log.error("Session not found for query", { sessionId });
    broadcast(sessionId, { type: "error", message: "Session not found" });
    return;
  }

  const ctx = {
    sessionId,
    sdkSessionId: session.sdkSessionId,
    directory: session.directory,
  };

  if (!sdkQuery) {
    log.error("SDK not available, cannot run query", ctx);
    broadcast(sessionId, {
      type: "error",
      message:
        "Claude Agent SDK not available. Make sure @anthropic-ai/claude-agent-sdk is installed and claude is logged in.",
    });
    return;
  }

  // If already processing, abort the current query first
  const existingAbort = activeAborts.get(sessionId);
  if (existingAbort) {
    log.info("Interrupting active query for new message", ctx);
    existingAbort.abort();
    try {
      await activeQueries.get(sessionId);
    } catch {
      // Ignore — abort errors are expected
    }
  }

  const hasImages = images && images.length > 0;
  log.info(`User message: "${userMessage.length > 120 ? userMessage.slice(0, 120) + "..." : userMessage}"`, {
    ...ctx,
    model: settings.model,
    permissionMode: settings.permissionMode,
    resuming: !!session.sdkSessionId,
    ...(hasImages ? { imageCount: images.length } : {}),
  });

  const abortController = new AbortController();
  activeAborts.set(sessionId, abortController);
  sessionManager.setProcessing(sessionId, true);
  broadcast(sessionId, { type: "status", isProcessing: true });

  // Store images as references (mimeType only) to avoid bloating the buffer with base64
  const userEvent: WsEvent = {
    type: "user_message",
    text: userMessage,
    timestamp: Date.now(),
    ...(hasImages ? { images: images.map((img) => ({ data: img.data, mimeType: img.mimeType })) } : {}),
  };
  sessionManager.appendEvent(sessionId, userEvent);
  broadcast(sessionId, userEvent);

  const options: any = {
    cwd: session.directory,
    abortController,
    maxTurns: 50,
  };

  const permMode = settings.permissionMode || "bypassPermissions";
  options.permissionMode = permMode;

  // Always register canUseTool so we can intercept AskUserQuestion (even in bypass mode).
  // When canUseTool is set, SDK adds --permission-prompt-tool stdio, routing all tool
  // permission checks through our callback.
  options.canUseTool = async (
    toolName: string,
    input: Record<string, unknown>,
    callOpts: { signal: AbortSignal }
  ) => {
    // Always intercept AskUserQuestion — show interactive prompt in web UI
    if (toolName === "AskUserQuestion") {
      const requestId = uuidv4();
      log.info("AskUserQuestion intercepted", { ...ctx, requestId });

      broadcast(sessionId, {
        type: "ask_user_question",
        requestId,
        questions: input.questions,
      });

      return new Promise<any>((resolve) => {
        pendingPermissions.set(requestId, { resolve, sessionId });

        const onAbort = () => {
          if (pendingPermissions.delete(requestId)) {
            resolve({ behavior: "deny", message: "Aborted" });
          }
        };
        callOpts.signal.addEventListener("abort", onAbort, { once: true });
      });
    }

    // Always intercept ExitPlanMode — show plan approval UI
    if (toolName === "ExitPlanMode") {
      const requestId = uuidv4();
      log.info("ExitPlanMode intercepted", { ...ctx, requestId });

      broadcast(sessionId, {
        type: "plan_approval",
        requestId,
        plan: input.plan || "",
        allowedPrompts: input.allowedPrompts || [],
      });

      return new Promise<any>((resolve) => {
        pendingPermissions.set(requestId, { resolve, sessionId });

        const onAbort = () => {
          if (pendingPermissions.delete(requestId)) {
            resolve({ behavior: "deny", message: "Aborted" });
          }
        };
        callOpts.signal.addEventListener("abort", onAbort, { once: true });
      });
    }

    // In bypass mode, auto-allow all other tools
    if (permMode === "bypassPermissions") {
      return { behavior: "allow", updatedInput: {} };
    }

    // Non-bypass modes: forward permission requests to the web client
    const requestId = uuidv4();
    log.info("Permission requested", { ...ctx, toolName, requestId });

    broadcast(sessionId, {
      type: "permission_request",
      requestId,
      toolName,
      input,
    });

    return new Promise<any>((resolve) => {
      pendingPermissions.set(requestId, { resolve, sessionId });

      const onAbort = () => {
        if (pendingPermissions.delete(requestId)) {
          resolve({ behavior: "deny", message: "Aborted" });
        }
      };
      callOpts.signal.addEventListener("abort", onAbort, { once: true });
    });
  };

  if (settings.model) {
    options.model = settings.model;
  }

  if (session.sdkSessionId) {
    options.resume = session.sdkSessionId;
  }

  const queryStartTime = Date.now();

  // Build prompt: string for text-only, async iterable for messages with images
  let prompt: any = userMessage;
  if (hasImages) {
    const contentBlocks: any[] = [];
    for (const img of images) {
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mimeType,
          data: img.data,
        },
      });
    }
    if (userMessage) {
      contentBlocks.push({ type: "text", text: userMessage });
    }
    async function* generateMessages() {
      yield {
        type: "user" as const,
        session_id: session!.sdkSessionId || "",
        message: {
          role: "user" as const,
          content: contentBlocks,
        },
        parent_tool_use_id: null,
      };
    }
    prompt = generateMessages();
  }

  const queryPromise = (async () => {
    try {
      for await (const event of sdkQuery!({
        prompt,
        options,
      })) {
        // Capture SDK session ID from init event
        if (
          event.type === "system" &&
          (event as any).subtype === "init" &&
          (event as any).session_id
        ) {
          const newSdkId = (event as any).session_id;
          sessionManager.updateSdkSessionId(sessionId, newSdkId);
          log.info("SDK session initialized", {
            sessionId,
            sdkSessionId: newSdkId,
            directory: session.directory,
          });
        }

        const wsEvents = translateEvent(event);
        for (const wsEvent of wsEvents) {
          // Log tool usage
          if (wsEvent.type === "tool_use_start") {
            log.info(`Tool call: ${wsEvent.toolName}`, {
              ...ctx,
              toolUseId: wsEvent.toolUseId as string,
              input: wsEvent.input,
            });
          }
          if (wsEvent.type === "tool_result") {
            const isErr = wsEvent.isError as boolean;
            if (isErr) {
              log.warn("Tool returned error", {
                ...ctx,
                toolUseId: wsEvent.toolUseId as string,
              });
            } else {
              log.debug("Tool result received", {
                ...ctx,
                toolUseId: wsEvent.toolUseId as string,
              });
            }
          }

          sessionManager.appendEvent(sessionId, wsEvent);
          broadcast(sessionId, wsEvent);
        }
      }

      const elapsed = Date.now() - queryStartTime;
      log.info(`Query completed in ${elapsed}ms`, ctx);
    } catch (err: any) {
      if (err.name === "AbortError" || abortController.signal.aborted) {
        const elapsed = Date.now() - queryStartTime;
        log.info(`Query aborted after ${elapsed}ms`, ctx);
        broadcast(sessionId, {
          type: "assistant_text",
          text: "\n\n[Interrupted]",
        });
      } else {
        const stderr = err.stderr ? `\n${err.stderr}` : "";
        log.error(`Query failed: ${err.message}${stderr}`, ctx);
        const errEvent: WsEvent = {
          type: "error",
          message: err.message || "Unknown error",
        };
        sessionManager.appendEvent(sessionId, errEvent);
        broadcast(sessionId, errEvent);
      }
    } finally {
      activeAborts.delete(sessionId);
      activeQueries.delete(sessionId);
      sessionManager.setProcessing(sessionId, false);
      broadcast(sessionId, { type: "status", isProcessing: false });
    }
  })();

  activeQueries.set(sessionId, queryPromise);
}

function handleAbort(sessionId: string) {
  const session = sessionManager.get(sessionId);
  const abortController = activeAborts.get(sessionId);
  if (abortController) {
    log.info("Abort requested by user", {
      sessionId,
      directory: session?.directory,
    });
    abortController.abort();
  } else {
    log.debug("Abort requested but no active query", { sessionId });
  }
}

/**
 * Try to import a CLI/VSCode session into session-manager.
 * Scans all discovered directories for a matching session UUID.
 */
function tryImportCliSession(sessionId: string) {
  // We need to find which directory this CLI session belongs to
  // by scanning all discovered directories
  const dirs = discoverDirectories();

  for (const dir of dirs) {
    const cliSessions = listCliSessions(dir.path);
    const match = cliSessions.find((s) => s.id === sessionId);
    if (match) {
      log.info("Importing CLI session", {
        sessionId,
        directory: dir.path,
        label: match.label,
      });
      const history = parseCliSessionHistory(sessionId, dir.path);
      return sessionManager.importCliSession(
        sessionId,
        dir.path,
        match.label,
        history
      );
    }
  }
  return null;
}

/** Abort all active queries and stop watchers — used during server shutdown */
export function abortAllQueries() {
  for (const [sessionId, abort] of activeAborts) {
    log.info("Aborting query for shutdown", { sessionId });
    abort.abort();
  }
  activeAborts.clear();
  activeQueries.clear();
  stopAllWatchers();
}

export function handleWsConnection(ws: WebSocket) {
  log.info("New WebSocket connection");

  ws.on("message", (data) => {
    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      log.warn("Received invalid JSON from client");
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    switch (msg.type) {
      case "join": {
        let session = sessionManager.get(msg.sessionId);

        // If not found, try to import as a CLI/VSCode session
        if (!session) {
          session = tryImportCliSession(msg.sessionId) ?? undefined;
        }

        if (!session) {
          log.warn("Client tried to join non-existent session", {
            sessionId: msg.sessionId,
          });
          ws.send(
            JSON.stringify({ type: "error", message: "Session not found" })
          );
          return;
        }

        addClient(msg.sessionId, ws);

        // For CLI sessions, re-parse the JSONL so we always show the latest history.
        // The messageBuffer from import time goes stale as the CLI keeps writing.
        const isCliSession = session.sdkSessionId === session.id;
        let historyToSend = session.messageBuffer;
        if (isCliSession) {
          try {
            const freshHistory = parseCliSessionHistory(msg.sessionId, session.directory);
            if (freshHistory.length > 0) {
              session.messageBuffer = freshHistory;
              historyToSend = freshHistory;
            }
          } catch (err) {
            log.warn("Failed to re-parse CLI session JSONL on join", {
              sessionId: msg.sessionId,
              error: (err as Error).message,
            });
          }
        }

        const historyCount = historyToSend.length;
        log.info("Client joined session", {
          sessionId: msg.sessionId,
          directory: session.directory,
          historyEvents: historyCount,
          isProcessing: session.isProcessing,
          source: isCliSession ? "cli" : "web",
        });

        ws.send(
          JSON.stringify({
            type: "history",
            messages: historyToSend,
          })
        );
        ws.send(
          JSON.stringify({
            type: "status",
            isProcessing: session.isProcessing,
          })
        );
        // Tell the client whether this session is currently being watched
        ws.send(
          JSON.stringify({
            type: "watch_status",
            watching: isWatching(msg.sessionId),
          })
        );
        break;
      }

      case "chat": {
        if (!msg.sessionId || !msg.message) {
          log.warn("Chat message missing required fields", {
            hasSessionId: !!msg.sessionId,
            hasMessage: !!msg.message,
          });
          ws.send(
            JSON.stringify({
              type: "error",
              message: "sessionId and message required",
            })
          );
          return;
        }

        // Block chat on CLI sessions — they are read-only in the web UI
        const chatSession = sessionManager.get(msg.sessionId);
        if (chatSession && chatSession.sdkSessionId === chatSession.id) {
          log.warn("Blocked chat on CLI session (read-only)", { sessionId: msg.sessionId });
          ws.send(JSON.stringify({
            type: "error",
            message: "CLI sessions are read-only. Create a new web session to interact.",
          }));
          return;
        }

        addClient(msg.sessionId, ws);
        runQuery(msg.sessionId, msg.message, msg.settings || {}, msg.images);
        break;
      }

      case "abort": {
        if (msg.sessionId) {
          handleAbort(msg.sessionId);
        }
        break;
      }

      case "permission_response": {
        const pending = pendingPermissions.get(msg.requestId);
        if (!pending) {
          log.warn("Permission response for unknown request", {
            requestId: msg.requestId,
          });
          return;
        }
        pendingPermissions.delete(msg.requestId);
        if (msg.allowed) {
          log.info("Permission granted", {
            requestId: msg.requestId,
            sessionId: pending.sessionId,
          });
          pending.resolve({
            behavior: "allow",
            updatedInput: msg.updatedInput || {},
          });
        } else {
          log.info("Permission denied", {
            requestId: msg.requestId,
            sessionId: pending.sessionId,
          });
          pending.resolve({
            behavior: "deny",
            message: msg.message || "Denied by user",
          });
        }
        break;
      }

      case "ask_user_response": {
        const pending = pendingPermissions.get(msg.requestId);
        if (!pending) {
          log.warn("AskUserQuestion response for unknown request", {
            requestId: msg.requestId,
          });
          return;
        }
        pendingPermissions.delete(msg.requestId);
        log.info("AskUserQuestion answered", {
          requestId: msg.requestId,
          sessionId: pending.sessionId,
        });
        // Return the user's answers in updatedInput so the CLI gets them
        pending.resolve({
          behavior: "allow",
          updatedInput: { ...msg.answers },
        });
        break;
      }

      case "plan_approval_response": {
        const pending = pendingPermissions.get(msg.requestId);
        if (!pending) {
          log.warn("Plan approval response for unknown request", {
            requestId: msg.requestId,
          });
          return;
        }
        pendingPermissions.delete(msg.requestId);
        if (msg.approved) {
          log.info("Plan approved", {
            requestId: msg.requestId,
            sessionId: pending.sessionId,
          });
          pending.resolve({
            behavior: "allow",
            updatedInput: {},
          });
        } else {
          log.info("Plan rejected", {
            requestId: msg.requestId,
            sessionId: pending.sessionId,
            message: msg.message,
          });
          pending.resolve({
            behavior: "deny",
            message: msg.message || "User wants to keep planning",
          });
        }
        break;
      }

      case "watch": {
        const session = sessionManager.get(msg.sessionId);
        if (!session) {
          ws.send(JSON.stringify({ type: "error", message: "Session not found" }));
          return;
        }
        addClient(msg.sessionId, ws);
        const started = startWatching(msg.sessionId, session.directory);
        if (!started) {
          ws.send(JSON.stringify({
            type: "error",
            message: "Cannot watch — JSONL file not found for this session",
          }));
        }
        break;
      }

      case "unwatch": {
        if (msg.sessionId) {
          stopWatching(msg.sessionId);
        }
        break;
      }

      case "reload": {
        // Re-parse the full JSONL file and send fresh history
        const session = sessionManager.get(msg.sessionId);
        if (!session) {
          ws.send(JSON.stringify({ type: "error", message: "Session not found" }));
          return;
        }
        log.info("Reload requested", { sessionId: msg.sessionId });
        const freshHistory = parseCliSessionHistory(msg.sessionId, session.directory);
        // Update the session's message buffer with fresh data
        session.messageBuffer = freshHistory;
        // Send fresh history to ALL clients on this session
        broadcast(msg.sessionId, {
          type: "history",
          messages: freshHistory,
        } as any);
        break;
      }

      default:
        log.warn(`Unknown WS message type: ${msg.type}`);
        ws.send(
          JSON.stringify({
            type: "error",
            message: `Unknown type: ${msg.type}`,
          })
        );
    }
  });

  ws.on("close", () => {
    removeClient(ws);
  });

  ws.on("error", (err) => {
    log.error(`WebSocket error: ${err.message}`);
    removeClient(ws);
  });
}
