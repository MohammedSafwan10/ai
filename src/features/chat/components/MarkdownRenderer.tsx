import { isValidElement, memo, useEffect, useRef, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import ShikiHighlighter, { createJavaScriptRegexEngine, isInlineCode } from "react-shiki";
import { Check, ChevronDown, Copy } from "lucide-react";
import { cn } from "../../../lib/utils";
import { slugifyHeading } from "../../../lib/research/report";

interface MarkdownRendererProps {
  children: string;
  compact?: boolean;
  isStreaming?: boolean;
  withHeadingIds?: boolean;
  headingIds?: string[];
  tableMode?: "chat" | "report" | "preview";
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

const nodeToText = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeToText(node.props.children);
  return "";
};

const countTableColumns = (node: ReactNode): number => {
  if (!node) return 0;
  if (Array.isArray(node)) return Math.max(0, ...node.map(countTableColumns));
  if (!isValidElement<{ children?: ReactNode }>(node)) return 0;

  const elementType = typeof node.type === "string" ? node.type : "";
  const children = node.props.children;
  if (elementType === "tr") {
    const cells = Array.isArray(children) ? children : [children];
    return cells.filter(cell => isValidElement(cell) && (cell.type === "th" || cell.type === "td")).length;
  }

  return countTableColumns(children);
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

function MarkdownTable({
  children,
  mode,
}: {
  children: ReactNode;
  mode: NonNullable<MarkdownRendererProps["tableMode"]>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const columnCount = countTableColumns(children);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const element = scrollRef.current;
    if (!element) return;

    const overflow = element.scrollWidth - element.clientWidth > 2;
    setHasOverflow(overflow);
    setCanScrollLeft(overflow && element.scrollLeft > 2);
    setCanScrollRight(overflow && element.scrollLeft + element.clientWidth < element.scrollWidth - 2);
  };

  useEffect(() => {
    updateScrollState();
    const element = scrollRef.current;
    if (!element) return;

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(element);
    window.addEventListener("resize", updateScrollState);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollState);
    };
  }, [children]);

  return (
    <div
      className={cn(
        "privora-md-table",
        `privora-md-table--${mode}`,
        columnCount <= 3 && "privora-md-table--compact",
        columnCount >= 5 && "privora-md-table--wide",
        hasOverflow && "is-overflowing",
        canScrollLeft && "can-scroll-left",
        canScrollRight && "can-scroll-right"
      )}
    >
      <div ref={scrollRef} onScroll={updateScrollState} className="privora-md-table-scroll">
        <table className="privora-md-table-element">{children}</table>
      </div>
      {hasOverflow && (
        <div className="privora-md-table-hint" aria-hidden="true">
          Scroll table
        </div>
      )}
    </div>
  );
}

function MarkdownRendererComponent({
  children,
  compact = false,
  isStreaming = false,
  withHeadingIds = false,
  headingIds: providedHeadingIds,
  tableMode = "chat",
}: MarkdownRendererProps) {
  const normalizedMarkdown = normalizeMathDelimiters(children);
  const generatedHeadingIds = new Map<string, number>();
  let headingIndex = 0;
  const getHeadingProps = (node: ReactNode) => {
    if (!withHeadingIds) return {};

    const id = providedHeadingIds?.[headingIndex] || slugifyHeading(nodeToText(node), generatedHeadingIds);
    headingIndex += 1;
    return { id, "data-report-heading-id": id };
  };

  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { errorColor: "var(--privora-text)", strict: "ignore", throwOnError: false }]]}
      components={{
        h1: ({ children }) => <h1 {...getHeadingProps(children)}>{children}</h1>,
        h2: ({ children }) => <h2 {...getHeadingProps(children)}>{children}</h2>,
        h3: ({ children }) => <h3 {...getHeadingProps(children)}>{children}</h3>,
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
        table: ({ children }) => <MarkdownTable mode={tableMode}>{children}</MarkdownTable>,
        th: ({ children }) => (
          <th className="border-b border-[var(--privora-border)] bg-[var(--privora-text)]/[0.04] px-3 py-2.5 text-left font-semibold leading-snug first:font-bold sm:px-4">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-b border-[var(--privora-border)]/70 px-3 py-2.5 align-top leading-relaxed first:font-medium sm:px-4">{children}</td>
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
