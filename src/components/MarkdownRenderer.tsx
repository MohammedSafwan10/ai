import { memo, useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import ShikiHighlighter, { createJavaScriptRegexEngine, isInlineCode } from "react-shiki";
import { Check, ChevronDown, Copy } from "lucide-react";
import { cn } from "../lib/utils";

interface MarkdownRendererProps {
  children: string;
  compact?: boolean;
  isStreaming?: boolean;
}

const shikiEngine = createJavaScriptRegexEngine({ forgiving: true });
const COLLAPSED_CODE_LINES = 22;

function normalizeMathDelimiters(markdown: string) {
  return markdown
    .split(/(```[\s\S]*?```)/g)
    .map((part) => {
      if (part.startsWith("```")) {
        return part;
      }

      return part
        .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `\n\n$$${math.trim()}$$\n\n`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${math.trim()}$`)
        .replace(/\[((?:[^\]\n]*\\(?:begin|frac|sqrt|sum|int|lim|prod|text|left|right|mathbb|mathbf|cdot|times|leq|geq|neq|in|to|dots|ldots|approx)[\s\S]*?))\]/g, (_match, math: string) => `\n\n$$${math.trim()}$$\n\n`)
        .replace(/\((\s*\\(?:begin|frac|sqrt|sum|int|lim|prod|text|left|right|mathbb|mathbf|cdot|times|leq|geq|neq|in|to|dots|ldots|approx)[^)\n]{1,500})\)/g, (_match, math: string) => `$${math.trim()}$`);
    })
    .join("");
}

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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains("dark"));
  const lineCount = code.split("\n").length;
  const shouldCollapse = lineCount > COLLAPSED_CODE_LINES;
  const isCollapsed = shouldCollapse && !isExpanded;

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
      <div className="relative">
      {isStreaming ? (
        <pre className={cn(
          "m-0 overflow-x-auto bg-transparent p-4 text-[0.9rem] leading-7 text-[var(--privora-text)]",
          isCollapsed && "max-h-[38rem] overflow-y-hidden"
        )}>
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
          className={cn(
            "m-0 overflow-x-auto bg-transparent p-4 text-[0.9rem] leading-7",
            isCollapsed && "max-h-[38rem] overflow-y-hidden"
          )}
          style={{
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          }}
        >
          {code}
        </ShikiHighlighter>
      )}
      {isCollapsed && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-4 pb-3 pt-16"
          style={{
            background: `linear-gradient(to top, ${isDarkMode ? "#1f1f1f" : "#fffdf9"} 0%, ${isDarkMode ? "rgba(31,31,31,0.95)" : "rgba(255,253,249,0.95)"} 45%, transparent 100%)`,
          }}
        >
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--privora-border)] bg-[var(--privora-surface)] px-3 py-1.5 text-xs font-medium text-[var(--privora-text)] shadow-sm transition hover:bg-[var(--privora-text)]/[0.06]"
          >
            Show full code
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      </div>
      {shouldCollapse && isExpanded && (
        <div className="flex justify-center border-t border-[var(--privora-border)] bg-[var(--privora-text)]/[0.02] px-4 py-2">
          <button
            type="button"
            onClick={() => setIsExpanded(false)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--privora-muted)] transition hover:bg-[var(--privora-text)]/[0.06] hover:text-[var(--privora-text)]"
          >
            Collapse code
            <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          </button>
        </div>
      )}
    </div>
  );
}

function MarkdownRendererComponent({ children, compact = false, isStreaming = false }: MarkdownRendererProps) {
  const normalizedMarkdown = normalizeMathDelimiters(children);

  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { errorColor: "var(--privora-text)", strict: "ignore", throwOnError: false }]]}
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
      {normalizedMarkdown}
    </Markdown>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererComponent);
