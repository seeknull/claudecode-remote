import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent, DragEvent, ChangeEvent } from "react";

export interface ImageAttachment {
  data: string; // base64
  mimeType: string;
  name: string;
}

interface Props {
  onSend: (message: string, images?: ImageAttachment[]) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix to get raw base64
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ChatInput({
  onSend,
  onAbort,
  isStreaming,
  disabled,
}: Props) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [text]);

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const addImages = async (files: File[]) => {
    const valid = files.filter(
      (f) => ACCEPTED_TYPES.includes(f.type) && f.size <= MAX_IMAGE_SIZE
    );
    if (valid.length === 0) return;

    const newImages: ImageAttachment[] = [];
    for (const file of valid) {
      const data = await fileToBase64(file);
      newImages.push({ data, mimeType: file.type, name: file.name });
    }
    setImages((prev) => [...prev, ...newImages]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) return;
    onSend(trimmed || "(image)", images.length > 0 ? images : undefined);
    setText("");
    setImages([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape" && isStreaming) {
      onAbort();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === "file" && ACCEPTED_TYPES.includes(item.type)) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addImages(files);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    addImages(files);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    addImages(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div
      className={`border-t border-gray-700/50 p-3 md:p-4 pb-safe flex-shrink-0 ${dragOver ? "bg-accent/5 border-accent/30" : ""}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="md:max-w-4xl md:mx-auto">
        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {images.map((img, i) => (
              <div
                key={i}
                className="relative group w-16 h-16 rounded-md overflow-hidden border border-gray-600"
              >
                <img
                  src={`data:${img.mimeType};base64,${img.data}`}
                  alt={img.name}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute inset-0 bg-black/60 opacity-100 md:opacity-0 md:group-hover:opacity-100
                             flex items-center justify-center transition-opacity"
                >
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="p-3 text-gray-500 hover:text-gray-300 transition-colors
                       disabled:opacity-30 rounded-lg hover:bg-surface-lighter"
            title="Attach image"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isStreaming
                ? "Type to interrupt and send..."
                : "Message..."
            }
            disabled={disabled}
            rows={1}
            className="flex-1 bg-surface-lighter border border-gray-600 rounded-lg px-4 py-3
                       text-base md:text-sm text-gray-200 placeholder-gray-500 resize-none
                       focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent
                       disabled:opacity-50"
          />

          {isStreaming ? (
            <button
              onClick={onAbort}
              className="px-4 py-3 bg-red-900/50 hover:bg-red-900/70 border border-red-800/50
                         rounded-lg text-red-300 text-sm font-medium transition-colors
                         flex items-center gap-2 min-h-[44px]"
              title="Stop (Escape)"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={(!text.trim() && images.length === 0) || disabled}
              className="px-4 py-3 bg-accent hover:bg-accent-hover
                         disabled:opacity-30 disabled:cursor-not-allowed
                         rounded-lg text-white text-sm font-medium transition-colors min-h-[44px]"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
