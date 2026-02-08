import { useChatStore, PermissionRequest } from "../stores/chatStore";

interface Props {
  request: PermissionRequest;
  onRespond: (requestId: string, allowed: boolean) => void;
}

export default function PermissionPrompt({ request, onRespond }: Props) {
  const clearPermissionRequest = useChatStore((s) => s.clearPermissionRequest);

  const handleAllow = () => {
    onRespond(request.requestId, true);
    clearPermissionRequest();
  };

  const handleDeny = () => {
    onRespond(request.requestId, false);
    clearPermissionRequest();
  };

  // Format tool input for display
  const inputSummary = (() => {
    const input = request.input;
    if (request.toolName === "Bash" && input.command) {
      return String(input.command);
    }
    if (request.toolName === "Write" && input.file_path) {
      return `Write to ${input.file_path}`;
    }
    if (request.toolName === "Edit" && input.file_path) {
      return `Edit ${input.file_path}`;
    }
    // Generic: show first meaningful key
    const keys = Object.keys(input).filter(
      (k) => typeof input[k] === "string" && (input[k] as string).length < 200
    );
    if (keys.length > 0) {
      return `${keys[0]}: ${input[keys[0]]}`;
    }
    return JSON.stringify(input).slice(0, 200);
  })();

  return (
    <div className="sticky bottom-0 z-20 border-t border-yellow-600/40 bg-yellow-900/30 backdrop-blur-sm p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            <svg
              className="w-5 h-5 text-yellow-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-yellow-200">
              Permission requested: <span className="font-mono">{request.toolName}</span>
            </p>
            <pre className="text-xs text-yellow-100/70 mt-1 whitespace-pre-wrap break-all max-h-32 overflow-y-auto font-mono bg-black/20 rounded p-2">
              {inputSummary}
            </pre>
            {/* Mobile buttons (stacked below content) */}
            <div className="flex gap-2 mt-3 md:hidden">
              <button
                onClick={handleDeny}
                className="flex-1 min-h-[44px] text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
              >
                Deny
              </button>
              <button
                onClick={handleAllow}
                className="flex-1 min-h-[44px] text-sm rounded bg-yellow-600 hover:bg-yellow-500 text-white font-medium transition-colors"
              >
                Allow
              </button>
            </div>
          </div>
          <div className="hidden md:flex gap-2 flex-shrink-0">
            <button
              onClick={handleDeny}
              className="px-3 py-1.5 text-sm rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
            >
              Deny
            </button>
            <button
              onClick={handleAllow}
              className="px-3 py-1.5 text-sm rounded bg-yellow-600 hover:bg-yellow-500 text-white font-medium transition-colors"
            >
              Allow
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
