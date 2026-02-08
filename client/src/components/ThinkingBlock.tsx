import { useState } from "react";

interface Props {
  text: string;
}

export default function ThinkingBlock({ text }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-400 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
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
        <span className="italic">Thinking...</span>
      </button>
      {expanded && (
        <div className="mt-1 pl-5 text-sm text-gray-500 italic whitespace-pre-wrap border-l border-gray-700/50">
          {text}
        </div>
      )}
    </div>
  );
}
