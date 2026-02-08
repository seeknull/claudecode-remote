import { useState } from "react";
import MarkdownRenderer from "./MarkdownRenderer";

interface Props {
  toolName: string;
  input: any;
  output?: string;
  isError?: boolean;
  status: "running" | "done" | "error";
}

const TOOL_ICONS: Record<string, string> = {
  Read: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  Write: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
  Edit: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  Bash: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  Glob: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  Grep: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  WebSearch: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9",
  WebFetch: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
  Task: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
  TodoWrite: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  ExitPlanMode: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  EnterPlanMode: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
};

function getToolSummary(toolName: string, input: any): string {
  if (!input) return toolName;
  switch (toolName) {
    case "Read":
      return input.file_path || toolName;
    case "Write":
      return input.file_path || toolName;
    case "Edit":
      return input.file_path || toolName;
    case "Bash":
      return input.command
        ? input.command.length > 60
          ? input.command.slice(0, 60) + "..."
          : input.command
        : toolName;
    case "Glob":
      return input.pattern || toolName;
    case "Grep":
      return input.pattern || toolName;
    case "WebSearch":
      return input.query || toolName;
    case "WebFetch":
      return input.url || toolName;
    case "Task":
      return input.description || toolName;
    case "AskUserQuestion":
      return input.questions?.[0]?.question || toolName;
    case "ExitPlanMode":
      return "Accept this plan?";
    case "EnterPlanMode":
      return "Entering plan mode";
    default:
      return toolName;
  }
}

function AskUserQuestionView({ input }: { input: any }) {
  const questions = input?.questions;
  if (!Array.isArray(questions)) return null;

  return (
    <div className="space-y-3">
      {questions.map((q: any, i: number) => (
        <div key={i}>
          {q.header && (
            <span className="text-xs font-medium text-blue-300/60 uppercase tracking-wider">
              {q.header}
            </span>
          )}
          <p className="text-sm text-blue-200 mt-0.5">{q.question}</p>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {q.options?.map((opt: any) => (
              <span
                key={opt.label}
                className="px-2.5 py-1 text-xs rounded-md border border-gray-600 bg-gray-800/60 text-gray-300"
                title={opt.description}
              >
                {opt.label}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ExitPlanModeView({ input, status }: { input: any; status: string }) {
  const plan = input?.plan;
  if (!plan) return null;
  const waiting = status === "running";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-blue-300/60 uppercase tracking-wider">
          Plan
        </span>
        <span className={`text-xs font-medium ${waiting ? "text-blue-400 animate-pulse" : "text-gray-500"}`}>
          {waiting ? "Waiting for approval..." : "Accept this plan?"}
        </span>
      </div>
      <div className="max-h-80 overflow-y-auto rounded-md bg-gray-900/50 p-3 text-sm text-gray-300">
        <MarkdownRenderer content={plan} />
      </div>
    </div>
  );
}

function DiffView({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const oldLines = oldStr.split("\n");
  const newLines = newStr.split("\n");

  // Simple line-level diff: find common prefix/suffix, mark rest as changed
  let prefixLen = 0;
  while (
    prefixLen < oldLines.length &&
    prefixLen < newLines.length &&
    oldLines[prefixLen] === newLines[prefixLen]
  ) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < oldLines.length - prefixLen &&
    suffixLen < newLines.length - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const removedLines = oldLines.slice(prefixLen, oldLines.length - suffixLen);
  const addedLines = newLines.slice(prefixLen, newLines.length - suffixLen);
  const contextBefore = oldLines.slice(Math.max(0, prefixLen - 2), prefixLen);
  const contextAfter = oldLines.slice(oldLines.length - suffixLen, oldLines.length - suffixLen + 2);

  return (
    <pre className="text-xs p-2 rounded bg-gray-900/50 overflow-x-auto max-h-64 overflow-y-auto font-mono">
      {contextBefore.map((line, i) => (
        <div key={`ctx-b-${i}`} className="text-gray-500">{` ${line}`}</div>
      ))}
      {removedLines.map((line, i) => (
        <div key={`rem-${i}`} className="text-red-400 bg-red-900/20">{`-${line}`}</div>
      ))}
      {addedLines.map((line, i) => (
        <div key={`add-${i}`} className="text-green-400 bg-green-900/20">{`+${line}`}</div>
      ))}
      {contextAfter.map((line, i) => (
        <div key={`ctx-a-${i}`} className="text-gray-500">{` ${line}`}</div>
      ))}
    </pre>
  );
}

export default function ToolCall({
  toolName,
  input,
  output,
  isError,
  status,
}: Props) {
  const [expanded, setExpanded] = useState(toolName === "Edit" || toolName === "AskUserQuestion" || toolName === "ExitPlanMode");
  const iconPath = TOOL_ICONS[toolName] || TOOL_ICONS.Bash;
  const summary = getToolSummary(toolName, input);
  const isEditTool = toolName === "Edit" && input?.old_string != null && input?.new_string != null;

  return (
    <div
      className={`my-2 rounded-md border ${
        isError
          ? "border-red-800/50 bg-red-900/10"
          : "border-gray-700/50 bg-surface-lighter/50"
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-white/5 transition-colors rounded-md"
      >
        {/* Status indicator */}
        {status === "running" ? (
          <div className="w-4 h-4 flex-shrink-0">
            <svg className="animate-spin w-4 h-4 text-accent" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          </div>
        ) : (
          <svg
            className={`w-4 h-4 flex-shrink-0 ${
              isError ? "text-red-400" : "text-gray-400"
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={iconPath}
            />
          </svg>
        )}

        <span className="text-xs font-medium text-gray-400">{toolName}</span>
        <span className="text-xs text-gray-500 truncate flex-1">
          {summary}
        </span>

        <svg
          className={`w-3 h-3 text-gray-500 transition-transform flex-shrink-0 ${
            expanded ? "rotate-90" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-700/50 p-3 space-y-2">
          {toolName === "AskUserQuestion" && input?.questions ? (
            <AskUserQuestionView input={input} />
          ) : toolName === "ExitPlanMode" && input?.plan ? (
            <ExitPlanModeView input={input} status={status} />
          ) : isEditTool ? (
            <div>
              <div className="text-xs text-gray-500 mb-1">{input.file_path}</div>
              <DiffView oldStr={input.old_string} newStr={input.new_string} />
            </div>
          ) : input ? (
            <div>
              <div className="text-xs text-gray-500 mb-1">Input:</div>
              <pre className="text-xs text-gray-400 bg-gray-900/50 p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
                {typeof input === "string"
                  ? input
                  : JSON.stringify(input, null, 2)}
              </pre>
            </div>
          ) : null}
          {output && !isEditTool && (
            <div>
              <div className="text-xs text-gray-500 mb-1">Output:</div>
              <pre
                className={`text-xs p-2 rounded overflow-x-auto max-h-64 overflow-y-auto ${
                  isError
                    ? "text-red-400 bg-red-900/20"
                    : "text-gray-400 bg-gray-900/50"
                }`}
              >
                {output}
              </pre>
            </div>
          )}
          {status === "running" && !output && (
            <div className="text-xs text-gray-500 italic">Running...</div>
          )}
        </div>
      )}
    </div>
  );
}
