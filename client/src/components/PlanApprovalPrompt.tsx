import { useState } from "react";
import { useChatStore, PlanApproval } from "../stores/chatStore";
import MarkdownRenderer from "./MarkdownRenderer";

interface Props {
  planApproval: PlanApproval;
  onRespond: (requestId: string, approved: boolean, message?: string) => void;
}

export default function PlanApprovalPrompt({ planApproval, onRespond }: Props) {
  const clearPlanApproval = useChatStore((s) => s.clearPlanApproval);
  const [customText, setCustomText] = useState("");

  const handleApprove = () => {
    onRespond(planApproval.requestId, true);
    clearPlanApproval();
  };

  const handleReject = (message?: string) => {
    onRespond(planApproval.requestId, false, message || "User wants to keep planning");
    clearPlanApproval();
    setCustomText("");
  };

  const handleCustomSubmit = () => {
    if (customText.trim()) {
      handleReject(customText.trim());
    }
  };

  return (
    <div className="sticky bottom-0 z-20 border-t border-blue-600/40 bg-gray-900/95 backdrop-blur-sm">
      <div className="max-w-3xl mx-auto p-4">
        <div className="flex items-center gap-2 mb-3">
          <svg
            className="w-5 h-5 text-blue-400 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
          <h3 className="text-sm font-semibold text-blue-200">Accept this plan?</h3>
          <span className="text-xs text-gray-500">Review the plan above and decide whether to proceed</span>
        </div>

        {/* Plan content */}
        {planApproval.plan && (
          <div className="max-h-48 overflow-y-auto mb-3 rounded-md bg-gray-800/60 border border-gray-700/50 p-3 text-sm text-gray-300">
            <MarkdownRenderer content={planApproval.plan} />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              className="flex-1 px-3 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors min-h-[44px]"
            >
              Yes, and auto-accept
            </button>
            <button
              onClick={() => handleReject()}
              className="flex-1 px-3 py-2 text-sm rounded-md border border-gray-600 bg-gray-800/60 text-gray-300 hover:border-gray-500 hover:bg-gray-700/60 transition-colors min-h-[44px]"
            >
              No, keep planning
            </button>
          </div>

          {/* Custom instructions input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customText.trim()) handleCustomSubmit();
              }}
              placeholder="Tell Claude what to do instead"
              className="flex-1 px-3 py-1.5 text-base md:text-sm rounded-md bg-gray-800/60 border border-gray-700/50 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-blue-500/50 min-h-[44px]"
            />
            {customText.trim() && (
              <button
                onClick={handleCustomSubmit}
                className="px-3 py-1.5 text-sm rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
