import { Check, Circle, Clock3, ListTree, Loader2, Pencil, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { ResearchPlanRecord } from "../../../lib/db";
import { cn } from "../../../lib/utils";

interface ResearchPlanCardProps {
  plan: ResearchPlanRecord;
  disabled?: boolean;
  onStart?: () => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onStop?: () => void;
  onOpenActivity?: () => void;
  researchStartedAt?: number;
  researchCompletedAt?: number;
  researchSourceCount?: number;
}

const stepIcon = (status: string) => {
  if (status === "completed") return <Check className="h-4 w-4" />;
  if (status === "active") return <Loader2 className="h-4 w-4 animate-spin" />;
  return <Circle className="h-4 w-4" />;
};

const formatElapsed = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
};

export function ResearchPlanCard({
  plan,
  disabled,
  onStart,
  onEdit,
  onCancel,
  onStop,
  onOpenActivity,
  researchStartedAt,
  researchCompletedAt,
  researchSourceCount,
}: ResearchPlanCardProps) {
  const [now, setNow] = useState(() => Date.now());
  const completed = plan.steps.filter(step => step.status === "completed").length;
  const activeBonus = plan.steps.some(step => step.status === "active") ? 0.45 : 0;
  const progress = plan.progress ?? Math.min(100, ((completed + activeBonus) / Math.max(1, plan.steps.length)) * 100);
  const isDraft = plan.status === "draft" || plan.status === "editing";
  const isRunning = plan.status === "running";
  const elapsedMs = researchStartedAt
    ? (researchCompletedAt || (isRunning ? now : Date.now())) - researchStartedAt
    : undefined;

  useEffect(() => {
    if (!isRunning) return undefined;
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [isRunning]);

  return (
    <div className="w-full max-w-[38rem] rounded-2xl border border-[var(--privora-border)] bg-[var(--privora-surface)] p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[17px] font-semibold leading-snug text-[var(--privora-text)] sm:text-[18px]">
          {plan.title}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {plan.status === "editing" && (
            <span className="rounded-full border border-[var(--privora-border)] px-3 py-1 text-[12px] font-medium text-[var(--privora-muted)]">
              Editing
            </span>
          )}
          {onOpenActivity && (
            <button
              type="button"
              onClick={onOpenActivity}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--privora-border)] px-3 text-[12px] font-semibold text-[var(--privora-muted)] transition-colors hover:bg-[var(--privora-user-bubble)] hover:text-[var(--privora-text)]"
              title="Open research activity"
            >
              <ListTree className="h-3.5 w-3.5" />
              Activity
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {plan.steps.map((step, index) => (
          <div key={`${step.text}-${index}`} className="grid grid-cols-[1.25rem_1fr] gap-3">
            <span
              className={cn(
                "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full",
                step.status === "completed" && "bg-[var(--privora-text)] text-[var(--privora-bg)]",
                step.status === "active" && "text-[var(--privora-accent)]",
                step.status === "pending" && "text-[var(--privora-muted)]",
                step.status === "skipped" && "text-[var(--privora-muted)] opacity-50"
              )}
            >
              {stepIcon(step.status)}
            </span>
            <p className={cn("text-[14px] leading-relaxed", step.status === "pending" ? "text-[var(--privora-text)]/88" : "text-[var(--privora-text)]")}>
              {step.text}
            </p>
          </div>
        ))}
      </div>

      {isRunning && (
        <div className="mt-5">
          <div className="mb-3 text-[13px] text-[var(--privora-muted)]">
            {plan.currentActivity || "Researching..."}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] font-medium text-[var(--privora-muted)]">
            {elapsedMs !== undefined && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--privora-text)]/[0.05] px-2.5 py-1">
                <Clock3 className="h-3.5 w-3.5" />
                {formatElapsed(elapsedMs)}
              </span>
            )}
            {typeof researchSourceCount === "number" && researchSourceCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-[var(--privora-text)]/[0.05] px-2.5 py-1">
                {researchSourceCount} source{researchSourceCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--privora-text)]/8">
              <motion.div
                className="h-full rounded-full bg-[var(--privora-text)]"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.25 }}
              />
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={onStop}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--privora-text)]/10 text-[var(--privora-text)] transition-colors hover:bg-[var(--privora-text)]/15 disabled:opacity-50"
              title="Stop research"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          </div>
        </div>
      )}

      {isDraft && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={onEdit}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--privora-border)] px-3 py-2 text-[13px] font-semibold text-[var(--privora-text)] transition-colors hover:bg-[var(--privora-user-bubble)] disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={onCancel}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--privora-border)] px-3 py-2 text-[13px] font-semibold text-[var(--privora-text)] transition-colors hover:bg-[var(--privora-user-bubble)] disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={onStart}
              className="rounded-full bg-[var(--privora-accent)] px-4 py-2 text-[13px] font-semibold text-[var(--privora-accent-fg)] transition-colors hover:bg-[var(--privora-accent-hover)] disabled:opacity-50"
            >
              Start
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
