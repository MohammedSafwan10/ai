import { isValidElement, memo, useEffect, useRef, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import ShikiHighlighter, { createJavaScriptRegexEngine, isInlineCode } from "react-shiki";
import { Check, ChevronDown, Code2, Copy } from "lucide-react";
import { cn } from "../../../lib/utils";
import { slugifyHeading } from "../../../lib/research/report";
import { copyTextToClipboard } from "../../../lib/clipboard";
import { useToast } from "../../ui/ToastProvider";

interface MarkdownRendererProps {
  children: string;
  compact?: boolean;
  isStreaming?: boolean;
  withHeadingIds?: boolean;
  headingIds?: string[];
  tableMode?: "chat" | "report" | "preview";
  onOpenCodePlayground?: (code: string, language: string) => void;
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
  const match = /language-([^\s]+)/.exec(className || "");
  const language = match?.[1]?.toLowerCase() || "";
  const aliases: Record<string, string> = {
    "c++": "cpp",
    "objective-c": "objectivec",
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
  };
  return aliases[language] || language;
};

const shouldOpenInNewTab = (href?: string) => {
  if (!href) return false;
  const trimmed = href.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;

  try {
    const url = new URL(trimmed);
    return url.origin !== window.location.origin;
  } catch {
    return false;
  }
};

const getSafeHref = (href?: string) => {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed, window.location.href);
    const safeProtocols = new Set(["http:", "https:", "mailto:", "tel:"]);
    if (safeProtocols.has(url.protocol)) return trimmed;
    if (url.protocol === window.location.protocol && (trimmed.startsWith("/") || trimmed.startsWith("#"))) return trimmed;
    return undefined;
  } catch {
    return trimmed.startsWith("#") || trimmed.startsWith("/") ? trimmed : undefined;
  }
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
  onOpenCodePlayground,
}: {
  code: string;
  language: string;
  isStreaming?: boolean;
  onOpenCodePlayground?: (code: string, language: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains("dark"));
  const { notify } = useToast();
  const lineCount = code.split("\n").length;
  const shouldCollapse = lineCount > COLLAPSED_CODE_LINES;
  const isCollapsed = shouldCollapse && !isExpanded;
  const canOpenInPlayground = Boolean(onOpenCodePlayground && !isStreaming && ["javascript", "typescript", "jsx", "tsx", "html", "css", "json", "js", "ts"].includes(language || ""));

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
    try {
      await copyTextToClipboard(code);
      setCopied(true);
      notify({ title: "Copied", description: "Code block copied.", variant: "success" });
      setTimeout(() => setCopied(false), 1600);
    } catch {
      notify({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "error" });
    }
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
        <div className="flex items-center gap-1.5">
          {canOpenInPlayground && (
            <button
              type="button"
              onClick={() => onOpenCodePlayground?.(code, language || "javascript")}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--privora-muted)] opacity-80 transition hover:bg-[var(--privora-text)]/[0.06] hover:text-[var(--privora-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--privora-accent)]/45 group-hover/code:opacity-100"
              title="Open in Code Playground"
              aria-label="Open in Code Playground"
            >
              <Code2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--privora-muted)] opacity-80 transition hover:bg-[var(--privora-text)]/[0.06] hover:text-[var(--privora-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--privora-accent)]/45 group-hover/code:opacity-100"
            title={copied ? "Copied" : "Copy code"}
            aria-label={copied ? "Copied" : "Copy code"}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
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
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-[var(--privora-border)] bg-[var(--privora-surface)] px-3 py-1.5 text-xs font-medium text-[var(--privora-text)] shadow-sm transition hover:bg-[var(--privora-text)]/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--privora-accent)]/45"
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
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[var(--privora-muted)] transition hover:bg-[var(--privora-text)]/[0.06] hover:text-[var(--privora-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--privora-accent)]/45"
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
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="privora-md-table-scroll"
        tabIndex={hasOverflow ? 0 : undefined}
        aria-label={hasOverflow ? "Scrollable table" : undefined}
      >
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

function MarkdownLink({
  href,
  children,
  node: _node,
  ...props
}: {
  href?: string;
  children?: ReactNode;
  node?: unknown;
}) {
  const safeHref = getSafeHref(href);
  const openInNewTab = shouldOpenInNewTab(safeHref);

  return (
    <a
      href={safeHref}
      target={openInNewTab ? "_blank" : undefined}
      rel={openInNewTab ? "noreferrer noopener" : undefined}
      {...props}
    >
      {children}
    </a>
  );
}

function MarkdownRendererComponent({
  children,
  compact = false,
  isStreaming = false,
  withHeadingIds = false,
  headingIds: providedHeadingIds,
  tableMode = "chat",
  onOpenCodePlayground,
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
        h1: ({ children, node: _node, className, ...props }) => (
          <h1 {...props} {...getHeadingProps(children)} className={className}>{children}</h1>
        ),
        h2: ({ children, node: _node, className, ...props }) => (
          <h2 {...props} {...getHeadingProps(children)} className={className}>{children}</h2>
        ),
        h3: ({ children, node: _node, className, ...props }) => (
          <h3 {...props} {...getHeadingProps(children)} className={className}>{children}</h3>
        ),
        p: ({ children, node: _node, className, ...props }) => (
          <p {...props} className={cn(compact ? "my-1 leading-6" : "my-3 leading-8", className)}>{children}</p>
        ),
        ul: ({ children, node: _node, className, ...props }) => (
          <ul {...props} className={cn("list-disc pl-6", compact ? "my-2 space-y-1" : "my-4 space-y-2", className)}>{children}</ul>
        ),
        ol: ({ children, node: _node, className, ...props }) => (
          <ol {...props} className={cn("list-decimal pl-6", compact ? "my-2 space-y-1" : "my-4 space-y-2", className)}>{children}</ol>
        ),
        li: ({ children, node: _node, className, ...props }) => <li {...props} className={cn("pl-1 leading-7 marker:text-[var(--privora-muted)]", className)}>{children}</li>,
        blockquote: ({ children, node: _node, className, ...props }) => (
          <blockquote {...props} className={cn("my-4 border-l-2 border-[var(--privora-border)] pl-4 text-[var(--privora-muted)]", className)}>
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
        a: MarkdownLink,
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

          return <CodeBlock code={code} language={language} isStreaming={isStreaming} onOpenCodePlayground={onOpenCodePlayground} />;
        },
      }}
    >
      {normalizedMarkdown}
    </Markdown>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererComponent);
