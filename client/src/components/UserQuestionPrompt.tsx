import { useState } from "react";
import { useChatStore, UserQuestion } from "../stores/chatStore";

interface Props {
  question: UserQuestion;
  onRespond: (requestId: string, answers: Record<string, string>) => void;
}

export default function UserQuestionPrompt({ question, onRespond }: Props) {
  const clearUserQuestion = useChatStore((s) => s.clearUserQuestion);

  // Track selected option(s) per question index.
  // For single-select: stores the label string.
  // For multi-select: stores an array of label strings.
  const [selections, setSelections] = useState<Record<string, string | string[]>>({});

  const handleSelect = (qIndex: number, label: string, multiSelect: boolean) => {
    setSelections((prev) => {
      const key = String(qIndex);
      if (!multiSelect) {
        return { ...prev, [key]: label };
      }
      // Toggle selection for multi-select
      const current = (prev[key] as string[]) || [];
      const next = current.includes(label)
        ? current.filter((l) => l !== label)
        : [...current, label];
      return { ...prev, [key]: next };
    });
  };

  const handleSubmit = () => {
    // Flatten multi-select arrays to comma-separated strings for the server
    const answers: Record<string, string> = {};
    for (const [key, val] of Object.entries(selections)) {
      answers[key] = Array.isArray(val) ? val.join(", ") : val;
    }
    onRespond(question.requestId, answers);
    clearUserQuestion();
  };

  const allAnswered = question.questions.every((q, i) => {
    const sel = selections[String(i)];
    if (!sel) return false;
    if (q.multiSelect) return Array.isArray(sel) && sel.length > 0;
    return typeof sel === "string" && sel.length > 0;
  });

  return (
    <div className="sticky bottom-0 z-20 border-t border-blue-600/40 bg-blue-900/30 backdrop-blur-sm p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg
              className="w-5 h-5 text-blue-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            {question.questions.map((q, qIndex) => (
              <div key={qIndex}>
                {q.header && (
                  <span className="text-xs font-medium text-blue-300/60 uppercase tracking-wider">
                    {q.header}
                  </span>
                )}
                <p className="text-sm font-medium text-blue-200 mt-0.5">
                  {q.question}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {q.options.map((opt) => {
                    const sel = selections[String(qIndex)];
                    const isSelected = q.multiSelect
                      ? Array.isArray(sel) && sel.includes(opt.label)
                      : sel === opt.label;
                    return (
                      <button
                        key={opt.label}
                        onClick={() => handleSelect(qIndex, opt.label, q.multiSelect)}
                        className={`px-3 py-2.5 md:py-1.5 text-sm rounded-md border transition-colors text-left min-h-[44px] md:min-h-0 ${
                          isSelected
                            ? "border-blue-400 bg-blue-600/40 text-white"
                            : "border-gray-600 bg-gray-800/60 text-gray-300 hover:border-blue-500 hover:bg-gray-700/60"
                        }`}
                        title={opt.description}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                {/* Show description of selected option (single-select only) */}
                {!q.multiSelect && (() => {
                  const selected = q.options.find((o) => o.label === selections[String(qIndex)]);
                  return selected?.description ? (
                    <p className="text-xs text-blue-100/50 mt-1.5">{selected.description}</p>
                  ) : null;
                })()}
              </div>
            ))}
            {/* Mobile submit */}
            <button
              onClick={handleSubmit}
              disabled={!allAnswered}
              className={`w-full min-h-[44px] text-sm rounded font-medium transition-colors md:hidden ${
                allAnswered
                  ? "bg-blue-600 hover:bg-blue-500 text-white"
                  : "bg-gray-700 text-gray-500 cursor-not-allowed"
              }`}
            >
              Submit
            </button>
          </div>
          {/* Desktop submit */}
          <div className="flex-shrink-0 hidden md:block">
            <button
              onClick={handleSubmit}
              disabled={!allAnswered}
              className={`px-4 py-1.5 text-sm rounded font-medium transition-colors ${
                allAnswered
                  ? "bg-blue-600 hover:bg-blue-500 text-white"
                  : "bg-gray-700 text-gray-500 cursor-not-allowed"
              }`}
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
