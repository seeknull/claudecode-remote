import { WsEvent } from "./session-manager.js";

/**
 * Translate a single JSONL line from Claude's format into WsEvent[] format.
 * Shared between the session scanner and the file watcher.
 */
export function translateJsonlLine(obj: any): WsEvent[] {
  if (!obj || !obj.type) return [];

  switch (obj.type) {
    case "user": {
      const content = obj.message?.content;
      if (!Array.isArray(content)) return [];

      const events: WsEvent[] = [];
      for (const block of content) {
        if (block.type === "text") {
          events.push({
            type: "user_message",
            text: block.text,
            timestamp: obj.timestamp ? new Date(obj.timestamp).getTime() : Date.now(),
          });
        } else if (block.type === "tool_result") {
          events.push({
            type: "tool_result",
            toolUseId: block.tool_use_id,
            output: typeof block.content === "string"
              ? block.content
              : JSON.stringify(block.content),
            isError: block.is_error || false,
          });
        }
      }
      return events;
    }

    case "assistant": {
      const content = obj.message?.content;
      if (!Array.isArray(content)) return [];

      const events: WsEvent[] = [];
      for (const block of content) {
        if (block.type === "text") {
          events.push({ type: "assistant_text", text: block.text });
        } else if (block.type === "thinking") {
          events.push({ type: "thinking", text: block.thinking || block.text || "" });
        } else if (block.type === "tool_use") {
          events.push({
            type: "tool_use_start",
            toolName: block.name,
            input: block.input,
            toolUseId: block.id,
          });
        }
      }

      // Extract usage stats if present
      const usage = obj.message?.usage;
      if (usage) {
        events.push({
          type: "result",
          cost: 0,
          duration: 0,
          totalCost: 0,
          numTurns: 0,
          usage: {
            input_tokens: usage.input_tokens || 0,
            output_tokens: usage.output_tokens || 0,
            cache_read_input_tokens: usage.cache_read_input_tokens || 0,
            cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
          },
        });
      }
      return events;
    }

    case "result":
      return [
        {
          type: "result",
          cost: obj.cost_usd || 0,
          duration: obj.duration_ms || 0,
          totalCost: obj.total_cost_usd || 0,
          numTurns: obj.num_turns || 0,
          usage: obj.usage || null,
        },
      ];

    case "summary": {
      if (obj.summary) {
        return [{ type: "assistant_text", text: `*[Session summary: ${obj.summary}]*` }];
      }
      return [];
    }

    default:
      return [];
  }
}
