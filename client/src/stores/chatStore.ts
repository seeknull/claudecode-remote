import { create } from "zustand";

export interface ImageData {
  data: string;
  mimeType: string;
}

export type ChatMessage =
  | { id: string; role: "user"; text: string; images?: ImageData[] }
  | { id: string; role: "assistant"; text: string }
  | {
      id: string;
      role: "tool";
      toolName: string;
      toolUseId: string;
      input: any;
      output?: string;
      isError?: boolean;
      status: "running" | "done" | "error";
      timestamp?: number;
    }
  | { id: string; role: "thinking"; text: string }
  | { id: string; role: "error"; text: string };

interface ChatSettings {
  permissionMode: string;
  model: string;
}

export interface SessionStats {
  totalCost: number;
  totalDuration: number;
  totalTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  queryCount: number;
}

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
}

export interface UserQuestionOption {
  label: string;
  description: string;
}

export interface UserQuestionItem {
  question: string;
  header: string;
  options: UserQuestionOption[];
  multiSelect: boolean;
}

export interface UserQuestion {
  requestId: string;
  questions: UserQuestionItem[];
}

export interface PlanApproval {
  requestId: string;
  plan: string;
  allowedPrompts?: any[];
}

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  wsConnected: boolean;
  isWatching: boolean;
  settings: ChatSettings;
  sessionStats: SessionStats;
  permissionRequest: PermissionRequest | null;
  userQuestion: UserQuestion | null;
  planApproval: PlanApproval | null;
  setWsConnected: (connected: boolean) => void;
  setSettings: (settings: Partial<ChatSettings>) => void;
  clearMessages: () => void;
  processWsEvent: (event: any) => void;
  timeoutStuckTools: () => void;
  clearPermissionRequest: () => void;
  clearUserQuestion: () => void;
  clearPlanApproval: () => void;
}

let messageCounter = 0;
function nextId(): string {
  return `msg-${++messageCounter}`;
}

const emptyStats: SessionStats = {
  totalCost: 0,
  totalDuration: 0,
  totalTurns: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalCacheReadTokens: 0,
  totalCacheWriteTokens: 0,
  queryCount: 0,
};

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  wsConnected: false,
  isWatching: false,
  settings: {
    permissionMode: "bypassPermissions",
    model: "sonnet",
  },
  sessionStats: { ...emptyStats },
  permissionRequest: null,
  userQuestion: null,
  planApproval: null,

  setWsConnected: (connected) => set({ wsConnected: connected }),
  clearPermissionRequest: () => set({ permissionRequest: null }),
  clearUserQuestion: () => set({ userQuestion: null }),
  clearPlanApproval: () => set({ planApproval: null }),

  setSettings: (partial) =>
    set((state) => ({
      settings: { ...state.settings, ...partial },
    })),

  clearMessages: () => {
    messageCounter = 0;
    set({
      messages: [],
      sessionStats: { ...emptyStats },
      isWatching: false,
      permissionRequest: null,
      userQuestion: null,
      planApproval: null,
    });
  },

  timeoutStuckTools: () => {
    const state = get();
    const now = Date.now();
    const TOOL_TIMEOUT = 30000; // 30 seconds

    const msgs = [...state.messages];
    let hasChanges = false;

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      if (
        msg.role === "tool" &&
        msg.status === "running" &&
        now - (msg.timestamp || 0) > TOOL_TIMEOUT
      ) {
        msgs[i] = {
          ...msg,
          output: "Tool timed out - marked as complete",
          status: "done",
        };
        hasChanges = true;
      }
    }

    if (hasChanges) {
      set({ messages: msgs });
    }
  },

  processWsEvent: (event: any) => {
    const state = get();

    switch (event.type) {
      case "history": {
        // Bulk load from server replay
        const messages: ChatMessage[] = [];
        messageCounter = 0;
        const stats = { ...emptyStats };
        for (const e of event.messages || []) {
          // For tool_result, find and update the matching tool_use_start
          if (e.type === "tool_result" && e.toolUseId) {
            let matched = false;
            for (let i = messages.length - 1; i >= 0; i--) {
              const m = messages[i];
              if (m.role === "tool" && m.toolUseId === e.toolUseId) {
                messages[i] = {
                  ...m,
                  output: e.output,
                  isError: e.isError || false,
                  status: e.isError ? "error" : "done",
                };
                matched = true;
                break;
              }
            }
            if (!matched) {
              // Orphaned tool_result — show as standalone
              messages.push({
                id: nextId(),
                role: "tool",
                toolName: "result",
                toolUseId: e.toolUseId,
                input: null,
                output: e.output,
                isError: e.isError,
                status: e.isError ? "error" : "done",
              });
            }
          } else if (e.type === "assistant_text") {
            // Coalesce consecutive assistant_text events into one message
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.role === "assistant") {
              messages[messages.length - 1] = { ...lastMsg, text: lastMsg.text + e.text };
            } else {
              messages.push({ id: nextId(), role: "assistant", text: e.text });
            }
          } else if (e.type === "thinking") {
            // Coalesce consecutive thinking events into one message
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.role === "thinking") {
              messages[messages.length - 1] = { ...lastMsg, text: lastMsg.text + e.text };
            } else {
              messages.push({ id: nextId(), role: "thinking", text: e.text });
            }
          } else {
            const msg = eventToMessage(e);
            if (msg) messages.push(msg);
          }
          // Accumulate stats from result events in history
          if (e.type === "result") {
            const u = e.usage || {};
            stats.totalCost += e.totalCost || 0;
            stats.totalDuration += e.duration || 0;
            stats.totalTurns += e.numTurns || 0;
            stats.totalInputTokens += u.input_tokens || 0;
            stats.totalOutputTokens += u.output_tokens || 0;
            stats.totalCacheReadTokens += u.cache_read_input_tokens || 0;
            stats.totalCacheWriteTokens += u.cache_creation_input_tokens || 0;
            stats.queryCount += 1;
          }
        }
        // Mark any remaining "running" tools as done (from interrupted/aborted queries)
        for (let i = 0; i < messages.length; i++) {
          const m = messages[i];
          if (m.role === "tool" && m.status === "running") {
            messages[i] = { ...m, status: "done", output: m.output || "" };
          }
        }
        set({ messages, sessionStats: stats });
        break;
      }

      case "user_message": {
        set({
          messages: [
            ...state.messages,
            { id: nextId(), role: "user", text: event.text, images: event.images },
          ],
        });
        break;
      }

      case "assistant_text": {
        const msgs = [...state.messages];
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          // Append to existing assistant message (streaming)
          msgs[msgs.length - 1] = {
            ...lastMsg,
            text: lastMsg.text + event.text,
          };
        } else {
          // New assistant message
          msgs.push({ id: nextId(), role: "assistant", text: event.text });
        }
        set({ messages: msgs });
        break;
      }

      case "thinking": {
        const msgs = [...state.messages];
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.role === "thinking") {
          msgs[msgs.length - 1] = {
            ...lastMsg,
            text: lastMsg.text + event.text,
          };
        } else {
          msgs.push({ id: nextId(), role: "thinking", text: event.text });
        }
        set({ messages: msgs });
        break;
      }

      case "tool_use_start": {
        set({
          messages: [
            ...state.messages,
            {
              id: nextId(),
              role: "tool",
              toolName: event.toolName,
              toolUseId: event.toolUseId,
              input: event.input,
              status: "running",
              timestamp: Date.now(),
            },
          ],
        });
        break;
      }

      case "tool_result": {
        const msgs = [...state.messages];
        // Find the matching tool_use by toolUseId
        let foundMatch = false;
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i];
          if (
            m.role === "tool" &&
            m.toolUseId === event.toolUseId
          ) {
            msgs[i] = {
              ...m,
              output: event.output,
              isError: event.isError || false,
              status: event.isError ? "error" : "done",
            };
            foundMatch = true;
            break;
          }
        }

        // If no matching tool_use_start found, create a standalone tool result
        if (!foundMatch) {
          msgs.push({
            id: nextId(),
            role: "tool",
            toolName: "result",
            toolUseId: event.toolUseId,
            input: null,
            output: event.output,
            isError: event.isError || false,
            status: event.isError ? "error" : "done",
          });
        }

        set({ messages: msgs });
        break;
      }

      case "error": {
        set({
          messages: [
            ...state.messages,
            { id: nextId(), role: "error", text: event.message },
          ],
        });
        break;
      }

      case "status": {
        set({ isStreaming: event.isProcessing });
        break;
      }

      case "permission_request": {
        set({
          permissionRequest: {
            requestId: event.requestId,
            toolName: event.toolName,
            input: event.input,
          },
        });
        break;
      }

      case "ask_user_question": {
        set({
          userQuestion: {
            requestId: event.requestId,
            questions: event.questions,
          },
        });
        break;
      }

      case "plan_approval": {
        set({
          planApproval: {
            requestId: event.requestId,
            plan: event.plan,
            allowedPrompts: event.allowedPrompts,
          },
        });
        break;
      }

      case "watch_status": {
        set({ isWatching: event.watching });
        break;
      }

      case "result": {
        const usage = event.usage || {};
        const prev = state.sessionStats;
        set({
          isStreaming: false,
          sessionStats: {
            totalCost: prev.totalCost + (event.totalCost || 0),
            totalDuration: prev.totalDuration + (event.duration || 0),
            totalTurns: prev.totalTurns + (event.numTurns || 0),
            totalInputTokens: prev.totalInputTokens + (usage.input_tokens || 0),
            totalOutputTokens: prev.totalOutputTokens + (usage.output_tokens || 0),
            totalCacheReadTokens: prev.totalCacheReadTokens + (usage.cache_read_input_tokens || 0),
            totalCacheWriteTokens: prev.totalCacheWriteTokens + (usage.cache_creation_input_tokens || 0),
            queryCount: prev.queryCount + 1,
          },
        });
        break;
      }
    }
  },
}));

function eventToMessage(event: any): ChatMessage | null {
  switch (event.type) {
    case "user_message":
      return { id: nextId(), role: "user", text: event.text, images: event.images };
    case "assistant_text":
      return { id: nextId(), role: "assistant", text: event.text };
    case "thinking":
      return { id: nextId(), role: "thinking", text: event.text };
    case "tool_use_start":
      return {
        id: nextId(),
        role: "tool",
        toolName: event.toolName,
        toolUseId: event.toolUseId,
        input: event.input,
        status: "running",
        timestamp: Date.now(),
      };
    case "tool_result":
      // Try to find and update previous tool_use — but in history replay
      // tool_results come as standalone events. We'll render them inline.
      return {
        id: nextId(),
        role: "tool",
        toolName: "result",
        toolUseId: event.toolUseId,
        input: null,
        output: event.output,
        isError: event.isError,
        status: event.isError ? "error" : "done",
      };
    case "error":
      return { id: nextId(), role: "error", text: event.message };
    default:
      return null;
  }
}
