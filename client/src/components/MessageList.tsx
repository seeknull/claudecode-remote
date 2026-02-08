import { useEffect, useRef, useState } from "react";
import { ChatMessage } from "../stores/chatStore";
import MessageBubble from "./MessageBubble";
import ToolCall from "./ToolCall";
import ThinkingBlock from "./ThinkingBlock";

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export default function MessageList({ messages, isStreaming }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Find the scrollable parent container
  const getScrollParent = () => {
    return containerRef.current?.parentElement;
  };

  const scrollToBottom = () => {
    const parent = getScrollParent();
    if (parent) {
      parent.scrollTop = parent.scrollHeight;
    }
  };

  // Auto-scroll on new messages
  useEffect(() => {
    if (autoScroll) {
      scrollToBottom();
    }
  }, [messages, autoScroll]);

  // Attach scroll listener to the scrollable parent
  useEffect(() => {
    const parent = getScrollParent();
    if (!parent) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = parent;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
      setShowScrollButton(!isAtBottom);
    };

    parent.addEventListener("scroll", handleScroll);
    return () => parent.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 px-3 py-3 md:px-4 md:py-4"
    >
      {messages.length === 0 && (
        <div className="h-full flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="text-4xl mb-3 opacity-50">&#62;_</div>
            <p>Send a message to start</p>
          </div>
        </div>
      )}

      {messages.map((msg) => {
        switch (msg.role) {
          case "user":
            return (
              <MessageBubble key={msg.id} role="user" text={msg.text} images={msg.images} />
            );
          case "assistant":
            return (
              <MessageBubble
                key={msg.id}
                role="assistant"
                text={msg.text}
              />
            );
          case "thinking":
            return <ThinkingBlock key={msg.id} text={msg.text} />;
          case "tool":
            return (
              <ToolCall
                key={msg.id}
                toolName={msg.toolName}
                input={msg.input}
                output={msg.output}
                isError={msg.isError}
                status={msg.status}
              />
            );
          case "error":
            return (
              <MessageBubble key={msg.id} role="error" text={msg.text} />
            );
          default:
            return null;
        }
      })}

      {isStreaming && (
        <div className="flex items-center gap-2 py-2 text-gray-500">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 bg-accent rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      )}

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={() => {
            scrollToBottom();
            setAutoScroll(true);
            setShowScrollButton(false);
          }}
          className="fixed bottom-20 right-4 md:bottom-24 md:right-8 p-2 bg-surface-lighter border border-gray-700/50
                     rounded-full shadow-lg hover:bg-surface-lighter/80 transition-colors z-10"
        >
          <svg
            className="w-5 h-5 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
