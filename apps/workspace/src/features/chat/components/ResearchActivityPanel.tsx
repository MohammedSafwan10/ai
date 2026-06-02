import { BookOpen, Search, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ResearchActivityRecord, ResearchPlanRecord } from "../../../lib/db";
import { cn } from "../../../lib/utils";

interface ResearchActivityPanelProps {
  isOpen: boolean;
  title?: string;
  plan?: ResearchPlanRecord;
  activity?: ResearchActivityRecord[];
  onClose: () => void;
}

const phaseIcon = (phase: string) => {
  if (phase === "searching" || phase === "source" || phase === "heartbeat") return Search;
  if (phase === "reading" || phase === "comparing") return BookOpen;
  return Sparkles;
};

export function ResearchActivityPanel({ isOpen, title, plan, activity = [], onClose }: ResearchActivityPanelProps) {
  const visibleActivity = activity.filter(item => item.phase !== "debug");

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/20 md:hidden"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%", y: 0 }}
            animate={{ x: 0, y: 0 }}
            exit={{ x: "100%", y: 0 }}
            transition={{ type: "spring", stiffness: 360, damping: 36 }}
            className={cn(
              "fixed right-0 top-0 z-50 flex h-[var(--privora-app-height,100dvh)] w-full max-w-[24rem] flex-col border-l border-[var(--privora-border)] bg-[var(--privora-bg)] text-[var(--privora-text)] shadow-2xl",
              "max-md:top-auto max-md:bottom-0 max-md:h-[72dvh] max-md:max-w-none max-md:rounded-t-3xl max-md:border-l-0 max-md:border-t"
            )}
          >
            <div className="flex items-center justify-between border-b border-[var(--privora-border)] px-5 py-4">
              <h2 className="min-w-0 truncate text-[18px] font-semibold">{title || plan?.title || "Deep Research"}</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--privora-muted)] transition-colors hover:bg-[var(--privora-user-bubble)] hover:text-[var(--privora-text)]"
                title="Close research activity"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="mb-4 text-[13px] font-semibold text-[var(--privora-muted)]">Research activity</div>
              {visibleActivity.length === 0 ? (
                <p className="text-[13px] text-[var(--privora-muted)]">Nothing to show here yet</p>
              ) : (
                <div className="flex flex-col gap-5">
                  {visibleActivity.map((item, index) => {
                    const Icon = phaseIcon(item.phase);
                    return (
                      <div key={`${item.timestamp}-${index}`} className="grid grid-cols-[1rem_1fr] gap-3">
                        <span className="mt-1 flex h-4 w-4 items-center justify-center rounded-full text-[var(--privora-muted)]">
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 border-l border-[var(--privora-border)] pl-4">
                          <div className="text-[14px] font-medium leading-relaxed">{item.title}</div>
                          {item.detail && (
                            <p className="mt-1 max-h-24 overflow-hidden break-words text-[13px] leading-relaxed text-[var(--privora-muted)]">
                              {item.detail}
                            </p>
                          )}
                          {item.source?.url && (
                            <a
                              href={item.source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 block break-all text-[12px] text-[var(--privora-accent)] underline decoration-[var(--privora-border)] underline-offset-4"
                            >
                              {item.source.title || item.source.url}
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
