import { useState } from "react";
import { BookOpenText, Check, Copy, Download, ExternalLink, Maximize2, MoreHorizontal, Share2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ResearchReportViewer } from "./ResearchReportViewer";
import {
  buildReportMarkdown,
  copyReportContents,
  exportReportMarkdown,
  exportReportWord,
  getResearchReportMeta,
  type ResearchReportData,
} from "../../../lib/research/report";
import { cn } from "../../../lib/utils";
import { useToast } from "../../ui/ToastProvider";

interface ResearchReportCardProps {
  report: ResearchReportData;
  onOpenActivity?: () => void;
}

export function ResearchReportCard({ report, onOpenActivity }: ResearchReportCardProps) {
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const { notify } = useToast();
  const meta = getResearchReportMeta(report);
  const summary = [
    meta.elapsedLabel ? `completed in ${meta.elapsedLabel}` : "completed",
    `${meta.citationCount} citation${meta.citationCount === 1 ? "" : "s"}`,
    `${meta.sourceCount} source${meta.sourceCount === 1 ? "" : "s"}`,
  ].join(" · ");

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

  return (
    <>
      <div className="w-full max-w-[48rem]">
        <div className="mb-2 px-1 text-[13px] font-medium text-[var(--privora-muted)]">
          Research {summary}
        </div>
        <div className="overflow-hidden rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--privora-border)] px-3 py-2.5">
            <button
              type="button"
              onClick={() => setIsViewerOpen(true)}
              className="flex min-w-0 items-center gap-2 text-left"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--privora-accent)] text-[var(--privora-accent-fg)]">
                <BookOpenText className="h-4 w-4" />
              </span>
              <span className="min-w-0 truncate text-[14px] font-semibold text-[var(--privora-text)]">{meta.title}</span>
            </button>
            <div className="relative flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setIsMenuOpen(open => !open)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--privora-muted)] transition-colors hover:bg-[var(--privora-text)]/[0.06] hover:text-[var(--privora-text)]"
                title="Download report"
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsViewerOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--privora-muted)] transition-colors hover:bg-[var(--privora-text)]/[0.06] hover:text-[var(--privora-text)]"
                title="Open full report"
              >
                <Maximize2 className="h-4 w-4" />
              </button>

              <AnimatePresence>
                {isMenuOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="Close export menu"
                      className="fixed inset-0 z-[75] cursor-default"
                      onClick={() => setIsMenuOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -4 }}
                      className="absolute right-0 top-9 z-[76] w-52 overflow-hidden rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] py-1.5 text-[14px] font-medium text-[var(--privora-text)] shadow-2xl"
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
            </div>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsViewerOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setIsViewerOpen(true);
              }
            }}
            className={cn(
              "relative block max-h-[28rem] w-full cursor-pointer overflow-hidden px-5 py-6 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--privora-accent)]/45 sm:px-8",
              "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-28 after:bg-gradient-to-t after:from-[var(--privora-surface)] after:to-transparent"
            )}
          >
            <div className="markdown-body pointer-events-none max-w-none text-[var(--privora-text)]">
              <MarkdownRenderer tableMode="preview">{report.content}</MarkdownRenderer>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 text-[var(--privora-muted)]">
          <button type="button" onClick={handleCopy} className="p-1 -m-1 transition-colors hover:text-[var(--privora-text)]" title="Copy contents">
            {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
          {typeof navigator.share === "function" && (
            <button type="button" onClick={handleShare} className="p-1 -m-1 transition-colors hover:text-[var(--privora-text)]" title="Share report">
              <Share2 className="h-4 w-4" />
            </button>
          )}
          {onOpenActivity && (
            <button type="button" onClick={onOpenActivity} className="p-1 -m-1 transition-colors hover:text-[var(--privora-text)]" title="Sources and activity">
              <MoreHorizontal className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={() => setIsViewerOpen(true)} className="p-1 -m-1 transition-colors hover:text-[var(--privora-text)]" title="Open full report">
            <ExternalLink className="h-4 w-4" />
          </button>
        </div>
      </div>

      <ResearchReportViewer
        isOpen={isViewerOpen}
        report={report}
        onClose={() => setIsViewerOpen(false)}
        onOpenActivity={onOpenActivity}
      />
    </>
  );
}
