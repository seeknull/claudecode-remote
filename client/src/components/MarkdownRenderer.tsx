import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";

interface Props {
  content: string;
}

function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const language = className?.replace("language-", "") || "";
  const code = String(children).replace(/\n$/, "");

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-2">
      {language && (
        <div className="text-xs text-gray-500 px-3 py-1 bg-gray-800/80 rounded-t-md border border-b-0 border-gray-700/50">
          {language}
        </div>
      )}
      <pre
        className={`bg-gray-900/80 p-3 overflow-x-auto text-sm border border-gray-700/50 ${
          language ? "rounded-b-md" : "rounded-md"
        }`}
      >
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100
                   p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-xs
                   text-gray-300 transition-all"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

export default function MarkdownRenderer({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const isInline = !className;
          if (isInline) {
            return (
              <code
                className="bg-gray-800 px-1.5 py-0.5 rounded text-sm text-accent"
                {...props}
              >
                {children}
              </code>
            );
          }
          return <CodeBlock className={className}>{children}</CodeBlock>;
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>;
        },
        ul({ children }) {
          return <ul className="list-disc pl-5 mb-2">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal pl-5 mb-2">{children}</ol>;
        },
        li({ children }) {
          return <li className="mb-1">{children}</li>;
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-claude-blue hover:underline"
            >
              {children}
            </a>
          );
        },
        h1({ children }) {
          return (
            <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0">
              {children}
            </h1>
          );
        },
        h2({ children }) {
          return (
            <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0">
              {children}
            </h2>
          );
        },
        h3({ children }) {
          return (
            <h3 className="text-base font-bold mb-1 mt-2 first:mt-0">
              {children}
            </h3>
          );
        },
        blockquote({ children }) {
          return (
            <blockquote className="border-l-2 border-gray-600 pl-3 my-2 text-gray-400 italic">
              {children}
            </blockquote>
          );
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto my-2">
              <table className="border-collapse border border-gray-700 text-sm w-full">
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th className="border border-gray-700 px-3 py-1.5 bg-gray-800 text-left font-medium">
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="border border-gray-700 px-3 py-1.5">{children}</td>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
