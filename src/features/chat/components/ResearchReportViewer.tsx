import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { BookOpenText, Check, Copy, Download, ListTree, PanelLeftClose, Share2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  buildReportMarkdown,
  copyReportContents,
  exportReportMarkdown,
  exportReportWord,
  getResearchReportMeta,
  hasMarkdownSourceSection,
  slugifyHeading,
  type ResearchReportData,
} from "../../../lib/research/report";
import { cn } from "../../../lib/utils";
import { useToast } from "../../ui/ToastProvider";

type TocItem = { id: string; level: number; text: string };

interface ResearchReportViewerProps {
  isOpen: boolean;
  report: ResearchReportData;
  onClose: () => void;
  onOpenActivity?: () => void;
}

export function ResearchReportViewer({ isOpen, report, onClose, onOpenActivity }: ResearchReportViewerProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const { notify } = useToast();
  const [renderedToc, setRenderedToc] = useState<TocItem[]>([]);
  const [activeTocId, setActiveTocId] = useState<string | null>(null);
  const reportRef = useRef<HTMLElement>(null);
  const headingTargetsRef = useRef(new Map<string, HTMLElement>());
  const meta = getResearchReportMeta(report);
  const hasSourcesInContent = hasMarkdownSourceSection(report.content);
  const tocItems = renderedToc.length > 0 ? renderedToc : meta.toc;

  useLayoutEffect(() => {
    if (!isOpen) return;

    const container = reportRef.current;
    const reportBody = container?.querySelector<HTMLElement>(".research-report-body");
    if (!container || !reportBody) return;

    const headings = Array.from(reportBody.querySelectorAll<HTMLHeadingElement>("h1, h2, h3"));
    headings.forEach((heading) => {
      heading.removeAttribute("id");
      delete heading.dataset.reportHeadingId;
    });

    const majorHeadings = headings.filter(heading => heading.tagName === "H1" || heading.tagName === "H2");
    const tocHeadings = majorHeadings.length >= 3 ? majorHeadings : headings;
    const usedIds = new Map<string, number>();
    const nextTargets = new Map<string, HTMLElement>();
    const nextToc = tocHeadings
      .map((heading) => {
        const text = heading.textContent?.replace(/\s+/g, " ").trim() || "";
        if (!text) return null;

        const id = slugifyHeading(text, usedIds);
        heading.id = id;
        heading.dataset.reportHeadingId = id;
        nextTargets.set(id, heading);

        return {
          id,
          text,
          level: Number(heading.tagName.slice(1)),
        };
      })
      .filter((item): item is TocItem => Boolean(item));

    headingTargetsRef.current = nextTargets;
    setRenderedToc(nextToc);
    setActiveTocId(nextToc[0]?.id ?? null);
  }, [isOpen, report.content]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const container = reportRef.current;
    if (!container) return undefined;

    const updateActiveHeading = () => {
      const containerTop = container.getBoundingClientRect().top;
      let nextActiveId = tocItems[0]?.id ?? null;

      tocItems.forEach(item => {
        const target = headingTargetsRef.current.get(item.id);
        if (!target) return;

        const offset = target.getBoundingClientRect().top - containerTop;
        if (offset <= 96) nextActiveId = item.id;
      });

      setActiveTocId(nextActiveId);
    };

    updateActiveHeading();
    container.addEventListener("scroll", updateActiveHeading, { passive: true });
    return () => container.removeEventListener("scroll", updateActiveHeading);
  }, [isOpen, tocItems]);

  const jumpToHeading = (id: string) => {
    const container = reportRef.current;
    const target = headingTargetsRef.current.get(id);

    if (container && target) {
      const containerTop = container.getBoundingClientRect().top;
      const targetTop = target.getBoundingClientRect().top;
      container.scrollTo({
        top: container.scrollTop + targetTop - containerTop - 24,
        behavior: "smooth",
      });
    }

    setIsTocOpen(false);
  };

  const handleCopy = async () => {
    try {
      await copyReportContents(report);
      setIsCopied(true);
      setIsMenuOpen(false);
      notify({ title: "Copied", description: "Research report copied.", variant: "success" });
      window.setTimeout(() => setIsCopied(false), 1600);
    } catch {
      notify({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "error" });
    }
  };

  const handleShare = async () => {
    if (!navigator.share) return;
    try {
      await navigator.share({ title: meta.title, text: buildReportMarkdown(report) });
      notify({ title: "Shared", description: "Research report shared.", variant: "success" });
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        notify({ title: "Share failed", description: "Your browser could not share this report.", variant: "error" });
      }
    }
  };

  const exportMenu = (
    <AnimatePresence>
      {isMenuOpen && (
        <>
          <button type="button" aria-label="Close export menu" className="fixed inset-0 z-[121] cursor-default" onClick={() => setIsMenuOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            className="absolute right-0 top-11 z-[122] w-56 overflow-hidden rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] py-1.5 text-[14px] font-medium text-[var(--privora-text)] shadow-2xl"
          >
            <button type="button" onClick={handleCopy} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--privora-text)]/[0.06]">
              {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy contents
            </button>
            <button type="button" onClick={() => { exportReportMarkdown(report); setIsMenuOpen(false); notify({ title: "Download started", description: "Markdown report is being downloaded.", variant: "success" }); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--privora-text)]/[0.06]">
              <Download className="h-4 w-4" />
              Export Markdown
            </button>
            <button type="button" onClick={() => { void exportReportWord(report); setIsMenuOpen(false); notify({ title: "Download started", description: "Word report is being prepared.", variant: "success" }); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--privora-text)]/[0.06]">
              <Download className="h-4 w-4" />
              Export Word
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex h-[var(--privora-app-height,100dvh)] flex-col bg-[var(--privora-bg)] text-[var(--privora-text)]"
        >
          <header className="relative z-[120] flex h-14 shrink-0 items-center justify-between border-b border-[var(--privora-border)] bg-[var(--privora-bg)] px-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--privora-muted)] transition-colors hover:bg-[var(--privora-text)]/[0.06] hover:text-[var(--privora-text)]"
                title="Close report"
              >
                <X className="h-5 w-5" />
              </button>
              <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--privora-accent)] text-[var(--privora-accent-fg)] sm:flex">
                <BookOpenText className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold sm:text-[15px]">{meta.title}</div>
                <div className="truncate text-[12px] text-[var(--privora-muted)]">
                  {meta.elapsedLabel ? `Completed in ${meta.elapsedLabel}` : "Research completed"} · {meta.citationCount} citation{meta.citationCount === 1 ? "" : "s"} · {meta.sourceCount} source{meta.sourceCount === 1 ? "" : "s"}
                </div>
              </div>
            </div>
            <div className="relative flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setIsTocOpen(open => !open)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--privora-muted)] transition-colors hover:bg-[var(--privora-text)]/[0.06] hover:text-[var(--privora-text)] lg:hidden"
                title="Table of contents"
              >
                <ListTree className="h-4 w-4" />
              </button>
              {navigator.share && (
                <button
                  type="button"
                  onClick={handleShare}
                  className="hidden h-9 w-9 items-center justify-center rounded-full text-[var(--privora-muted)] transition-colors hover:bg-[var(--privora-text)]/[0.06] hover:text-[var(--privora-text)] sm:flex"
                  title="Share report"
                >
                  <Share2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsMenuOpen(open => !open)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--privora-muted)] transition-colors hover:bg-[var(--privora-text)]/[0.06] hover:text-[var(--privora-text)]"
                title="Download report"
              >
                <Download className="h-4 w-4" />
              </button>
              {exportMenu}
            </div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[3.5rem_1fr]">
            <aside className="group/toc relative hidden min-h-0 border-r border-[var(--privora-border)] bg-[var(--privora-bg)] lg:block">
              <div className="flex h-full flex-col items-center px-2 py-8">
                <button
                  type="button"
                  onClick={() => reportRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
                  className="mb-8 h-6 w-6 rounded-full text-[var(--privora-muted)] transition-colors hover:text-[var(--privora-text)]"
                  title="Top"
                >
                  <span className="block h-0.5 w-6 rounded-full bg-current" />
                </button>
                <nav className="flex w-full flex-col items-center gap-2">
                  {tocItems.slice(0, 24).map(item => (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={item.text}
                      onClick={() => jumpToHeading(item.id)}
                      className={cn(
                        "h-0.5 rounded-full bg-[var(--privora-muted)]/45 transition-all hover:bg-[var(--privora-text)]",
                        activeTocId === item.id ? "w-6 bg-[var(--privora-text)]" : item.level === 3 ? "w-3.5" : "w-5"
                      )}
                    />
                  ))}
                </nav>
              </div>

              <div className="pointer-events-none absolute left-[calc(100%-1px)] top-8 z-[118] w-[18rem] opacity-0 transition-all duration-150 group-hover/toc:pointer-events-auto group-hover/toc:translate-x-0 group-hover/toc:opacity-100 group-focus-within/toc:pointer-events-auto group-focus-within/toc:translate-x-0 group-focus-within/toc:opacity-100">
                <div className="max-h-[calc(var(--privora-app-height,100dvh)-7rem)] translate-x-1 overflow-hidden rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] shadow-2xl">
                  <div className="max-h-[calc(var(--privora-app-height,100dvh)-7rem)] overflow-y-auto px-5 py-6">
                    <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--privora-muted)]">Table of contents</div>
                    <button
                      type="button"
                      onClick={() => reportRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
                      className="mb-4 block text-left text-[14px] font-semibold leading-relaxed text-[var(--privora-text)] underline decoration-[var(--privora-border)] underline-offset-4 hover:decoration-[var(--privora-text)]"
                    >
                      {meta.title}
                    </button>
                    <nav className="flex flex-col gap-2">
                      {tocItems.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => jumpToHeading(item.id)}
                          className={cn(
                            "text-left text-[14px] leading-relaxed text-[var(--privora-muted)] transition-colors hover:text-[var(--privora-text)]",
                            activeTocId === item.id && "font-semibold text-[var(--privora-text)]",
                            item.level === 1 && "font-semibold",
                            item.level === 3 && "pl-4 text-[13px]"
                          )}
                        >
                          {item.text}
                        </button>
                      ))}
                    </nav>
                  </div>
                </div>
              </div>
            </aside>

            <AnimatePresence>
              {isTocOpen && (
                <>
                  <button type="button" aria-label="Close table of contents" className="fixed inset-0 z-[115] bg-black/25 lg:hidden" onClick={() => setIsTocOpen(false)} />
                  <motion.aside
                    initial={{ x: "-100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "-100%" }}
                    transition={{ type: "spring", stiffness: 360, damping: 36 }}
                    className="fixed bottom-0 left-0 top-14 z-[116] w-[82vw] max-w-[21rem] border-r border-[var(--privora-border)] bg-[var(--privora-bg)] p-5 shadow-2xl lg:hidden"
                  >
                    <button type="button" onClick={() => setIsTocOpen(false)} className="mb-5 flex h-9 w-9 items-center justify-center rounded-full text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/[0.06] hover:text-[var(--privora-text)]">
                      <PanelLeftClose className="h-5 w-5" />
                    </button>
                    <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--privora-muted)]">Table of contents</div>
                    <nav className="flex max-h-[calc(100dvh-10rem)] flex-col gap-3 overflow-y-auto">
                      {tocItems.map(item => (
                        <button key={item.id} type="button" onClick={() => jumpToHeading(item.id)} className="text-left text-[15px] leading-relaxed text-[var(--privora-muted)]">
                          {item.text}
                        </button>
                      ))}
                    </nav>
                  </motion.aside>
                </>
              )}
            </AnimatePresence>

            <main ref={reportRef} className="min-h-0 overflow-y-auto scroll-smooth">
              <article className="mx-auto min-h-full w-full max-w-[48rem] px-5 py-10 sm:px-8 lg:py-16">
                <div className="markdown-body research-report-body max-w-none text-[var(--privora-text)]">
                  <MarkdownRenderer tableMode="report">{report.content}</MarkdownRenderer>
                </div>

                {!hasSourcesInContent && report.sources && report.sources.length > 0 && (
                  <section className="mt-12 rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] p-4">
                    <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--privora-muted)]">Sources</h2>
                    <div className="flex flex-col gap-2">
                      {report.sources.map((source, index) => (
                        <a
                          key={`${source.url}-${index}`}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-words text-[13px] text-[var(--privora-text)] underline decoration-[var(--privora-border)] underline-offset-4 hover:decoration-[var(--privora-text)]"
                        >
                          {index + 1}. {source.title || source.url}
                        </a>
                      ))}
                    </div>
                  </section>
                )}
              </article>
            </main>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
