import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import ShikiHighlighter, { createJavaScriptRegexEngine, isInlineCode } from "react-shiki";
import { Check, Copy } from "lucide-react";
import { cn } from "../lib/utils";

interface MarkdownRendererProps {
  children: string;
  compact?: boolean;
  isStreaming?: boolean;
}

const shikiEngine = createJavaScriptRegexEngine({ forgiving: true });

const getLanguage = (className?: string) => {
  const match = /language-(\w+)/.exec(className || "");
  return match?.[1] || "";
};

function CodeBlock({
  code,
  language,
  isStreaming = false,
}: {
  code: string;
  language: string;
  isStreaming?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      className="group/code my-4 overflow-hidden rounded-2xl border border-[var(--privora-border)] shadow-sm"
      style={{ backgroundColor: isDarkMode ? "#1f1f1f" : "#fffdf9" }}
    >
      <div className="flex min-h-10 items-center justify-between border-b border-[var(--privora-border)] bg-[var(--privora-text)]/[0.035] px-4 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--privora-muted)]">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium text-[var(--privora-muted)] opacity-80 transition hover:bg-[var(--privora-text)]/[0.06] hover:text-[var(--privora-text)] group-hover/code:opacity-100"
          title="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {isStreaming ? (
        <pre className="m-0 overflow-x-auto bg-transparent p-4 text-[0.9rem] leading-7 text-[var(--privora-text)]">
          <code
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            }}
          >
            {code}
          </code>
        </pre>
      ) : (
        <ShikiHighlighter
          key={`${isDarkMode ? "dark" : "light"}-${language || "text"}`}
          language={language || "text"}
          theme={isDarkMode ? "github-dark" : "github-light"}
          engine={shikiEngine}
          showLanguage={false}
          addDefaultStyles={false}
          className="m-0 overflow-x-auto bg-transparent p-4 text-[0.9rem] leading-7"
          style={{
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          }}
        >
          {code}
        </ShikiHighlighter>
      )}
    </div>
  );
}

export function MarkdownRenderer({ children, compact = false, isStreaming = false }: MarkdownRendererProps) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        p: ({ children }) => (
          <p className={cn(compact ? "my-1 leading-6" : "my-3 leading-8")}>{children}</p>
        ),
        ul: ({ children }) => (
          <ul className={cn("list-disc pl-6", compact ? "my-2 space-y-1" : "my-4 space-y-2")}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className={cn("list-decimal pl-6", compact ? "my-2 space-y-1" : "my-4 space-y-2")}>{children}</ol>
        ),
        li: ({ children }) => <li className="pl-1 leading-7 marker:text-[var(--privora-muted)]">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-4 border-l-2 border-[var(--privora-border)] pl-4 text-[var(--privora-muted)]">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="my-4 w-full overflow-x-auto rounded-2xl border border-[var(--privora-border)] bg-[var(--privora-surface)]">
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border-b border-[var(--privora-border)] bg-[var(--privora-text)]/[0.04] px-4 py-2.5 text-left font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-b border-[var(--privora-border)]/70 px-4 py-2.5 align-top">{children}</td>
        ),
        code: ({ inline, className, children, node, ...props }: any) => {
          const code = String(children).replace(/\n$/, "");
          const language = getLanguage(className);

          if (inline || isInlineCode(node)) {
            return (
              <code
                className="rounded-md bg-[var(--privora-text)]/[0.08] px-1.5 py-0.5 font-mono text-[0.9em]"
                {...props}
              >
                {children}
              </code>
            );
          }

          return <CodeBlock code={code} language={language} isStreaming={isStreaming} />;
        },
      }}
    >
      {children}
    </Markdown>
  );
}
