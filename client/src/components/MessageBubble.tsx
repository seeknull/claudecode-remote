import { ImageData } from "../stores/chatStore";
import MarkdownRenderer from "./MarkdownRenderer";

interface Props {
  role: "user" | "assistant" | "error";
  text: string;
  images?: ImageData[];
}

export default function MessageBubble({ role, text, images }: Props) {
  if (role === "user") {
    return (
      <div className="flex justify-end my-3">
        <div className="max-w-[80%] bg-claude-blue/20 border border-claude-blue/30 rounded-lg px-4 py-2.5">
          {images && images.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {images.map((img, i) => (
                <img
                  key={i}
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt="attachment"
                  className="max-w-[150px] max-h-[150px] md:max-w-[200px] md:max-h-[200px] rounded-md object-contain"
                />
              ))}
            </div>
          )}
          <p className="text-sm text-gray-200 whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    );
  }

  if (role === "error") {
    return (
      <div className="my-3">
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-2.5">
          <div className="flex items-center gap-2 mb-1">
            <svg
              className="w-4 h-4 text-red-400"
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
            <span className="text-xs font-medium text-red-400">Error</span>
          </div>
          <p className="text-sm text-red-300">{text}</p>
        </div>
      </div>
    );
  }

  // Assistant
  return (
    <div className="my-3">
      <div className="text-sm text-gray-200 leading-relaxed">
        <MarkdownRenderer content={text} />
      </div>
    </div>
  );
}
