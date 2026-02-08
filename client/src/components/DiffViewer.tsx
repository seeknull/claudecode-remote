interface Props {
  diff: string;
  fileName?: string;
  onClose: () => void;
}

function classifyLine(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return "text-gray-400 font-bold";
  if (line.startsWith("@@")) return "text-blue-400 bg-blue-900/20";
  if (line.startsWith("+")) return "text-green-400 bg-green-900/15";
  if (line.startsWith("-")) return "text-red-400 bg-red-900/15";
  return "text-gray-400";
}

export default function DiffViewer({ diff, fileName, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-surface border border-gray-700/50 shadow-2xl flex flex-col
                   w-full h-full md:w-[90vw] md:max-w-4xl md:max-h-[85vh] md:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
          <h3 className="text-sm font-medium text-gray-200 truncate">
            {fileName || "All Changes"}
          </h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center md:min-h-0 md:min-w-0 md:p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-auto p-0">
          {diff ? (
            <pre className="text-xs font-mono leading-relaxed">
              {diff.split("\n").map((line, i) => (
                <div key={i} className={`px-4 py-px ${classifyLine(line)}`}>
                  {line || " "}
                </div>
              ))}
            </pre>
          ) : (
            <div className="p-6 text-center text-sm text-gray-500">No changes</div>
          )}
        </div>
      </div>
    </div>
  );
}
