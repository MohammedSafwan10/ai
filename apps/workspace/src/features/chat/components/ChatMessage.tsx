import { memo, useState, useEffect, useRef } from "react";
import { cn } from "../../../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { AlertCircle, CheckCircle2, CircleDashed, Copy, ExternalLink, Files, ThumbsUp, ThumbsDown, RotateCcw, ChevronDown, Check, Pencil, Globe, Share2, Clock3, CornerDownRight, GitCompare, X } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ImageGenerationCard } from "./ImageGenerationCard";
import { ResearchPlanCard } from "./ResearchPlanCard";
import { ResearchReportCard } from "./ResearchReportCard";
import { TypingIndicator } from "./TypingIndicator";
import { ClashIcon } from "./ClashIcon";
import { ArtifactCard } from "../../artifacts/components/ArtifactCard";
import type { ArtifactReferenceRecord, ClashRecord, CommandAgentAction, ImageGenerationRecord, DebateRecord, ResearchPlanRecord, ResearchSourceRecord, ResearchStatus } from "../../../lib/db";
import { copyTextToClipboard } from "../../../lib/clipboard";
import { useToast } from "../../ui/ToastProvider";
import { useAttachmentUrl } from "../../attachments/hooks/useAttachmentUrl";

interface Attachment {
  url: string;
  base64?: string;
  blob?: Blob | File;
  mimeType: string;
  name: string;
}

function AttachmentImage({ attachment, alt, className }: { attachment: Attachment; alt?: string; className?: string }) {
  const url = useAttachmentUrl(attachment);
  return <img src={url} alt={alt} className={className} referrerPolicy="no-referrer" />;
}

interface ChatMessageProps {
  id: string;
  role: "user" | "model";
  content: string;
  thought?: string;
  isThinking?: boolean;
  webSearchStatus?: "searching" | "searched";
  webSearchQueries?: string[];
  researchStatus?: ResearchStatus;
  researchSources?: ResearchSourceRecord[];
  researchPreflight?: "clarifying";
  researchPlan?: ResearchPlanRecord;
  researchPlanReference?: {
    title: string;
    messageId?: string;
  };
  researchStartedAt?: number;
  researchCompletedAt?: number;
  researchTimeBudgetMs?: number;
  imageGeneration?: ImageGenerationRecord;
  debate?: DebateRecord;
  clash?: ClashRecord;
  agentActions?: CommandAgentAction[];
  agentSessionId?: string;
  artifact?: ArtifactReferenceRecord;
  isTyping?: boolean;
  messageIndex?: number;
  messageCount?: number;
  onEdit?: () => void;
  onRetry?: () => void;
  onStartResearchPlan?: () => void;
  onEditResearchPlan?: () => void;
  onCancelResearchPlan?: () => void;
  onStopResearchPlan?: () => void;
  onOpenResearchActivity?: () => void;
  onOpenArtifact?: () => void;
  onOpenCommandTarget?: (targetType: CommandAgentAction["targetType"], targetId?: string) => void;
  onUndoCommandAction?: (messageId: string, actionId: string) => void;
  onUndoCommandSession?: (messageId: string) => void;
  onRedoCommandSession?: (messageId: string) => void;
  onConfirmCommandAction?: (messageId: string, actionId: string) => void;
  onUpdateDuplicateCommandAction?: (messageId: string, actionId: string) => void;
  onFindAlternativeCommandAction?: (messageId: string, actionId: string) => void;
  onConfirmAllCommandActions?: (messageId: string) => void;
  onCancelCommandAction?: (messageId: string, actionId: string) => void;
  onOpenCodePlayground?: (code: string, language: string) => void;
  onEditGeneratedImage?: (attachment: Attachment) => void;
  attachments?: Attachment[];
  onPreviewAttachment?: (att: Attachment) => void;
  hideActions?: boolean;
}

const formatElapsed = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
};

function DebateCard({
  debate,
  onCopyText,
  onRetry,
  onShareText,
}: {
  debate: DebateRecord;
  onCopyText: (text: string, description?: string) => void;
  onRetry?: () => void;
  onShareText: (text: string) => void;
}) {
  const debaters = debate.agents.filter(agent => agent.id !== "judge");
  const judge = debate.agents.find(agent => agent.id === "judge");
  const fullDebateText = [
    `Prompt:\n${debate.prompt}`,
    ...debaters.map(agent => `${agent.label}:\n${agent.content}`),
    judge ? `${judge.label}:\n${judge.content}` : "",
  ].filter(Boolean).join("\n\n");
  const verdictText = judge?.content || fullDebateText;
  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--privora-border)]/50 pb-2">
        <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[var(--privora-text)]">
          <GitCompare className="h-4 w-4 shrink-0 text-[var(--privora-accent)]" />
          <span>Debate</span>
        </div>
      </div>
      <div className="grid w-full gap-5 lg:grid-cols-2">
        {debaters.map(agent => (
          <section key={agent.id} className="min-w-0 border-l border-[var(--privora-border)]/70 pl-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[var(--privora-text)]">{agent.label}</div>
                <div className="truncate text-[11px] text-[var(--privora-muted)]">{agent.model}</div>
              </div>
            </div>
            <div className="markdown-body max-w-none text-[13px] leading-6 text-[var(--privora-text)]">
              {agent.content ? <MarkdownRenderer compact isStreaming={agent.status === "streaming"}>{agent.content}</MarkdownRenderer> : <TypingIndicator size={18} isAnimating={agent.status === "streaming" || agent.status === "queued"} />}
              {agent.error && <div className="text-red-500">{agent.error}</div>}
            </div>
          </section>
        ))}
      </div>
      {judge && (
        <section className="mt-6 border-t border-[var(--privora-border)]/50 pt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-[13px] font-semibold text-[var(--privora-text)]">{judge.label}</div>
              <div className="text-[11px] text-[var(--privora-muted)]">{judge.model}</div>
            </div>
          </div>
          <div className="markdown-body max-w-none text-[14px] leading-7 text-[var(--privora-text)]">
            {judge.content ? <MarkdownRenderer isStreaming={judge.status === "streaming"}>{judge.content}</MarkdownRenderer> : <TypingIndicator size={18} isAnimating={judge.status === "streaming" || judge.status === "queued"} />}
            {judge.error && <div className="text-red-500">{judge.error}</div>}
          </div>
        </section>
      )}
      {debate.status !== "streaming" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[var(--privora-muted)]">
          <button type="button" onClick={() => onCopyText(verdictText, "Verdict copied.")} className="p-1 -m-1 transition hover:text-[var(--privora-text)]" title="Copy verdict" aria-label="Copy verdict">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => onCopyText(fullDebateText, "Full debate copied.")} className="p-1 -m-1 transition hover:text-[var(--privora-text)]" title="Copy full debate" aria-label="Copy full debate">
            <Files className="h-3.5 w-3.5" />
          </button>
          {onRetry && (
            <button type="button" onClick={onRetry} className="p-1 -m-1 transition hover:text-[var(--privora-text)]" title="Retry debate" aria-label="Retry debate">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={() => onShareText(verdictText)} className="p-1 -m-1 transition hover:text-[var(--privora-text)]" title="Share verdict" aria-label="Share verdict">
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

const getClashActionLabel = (action: string) => action.charAt(0).toUpperCase() + action.slice(1);
const getClashStatusLabel = (clash: ClashRecord) => {
  if (clash.status === "streaming") {
    const currentRound = Math.min(clash.maxRounds, Math.ceil(clash.turns.length / 2));
    return `${currentRound}/${clash.maxRounds} rounds`;
  }
  if (clash.status === "capped") return "cap reached";
  return clash.status;
};

function ClashCard({
  clash,
  onCopyText,
  onRetry,
  onShareText,
}: {
  clash: ClashRecord;
  onCopyText: (text: string, description?: string) => void;
  onRetry?: () => void;
  onShareText: (text: string) => void;
}) {
  const [activeMobileAgent, setActiveMobileAgent] = useState<"a" | "b">("a");
  const [openThoughtTurnId, setOpenThoughtTurnId] = useState<string | null>(null);
  const [clashTick, setClashTick] = useState(() => Date.now());
  const activeSpeaker = [...clash.turns].reverse().find(turn => turn.status === "streaming")?.speaker;
  const turnsByAgent = (agentId: "a" | "b") => clash.turns.filter(turn => turn.speaker === agentId);
  const lastContentForAgent = (agentId: "a" | "b") =>
    [...turnsByAgent(agentId)].reverse().find(turn => turn.content.trim())?.content.trim();

  useEffect(() => {
    if (!clash.turns.some(turn => turn.status === "streaming")) return;
    const interval = window.setInterval(() => setClashTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [clash.turns]);

  const fullClashText = [
    `Prompt:\n${clash.prompt}`,
    ...clash.turns.map(turn => `${turn.speaker === "a" ? "Agent A" : "Agent B"} - round ${turn.round} (${turn.action}):\n${turn.content}`),
    clash.conclusion ? `Shared conclusion:\n${clash.conclusion}` : "",
  ].filter(Boolean).join("\n\n");
  const splitOutcomeText = [
    "No full agreement.",
    lastContentForAgent("a") ? `Agent A final position:\n${lastContentForAgent("a")}` : "",
    lastContentForAgent("b") ? `Agent B final position:\n${lastContentForAgent("b")}` : "",
  ].filter(Boolean).join("\n\n");
  const verdictText = clash.conclusion || splitOutcomeText || fullClashText;

  const renderAgentPanel = (agentId: "a" | "b") => {
    const agent = clash.agents.find(item => item.id === agentId);
    const agentTurns = turnsByAgent(agentId);
    const isActive = activeSpeaker === agentId;
    return (
      <section
        key={agentId}
        className={cn(
          "min-w-0 border-t border-[var(--privora-border)]/55 pt-3 transition-colors lg:border-t-0 lg:pt-0",
          agentId === "b" ? "lg:border-l lg:border-[var(--privora-border)]/55 lg:pl-5" : "lg:pr-2",
          activeMobileAgent !== agentId && "hidden lg:block"
        )}
      >
        <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--privora-text)]">
              {isActive && <span className="h-2 w-2 rounded-full bg-[var(--privora-accent)] animate-pulse" />}
              <span>{agent?.label || (agentId === "a" ? "Agent A" : "Agent B")}</span>
            </div>
            <div className="mt-0.5 truncate text-[11px] text-[var(--privora-muted)]">{agent?.model}</div>
          </div>
          <span className={cn(
            "shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em]",
            isActive ? "text-[var(--privora-accent)]" : "text-[var(--privora-muted)]"
          )}>
            {agent?.status || "queued"}
          </span>
        </div>
        <div className="space-y-4">
          {agentTurns.length === 0 ? (
            <div className="flex min-h-20 items-center border-l border-dashed border-[var(--privora-border)]/70 pl-3 text-[var(--privora-muted)]">
              <TypingIndicator size={18} isAnimating={clash.status === "streaming"} />
            </div>
          ) : agentTurns.map(turn => (
            <article
              key={turn.id}
              className={cn(
                "border-l py-0.5 pl-3",
                turn.status === "streaming" ? "border-[var(--privora-accent)]/70" : "border-[var(--privora-border)]/70"
              )}
            >
              <div className="mb-2 flex items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--privora-muted)]">
                <span>Round {turn.round}</span>
                <span>{getClashActionLabel(turn.action)}</span>
              </div>
              {(turn.thought || (turn.status === "streaming" && !turn.content)) && (
                <div className="mb-2">
                  <button
                    type="button"
                    disabled={!turn.thought}
                    onClick={() => setOpenThoughtTurnId(openThoughtTurnId === turn.id ? null : turn.id)}
                    className={cn(
                      "inline-flex items-center gap-2 py-1 text-[12px] font-medium transition-colors",
                      turn.status === "streaming" ? "text-[var(--privora-accent)]" : "text-[var(--privora-muted)]",
                      turn.thought ? "hover:text-[var(--privora-text)]" : "cursor-default"
                    )}
                  >
                    <TypingIndicator
                      size={16}
                      className="shrink-0 text-current"
                      isAnimating={turn.status === "streaming"}
                    />
                    <span className={cn(turn.status === "streaming" && "animate-text-shimmer")}>
                      {turn.status === "streaming" ? `Thinking ${formatElapsed(clashTick - turn.createdAt)}` : "Thought process"}
                    </span>
                    {turn.thought && (
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 transition-transform",
                          openThoughtTurnId === turn.id || turn.status === "streaming" ? "rotate-0" : "-rotate-90"
                        )}
                      />
                    )}
                  </button>
                  {turn.thought && (openThoughtTurnId === turn.id || turn.status === "streaming") && (
                    <div className="mt-1 border-l border-[var(--privora-border)]/70 pl-3 text-[12.5px] leading-6 text-[var(--privora-muted)]">
                      <MarkdownRenderer compact isStreaming={turn.status === "streaming"}>{turn.thought}</MarkdownRenderer>
                    </div>
                  )}
                </div>
              )}
              <div className="markdown-body max-w-none text-[13.5px] leading-6 text-[var(--privora-text)]">
                {turn.content ? (
                  <MarkdownRenderer compact isStreaming={turn.status === "streaming"}>{turn.content}</MarkdownRenderer>
                ) : (
                  <TypingIndicator size={18} isAnimating={turn.status === "streaming" || turn.status === "queued"} />
                )}
                {turn.status === "error" && <div className="mt-2 text-red-500">This turn failed.</div>}
              </div>
            </article>
          ))}
          {agent?.error && <div className="text-[13px] text-red-500">{agent.error}</div>}
        </div>
      </section>
    );
  };

  return (
    <div className="w-full">
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-[var(--privora-border)]/45 pb-2">
        <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[var(--privora-text)]">
          <ClashIcon className="h-4 w-4 shrink-0 text-[var(--privora-accent)]" />
          <span>Clash</span>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-[var(--privora-muted)]">
          {getClashStatusLabel(clash)}
        </span>
      </div>

      <div className="mb-4 flex border-b border-[var(--privora-border)]/55 lg:hidden">
        {(["a", "b"] as const).map(agentId => (
          <button
            key={agentId}
            type="button"
            onClick={() => setActiveMobileAgent(agentId)}
            className={cn(
              "-mb-px flex-1 border-b-2 px-3 py-2 text-[12px] font-semibold transition-colors",
              activeMobileAgent === agentId
                ? "border-[var(--privora-accent)] text-[var(--privora-text)]"
                : "border-transparent text-[var(--privora-muted)] hover:text-[var(--privora-text)]"
            )}
          >
            {agentId === "a" ? "Agent A" : "Agent B"}
          </button>
        ))}
      </div>

      <div className="grid w-full gap-4 lg:grid-cols-2">
        {renderAgentPanel("a")}
        {renderAgentPanel("b")}
      </div>

      {clash.conclusion && (
        <section className="mt-5 border-t border-[var(--privora-border)]/55 pt-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--privora-muted)]">Shared conclusion</div>
          <div className="markdown-body max-w-none border-l-2 border-[var(--privora-accent)]/60 pl-3 text-[14px] leading-7 text-[var(--privora-text)]">
            <MarkdownRenderer>{clash.conclusion}</MarkdownRenderer>
          </div>
        </section>
      )}

      {clash.status === "capped" && !clash.conclusion && (
        <section className="mt-5 border-t border-[var(--privora-border)]/55 pt-4">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--privora-muted)]">No full agreement</div>
          <div className="grid gap-4 lg:grid-cols-2">
            {(["a", "b"] as const).map(agentId => (
              <div key={agentId} className="min-w-0 border-l border-[var(--privora-border)]/70 pl-3">
                <div className="mb-1 text-[13px] font-semibold text-[var(--privora-text)]">{agentId === "a" ? "Agent A" : "Agent B"}</div>
                <div className="markdown-body max-w-none text-[13px] leading-6 text-[var(--privora-text)]">
                  <MarkdownRenderer compact>{lastContentForAgent(agentId) || "No final position."}</MarkdownRenderer>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {clash.status !== "streaming" && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--privora-border)]/35 pt-3 text-[var(--privora-muted)]">
          <button type="button" onClick={() => onCopyText(verdictText, "Clash result copied.")} className="p-1 -m-1 transition hover:text-[var(--privora-text)]" title="Copy result" aria-label="Copy result">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => onCopyText(fullClashText, "Full clash copied.")} className="p-1 -m-1 transition hover:text-[var(--privora-text)]" title="Copy full clash" aria-label="Copy full clash">
            <Files className="h-3.5 w-3.5" />
          </button>
          {onRetry && (
            <button type="button" onClick={onRetry} className="p-1 -m-1 transition hover:text-[var(--privora-text)]" title="Retry clash" aria-label="Retry clash">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={() => onShareText(verdictText)} className="p-1 -m-1 transition hover:text-[var(--privora-text)]" title="Share result" aria-label="Share result">
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function AgentActionsStrip({
  messageId,
  actions,
  sessionSummary,
  isOperationActive,
  onOpenCommandTarget,
  onUndoCommandAction,
  onUndoCommandSession,
  onRedoCommandSession,
  onConfirmCommandAction,
  onUpdateDuplicateCommandAction,
  onFindAlternativeCommandAction,
  onConfirmAllCommandActions,
  onCancelCommandAction,
}: {
  messageId: string;
  actions: CommandAgentAction[];
  sessionSummary?: string;
  isOperationActive?: boolean;
  onOpenCommandTarget?: (targetType: CommandAgentAction["targetType"], targetId?: string) => void;
  onUndoCommandAction?: (messageId: string, actionId: string) => void;
  onUndoCommandSession?: (messageId: string) => void;
  onRedoCommandSession?: (messageId: string) => void;
  onConfirmCommandAction?: (messageId: string, actionId: string) => void;
  onUpdateDuplicateCommandAction?: (messageId: string, actionId: string) => void;
  onFindAlternativeCommandAction?: (messageId: string, actionId: string) => void;
  onConfirmAllCommandActions?: (messageId: string) => void;
  onCancelCommandAction?: (messageId: string, actionId: string) => void;
}) {
  if (actions.length === 0) return null;

  const hasActiveAction = actions.some(action => action.status === "preparing" || action.status === "running");
  const hasPendingAction = actions.some(action => action.status === "pending");
  const failedCount = actions.filter(action => action.status === "failed").length;
  const completedMutationCount = actions.filter(action => action.action !== "search" && action.status === "done").length;
  const undoneMutationCount = actions.filter(action => action.action !== "search" && action.status === "undone").length;
  const reversibleMutationCount = actions.filter(action =>
    action.action !== "search" && action.status === "done" && action.canUndo && action.activityId
  ).length;
  const completedLookupCount = actions.filter(action =>
    action.action === "search" && (action.status === "done" || action.status === "undone")
  ).length;
  const isStoppedSession = Boolean(sessionSummary?.startsWith("Stopped."));
  const [isOpen, setIsOpen] = useState(Boolean(isOperationActive) || hasActiveAction || hasPendingAction);
  const [sessionConfirmation, setSessionConfirmation] = useState<"undo" | "redo" | null>(null);

  useEffect(() => {
    if (isOperationActive || hasActiveAction || hasPendingAction || isStoppedSession) setIsOpen(true);
    else if (failedCount === 0) setIsOpen(false);
  }, [isOperationActive, hasActiveAction, hasPendingAction, failedCount, isStoppedSession]);

  const getStatusIcon = (action: CommandAgentAction) => {
    if (action.status === "preparing" || action.status === "running") return <CircleDashed className="h-3.5 w-3.5 animate-spin" />;
    if (action.status === "failed") return <AlertCircle className="h-3.5 w-3.5" />;
    if (action.status === "pending") return <CircleDashed className="h-3.5 w-3.5" />;
    if (action.status === "cancelled") return <X className="h-3.5 w-3.5" />;
    return <CheckCircle2 className="h-3.5 w-3.5" />;
  };

  const getGroupIcon = () => {
    if (isOperationActive || hasActiveAction) return <CircleDashed className="h-3.5 w-3.5 animate-spin text-[var(--privora-accent)]" />;
    if (failedCount > 0) return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
    if (hasPendingAction) return <CircleDashed className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />;
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />;
  };

  const getGroupLabel = () => {
    if (hasActiveAction) {
      const active = actions.find(action => action.status === "running" || action.status === "preparing");
      return active?.targetTitle ? `Working on ${active.targetTitle}` : "Working in Command Center";
    }
    if (hasPendingAction) {
      const pendingCount = actions.filter(action => action.status === "pending").length;
      return `${completedMutationCount} changes ready · ${pendingCount} need confirmation`;
    }
    if (isOperationActive) {
      return completedMutationCount > 0
        ? `Working · ${completedMutationCount} ${completedMutationCount === 1 ? "change" : "changes"} so far`
        : "Working in Command Center";
    }
    if (failedCount > 0) return `${failedCount} failed · ${completedMutationCount} changes complete`;
    if (undoneMutationCount > 0 && completedMutationCount > 0) {
      return `${undoneMutationCount} undone · ${completedMutationCount} kept`;
    }
    if (undoneMutationCount > 0) {
      return `${undoneMutationCount} ${undoneMutationCount === 1 ? "change" : "changes"} undone`;
    }
    if (isStoppedSession) return `Stopped · ${completedMutationCount} change${completedMutationCount === 1 ? "" : "s"} kept`;
    if (completedMutationCount > 0) return `${completedMutationCount} ${completedMutationCount === 1 ? "change" : "changes"} complete`;
    return `${completedLookupCount} ${completedLookupCount === 1 ? "check" : "checks"} complete`;
  };

  return (
    <div className="mb-3 w-full max-w-[46rem] py-1 text-[13px] text-[var(--privora-muted)]">
      <button
        type="button"
        onClick={() => setIsOpen(value => !value)}
        className={cn(
          "inline-flex max-w-full items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-left transition hover:border-[var(--privora-border)] hover:bg-[var(--privora-surface)] hover:text-[var(--privora-text)]",
          isOpen && "border-[var(--privora-border)] bg-[var(--privora-surface)]/45"
        )}
      >
        {getGroupIcon()}
        <span className={cn("min-w-0 truncate", (isOperationActive || hasActiveAction) && "animate-text-shimmer")}>{getGroupLabel()}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", !isOpen && "-rotate-90")} />
      </button>
      {!isOperationActive && !hasActiveAction && !hasPendingAction && reversibleMutationCount > 0 && onUndoCommandSession && (
        <button type="button" onClick={() => setSessionConfirmation("undo")} className="ml-2 px-1.5 py-1 text-[12px] font-semibold text-[var(--privora-muted)] hover:text-[var(--privora-text)]">
          Undo session
        </button>
      )}
      {!isOperationActive && !hasActiveAction && !hasPendingAction && undoneMutationCount > 0 && onRedoCommandSession && (
        <button type="button" onClick={() => setSessionConfirmation("redo")} className="ml-2 px-1.5 py-1 text-[12px] font-semibold text-[var(--privora-muted)] hover:text-[var(--privora-text)]">
          Redo session
        </button>
      )}
      {hasPendingAction && !actions.some(action => action.status === "pending" && (action.confirmationKind === "duplicate" || action.confirmationKind === "conflict")) && actions.filter(action => action.status === "pending").length > 1 && onConfirmAllCommandActions && (
        <button type="button" onClick={() => onConfirmAllCommandActions(messageId)} className="ml-2 rounded-md border border-[var(--privora-border)]/55 px-2 py-1 text-[12px] font-semibold text-[var(--privora-text)] hover:bg-[var(--privora-text)]/5">
          Confirm all
        </button>
      )}
      <AnimatePresence initial={false}>
        {sessionConfirmation && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            className="flex max-w-[35rem] flex-wrap items-center gap-2 overflow-hidden border-l border-[var(--privora-border)]/70 pl-3 text-[12px]"
          >
            <span className="mr-1 text-[var(--privora-text)]">
              {sessionConfirmation === "undo"
                ? `Undo ${reversibleMutationCount} completed change${reversibleMutationCount === 1 ? "" : "s"}?`
                : `Redo ${undoneMutationCount} undone change${undoneMutationCount === 1 ? "" : "s"}?`}
            </span>
            <button
              type="button"
              onClick={() => {
                if (sessionConfirmation === "undo") onUndoCommandSession?.(messageId);
                else onRedoCommandSession?.(messageId);
                setSessionConfirmation(null);
              }}
              className="rounded-md border border-[var(--privora-border)]/65 px-2 py-1 font-semibold text-[var(--privora-text)] hover:bg-[var(--privora-text)]/5"
            >
              Confirm {sessionConfirmation}
            </button>
            <button type="button" onClick={() => setSessionConfirmation(null)} className="px-1.5 py-1 font-semibold hover:text-[var(--privora-text)]">
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="ml-5 mt-1.5 space-y-0.5 border-l border-[var(--privora-border)]/65 pl-3">
              {actions.map(action => (
                <div
                  key={action.id}
                  className={cn(
                    "flex flex-col gap-2 py-1.5 text-[13px] transition-colors sm:flex-row sm:items-center sm:justify-between",
                    action.status === "failed" ? "text-red-500" : "text-[var(--privora-muted)]"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onOpenCommandTarget?.(action.targetType, action.targetId)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className={cn(
                      "shrink-0",
                      action.status === "done" ? "text-emerald-600 dark:text-emerald-300" :
                      action.status === "failed" ? "text-red-500" :
                      action.status === "pending" ? "text-amber-600 dark:text-amber-300" :
                      action.status === "preparing" ? "text-[var(--privora-muted)]" :
                      "text-[var(--privora-accent)]"
                    )}>
                      {getStatusIcon(action)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-[var(--privora-text)]">
                        {action.detail || action.action} · {action.targetTitle}
                      </span>
                      <span className="block truncate text-[11px] capitalize text-[var(--privora-muted)]">
                        {action.targetType}{action.status === "done" ? "" : ` · ${action.status}`}{action.changePreview ? ` · ${action.changePreview}` : ""}{action.error ? ` · ${action.error}` : ""}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-2 pl-5 sm:pl-0">
                    {action.status === "pending" && (
                      <>
                        {action.confirmationKind === "duplicate" && action.targetType === "task" && (
                          <button type="button" onClick={() => onUpdateDuplicateCommandAction?.(messageId, action.id)} className="rounded-md border border-[var(--privora-border)]/55 px-2 py-1 text-[12px] font-semibold hover:bg-[var(--privora-text)]/5">Update existing</button>
                        )}
                        {action.confirmationKind === "conflict" && (
                          <button type="button" onClick={() => onFindAlternativeCommandAction?.(messageId, action.id)} className="rounded-md border border-[var(--privora-border)]/55 px-2 py-1 text-[12px] font-semibold hover:bg-[var(--privora-text)]/5">Find another time</button>
                        )}
                        <button type="button" onClick={() => onConfirmCommandAction?.(messageId, action.id)} className="rounded-md border border-[var(--privora-border)]/55 px-2 py-1 text-[12px] font-semibold hover:bg-[var(--privora-text)]/5">{action.confirmationKind === "duplicate" ? "Create another" : action.confirmationKind === "conflict" ? "Schedule anyway" : "Confirm"}</button>
                        <button type="button" onClick={() => onCancelCommandAction?.(messageId, action.id)} className="px-1.5 py-1 text-[12px] font-semibold text-[var(--privora-muted)] hover:text-[var(--privora-text)]">{action.confirmationKind === "duplicate" && action.targetType === "finance" ? "Keep existing" : "Cancel"}</button>
                      </>
                    )}
                    {action.canUndo && (action.status === "done" || action.status === "undone") && (
                      <button type="button" disabled={action.status === "undone"} onClick={() => onUndoCommandAction?.(messageId, action.id)} className="px-1.5 py-1 text-[12px] font-semibold text-[var(--privora-muted)] hover:text-[var(--privora-text)] disabled:cursor-not-allowed disabled:opacity-40">
                        Undo
                      </button>
                    )}
                    {action.targetId && (
                      <button type="button" onClick={() => onOpenCommandTarget?.(action.targetType, action.targetId)} className="p-1.5 text-[var(--privora-muted)] hover:text-[var(--privora-text)]" title="Open in Command Center">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChatMessageComponent({ id, role, content, thought, isThinking, webSearchStatus, webSearchQueries, researchStatus, researchSources, researchPreflight, researchPlan, researchPlanReference, researchStartedAt, researchCompletedAt, researchTimeBudgetMs, imageGeneration, debate, clash, agentActions, artifact, isTyping, messageIndex, onEdit, onRetry, onStartResearchPlan, onEditResearchPlan, onCancelResearchPlan, onStopResearchPlan, onOpenResearchActivity, onOpenArtifact, onOpenCommandTarget, onUndoCommandAction, onUndoCommandSession, onRedoCommandSession, onConfirmCommandAction, onUpdateDuplicateCommandAction, onFindAlternativeCommandAction, onConfirmAllCommandActions, onCancelCommandAction, onOpenCodePlayground, onEditGeneratedImage, attachments, onPreviewAttachment, hideActions }: ChatMessageProps) {
  const isUser = role === "user";
  const [isThoughtOpen, setIsThoughtOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const contentRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const { notify } = useToast();
  const isResearchRunning = !isUser && researchPlan?.status === "running";
  const isImageGenerationMessage = !isUser && Boolean(imageGeneration);
  const isDebateMessage = !isUser && Boolean(debate);
  const isClashMessage = !isUser && Boolean(clash);
  const isCompletedResearchReport = !isUser && Boolean(content) && researchStatus === "completed" && Boolean(researchPlan);
  const shouldRenderContent = !isResearchRunning && !isImageGenerationMessage && !isDebateMessage && !isClashMessage && (content || (!isUser && isTyping && !isThinking));
  const shouldRenderThoughtPanel = !isUser && !isDebateMessage && !isClashMessage && (thought || isThinking);
  const researchElapsedMs = researchStartedAt && researchCompletedAt ? researchCompletedAt - researchStartedAt : undefined;

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(content);
      setIsCopied(true);
      setIsMenuOpen(false);
      notify({ title: "Copied", description: isUser ? "Message copied." : "Response copied.", variant: "success" });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy message", error);
      notify({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "error" });
    }
  };

  const copyCustomText = async (text: string, description = "Copied.") => {
    try {
      await copyTextToClipboard(text);
      notify({ title: "Copied", description, variant: "success" });
    } catch (error) {
      console.error("Failed to copy message", error);
      notify({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "error" });
    }
  };

  const shareCustomText = async (text: string) => {
    if (!navigator.share) {
      setIsMenuOpen(false);
      notify({ title: "Share unavailable", description: "This browser does not support native sharing.", variant: "error" });
      return;
    }

    try {
      await navigator.share({ title: "Privora message", text });
      notify({ title: "Shared", description: "Message shared.", variant: "success" });
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        console.error("Failed to share message", error);
        notify({ title: "Share failed", description: "Your browser could not share this message.", variant: "error" });
      }
    } finally {
      setIsMenuOpen(false);
    }
  };

  const handleShare = async () => {
    await shareCustomText(content);
  };

  const openMessageMenu = (clientX: number, clientY: number) => {
    if (!content && !isUser) return;

    const menuWidth = 210;
    const menuHeight = 188;
    const x = Math.min(Math.max(12, clientX), window.innerWidth - menuWidth - 12);
    const y = Math.min(Math.max(12, clientY), window.innerHeight - menuHeight - 12);
    setMenuPosition({ x, y });
    setIsMenuOpen(true);
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const isMessageMenuTarget = (target: EventTarget | null) => (
    target instanceof Element && Boolean(target.closest("[data-message-menu-zone='true']"))
  );

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!isUser) return;
    if (event.pointerType !== "touch") return;
    if (!isMessageMenuTarget(event.target)) return;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      openMessageMenu(event.clientX, event.clientY);
    }, 520);
  };

  const handlePointerMove = () => {
    clearLongPressTimer();
  };

  const handlePointerEnd = () => {
    clearLongPressTimer();
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    if (!isUser) return;
    if (!isMessageMenuTarget(event.target)) return;
    event.preventDefault();
    openMessageMenu(event.clientX, event.clientY);
  };
  
  useEffect(() => {
    return () => clearLongPressTimer();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "w-full flex mb-6 px-4 md:px-6 group",
        isUser ? "justify-end" : "justify-start"
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90]"
              onClick={() => setIsMenuOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.12 }}
              className="fixed z-[91] w-[210px] overflow-hidden rounded-2xl border border-[var(--privora-border)] bg-[var(--privora-surface)] py-2 text-[var(--privora-text)] shadow-2xl"
              style={{ left: menuPosition.x, top: menuPosition.y }}
            >
              <button type="button" onClick={handleCopy} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] font-medium transition-colors hover:bg-[var(--privora-text)]/5">
                {isCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Copy
              </button>
              {isUser && onEdit && (
                <button type="button" onClick={() => { setIsMenuOpen(false); onEdit(); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] font-medium transition-colors hover:bg-[var(--privora-text)]/5">
                  <Pencil className="h-4 w-4" />
                  Edit Message
                </button>
              )}
              {onRetry && (
                <button type="button" onClick={() => { setIsMenuOpen(false); onRetry(); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] font-medium transition-colors hover:bg-[var(--privora-text)]/5">
                  <RotateCcw className="h-4 w-4" />
                  Retry
                </button>
              )}
              {Boolean(navigator.share) && (
                <button type="button" onClick={handleShare} className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] font-medium transition-colors hover:bg-[var(--privora-text)]/5">
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <div className="relative flex w-full max-w-full flex-col items-start">
        {isUser && researchPlanReference && (
          <div className="mb-2 flex max-w-[85%] items-center gap-1.5 self-end pr-2 text-[12px] font-medium text-[var(--privora-muted)] sm:max-w-xl">
            <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{researchPlanReference.title}</span>
          </div>
        )}

        {attachments && attachments.length > 0 && !isImageGenerationMessage && (
          <div className={cn(
            "flex flex-wrap gap-2.5 mb-2 w-full",
            isUser ? "justify-end self-end max-w-[85%] sm:max-w-xl" : "justify-start"
          )}>
            {attachments.map((att, i) => (
              att.mimeType.startsWith("image/") ? (
                <div key={i} className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl border border-[var(--privora-border)]/50 overflow-hidden flex-shrink-0 shadow-sm cursor-pointer" onClick={() => onPreviewAttachment?.(att)}>
                  <AttachmentImage attachment={att} alt={att.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div key={i} className="flex flex-col items-center justify-center gap-1.5 bg-[var(--privora-surface)] px-4 py-3 border border-[var(--privora-border)]/50 rounded-xl text-[var(--privora-text)] shadow-sm max-w-[140px] sm:max-w-[160px] text-center cursor-pointer" onClick={() => onPreviewAttachment?.(att)}>
                   <span className="font-semibold opacity-70 uppercase tracking-widest text-[9px] w-full border-b border-[var(--privora-border)]/50 pb-1.5 mb-1">{att.name.split('.').pop()}</span>
                   <span className="truncate text-xs font-medium w-full">{att.name}</span>
                </div>
              )
            ))}
          </div>
        )}
        
        {(!isUser || content) && (
          <div 
            data-message-menu-zone={isUser ? "true" : undefined}
            onContextMenu={handleContextMenu}
            className={cn(
              "flex flex-col gap-2",
              isUser 
                ? "items-end bg-[var(--privora-user-bubble)] px-5 py-3.5 rounded-[24px] max-w-[85%] sm:max-w-xl text-[var(--privora-text)] font-sans text-[15px] shadow-sm transition-colors duration-500 self-end" 
                : "items-start w-full text-[var(--privora-text)] transition-colors duration-500"
            )}
          >
          {!isUser && imageGeneration && (
            <ImageGenerationCard
              imageGeneration={imageGeneration}
              attachments={attachments?.filter(attachment => attachment.mimeType.startsWith("image/"))}
              onPreview={onPreviewAttachment}
              onRetry={onRetry}
              onEditImage={onEditGeneratedImage}
            />
          )}

          {!isUser && debate && <DebateCard debate={debate} onCopyText={copyCustomText} onRetry={onRetry} onShareText={shareCustomText} />}
          {!isUser && clash && <ClashCard clash={clash} onCopyText={copyCustomText} onRetry={onRetry} onShareText={shareCustomText} />}

          {!isUser && researchPlan && !isCompletedResearchReport && (
            <ResearchPlanCard
              plan={researchPlan}
              disabled={Boolean(isTyping && researchPlan.status !== "running")}
              onStart={onStartResearchPlan}
              onEdit={onEditResearchPlan}
              onCancel={onCancelResearchPlan}
              onStop={onStopResearchPlan}
              onOpenActivity={onOpenResearchActivity}
              researchStartedAt={researchStartedAt}
              researchCompletedAt={researchCompletedAt}
              researchSourceCount={researchSources?.length}
            />
          )}

          {isCompletedResearchReport && (
            <ResearchReportCard
              report={{
                title: researchPlan?.title || "Deep Research Report",
                content,
                sources: researchSources,
                plan: researchPlan,
                startedAt: researchStartedAt,
                completedAt: researchCompletedAt,
                timeBudgetMs: researchTimeBudgetMs,
              }}
              onOpenActivity={onOpenResearchActivity}
            />
          )}

          {!isUser && !researchStatus && researchPreflight === "clarifying" && (
            <div className="mb-1.5 inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--privora-border)] bg-[var(--privora-surface)] px-2.5 py-1 text-[12px] font-medium text-[var(--privora-muted)]">
              <Globe className="h-3.5 w-3.5 shrink-0 opacity-75" />
              <span className="truncate">Deep Research</span>
            </div>
          )}

          {!isUser && !researchStatus && webSearchStatus && (
            <div className="mb-1.5 flex max-w-full items-center gap-2 text-[13px] font-medium text-[var(--privora-muted)]">
              <Globe
                className={cn(
                  "h-3.5 w-3.5 shrink-0 opacity-75",
                  webSearchStatus === "searching" && "animate-pulse text-[var(--privora-accent)] opacity-100"
                )}
              />
              <span className="shrink-0">{webSearchStatus === "searching" ? "Searching web" : "Searched web"}</span>
              {webSearchQueries && webSearchQueries.length > 0 && (
                <span className="h-1 w-1 shrink-0 rounded-full bg-current opacity-35" />
              )}
              {webSearchQueries && webSearchQueries.length > 0 && (
                <span className="min-w-0 truncate font-normal opacity-65">
                  {webSearchQueries[0]}
                </span>
              )}
            </div>
          )}

          {shouldRenderThoughtPanel && (
            <div className="w-full flex flex-col items-start max-w-[100%] mb-1.5">
               <button
                  onClick={() => {
                    setIsThoughtOpen(currentValue => !currentValue);
                  }}
                  disabled={!thought}
                  className={cn(
                    "flex items-center gap-2 text-[14px] font-medium transition-colors py-1.5 rounded",
                    thought ? "hover:opacity-70" : "cursor-default",
                    isThinking && thought ? "text-[var(--privora-accent)]" : "text-[var(--privora-muted)]"
                  )}
               >
                  <TypingIndicator
                    size={thought ? 22 : 20}
                    className={cn(
                      "shrink-0 text-[var(--privora-text)]",
                      thought ? "opacity-90" : "opacity-55"
                    )}
                    isAnimating={Boolean(isThinking)}
                  />
                  {thought && (
                    <>
                      <span className={cn(isThinking ? "animate-text-shimmer" : "text-[var(--privora-muted)]")}>{isThinking ? "Thinking" : "Thought process"}</span>
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-300", !isThoughtOpen ? "-rotate-90" : "rotate-0")} />
                    </>
                  )}
               </button>
               
               <AnimatePresence initial={false}>
                 {isThoughtOpen && thought && (
                   <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="overflow-hidden w-full flex"
                   >
                      <div className="privora-thought-panel max-w-[95%]">
                        <div className="privora-thought-content max-w-none transition-colors duration-500 font-sans">
                            <MarkdownRenderer compact isStreaming={isThinking}>{thought}</MarkdownRenderer>
                        </div>
                      </div>
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>
          )}

          <div
            className={cn(
              "markdown-body max-w-none text-inherit transition-colors duration-500",
              isUser ? "leading-relaxed" : "font-sans text-[1.05rem]"
            )}
          >
             <>
               {shouldRenderContent && !isCompletedResearchReport && (
                 <div ref={contentRef}>
                   <MarkdownRenderer compact={isUser} isStreaming={Boolean(isTyping)} onOpenCodePlayground={onOpenCodePlayground}>{content}</MarkdownRenderer>
                 </div>
               )}
               {!isUser && agentActions && agentActions.length > 0 && (
                 <AgentActionsStrip
                   messageId={id}
                   actions={agentActions}
                   sessionSummary={content}
                   isOperationActive={Boolean(isTyping)}
                   onOpenCommandTarget={onOpenCommandTarget}
                   onUndoCommandAction={onUndoCommandAction}
                   onUndoCommandSession={onUndoCommandSession}
                   onRedoCommandSession={onRedoCommandSession}
                   onConfirmCommandAction={onConfirmCommandAction}
                   onUpdateDuplicateCommandAction={onUpdateDuplicateCommandAction}
                   onFindAlternativeCommandAction={onFindAlternativeCommandAction}
                   onConfirmAllCommandActions={onConfirmAllCommandActions}
                   onCancelCommandAction={onCancelCommandAction}
                 />
               )}
                 {!isUser && artifact && (
                   <ArtifactCard artifact={artifact} onOpen={onOpenArtifact || (() => undefined)} />
                 )}
              {!hideActions && !isUser && !isTyping && content && !isCompletedResearchReport && !isImageGenerationMessage && (
                 <>
                   {researchSources && researchSources.length > 0 && (
                     <div className="mt-4 w-full max-w-full rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)]/75 p-3">
                       <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--privora-muted)]">
                         <span>Sources</span>
                         {researchElapsedMs !== undefined && (
                           <span className="inline-flex items-center gap-1 rounded-full bg-[var(--privora-text)]/[0.05] px-2 py-0.5 normal-case tracking-normal">
                             <Clock3 className="h-3 w-3" />
                             {formatElapsed(researchElapsedMs)}
                           </span>
                         )}
                         {researchTimeBudgetMs && (
                           <span className="rounded-full bg-[var(--privora-text)]/[0.05] px-2 py-0.5 normal-case tracking-normal">
                             budget {formatElapsed(researchTimeBudgetMs)}
                           </span>
                         )}
                       </div>
                       <div className="flex flex-col gap-2">
                         {researchSources.slice(0, 8).map((source, index) => (
                           <a
                             key={`${source.url}-${index}`}
                             href={source.url}
                             target="_blank"
                             rel="noreferrer"
                             className="min-w-0 truncate text-[13px] text-[var(--privora-text)] underline decoration-[var(--privora-border)] underline-offset-4 hover:decoration-[var(--privora-text)]"
                           >
                             {index + 1}. {source.title || source.url}
                           </a>
                         ))}
                       </div>
                     </div>
                   )}
                 <div className="flex items-center gap-3 mt-4 text-[var(--privora-muted)] transition-colors duration-500">
                     <button type="button" onClick={handleCopy} className="p-1 -m-1 hover:text-[var(--privora-text)] transition-colors" title="Copy text">
                       {isCopied ? <Check className="w-[14px] h-[14px]" /> : <Copy className="w-[14px] h-[14px]" />}
                     </button>
                     <button type="button" className="p-1 -m-1 hover:text-[var(--privora-text)] transition-colors" title="Good response"><ThumbsUp className="w-[14px] h-[14px]" /></button>
                     <button type="button" className="p-1 -m-1 hover:text-[var(--privora-text)] transition-colors" title="Bad response"><ThumbsDown className="w-[14px] h-[14px]" /></button>
                     {onRetry && (
                       <button type="button" onClick={onRetry} className="p-1 -m-1 hover:text-[var(--privora-text)] transition-colors" title="Retry message"><RotateCcw className="w-[14px] h-[14px]" /></button>
                     )}
                     <button type="button" onClick={handleShare} className="p-1 -m-1 hover:text-[var(--privora-text)] transition-colors" title="Share message"><Share2 className="w-[14px] h-[14px]" /></button>
                   </div>
                 </>
                 )}
               </>
          </div>
        </div>
        )}

        {/* User message hover actions */}
        {isUser && (
          <div className="hidden sm:flex items-center gap-2 mt-1.5 text-[var(--privora-muted)] transition-colors duration-500 opacity-0 group-hover:opacity-100 focus-within:opacity-100 self-end mr-2">
             {onEdit && (
               <button type="button" onClick={onEdit} className="p-1 -m-1 hover:text-[var(--privora-text)] transition-colors" title="Edit text"><Pencil className="w-3.5 h-3.5" /></button>
             )}
             <button type="button" onClick={handleCopy} className="p-1 -m-1 hover:text-[var(--privora-text)] transition-colors" title="Copy text">
               {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
             </button>
             {onRetry && (
               <button type="button" onClick={onRetry} className="p-1 -m-1 hover:text-[var(--privora-text)] transition-colors" title="Retry message"><RotateCcw className="w-3.5 h-3.5" /></button>
             )}
             <button type="button" onClick={handleShare} className="p-1 -m-1 hover:text-[var(--privora-text)] transition-colors" title="Share message"><Share2 className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export const ChatMessage = memo(ChatMessageComponent, (prev, next) => {
  return (
    prev.role === next.role &&
    prev.id === next.id &&
    prev.content === next.content &&
    prev.thought === next.thought &&
    prev.isThinking === next.isThinking &&
    prev.webSearchStatus === next.webSearchStatus &&
    prev.webSearchQueries === next.webSearchQueries &&
    prev.researchStatus === next.researchStatus &&
    prev.researchSources === next.researchSources &&
    prev.researchPreflight === next.researchPreflight &&
    prev.researchPlan === next.researchPlan &&
    prev.researchPlanReference === next.researchPlanReference &&
    prev.researchStartedAt === next.researchStartedAt &&
    prev.researchCompletedAt === next.researchCompletedAt &&
    prev.researchTimeBudgetMs === next.researchTimeBudgetMs &&
    prev.imageGeneration === next.imageGeneration &&
    prev.debate === next.debate &&
    prev.clash === next.clash &&
    prev.agentActions === next.agentActions &&
    prev.agentSessionId === next.agentSessionId &&
    prev.artifact === next.artifact &&
    prev.onOpenResearchActivity === next.onOpenResearchActivity &&
    prev.onOpenArtifact === next.onOpenArtifact &&
    prev.onOpenCommandTarget === next.onOpenCommandTarget &&
    prev.onUndoCommandAction === next.onUndoCommandAction &&
    prev.onUndoCommandSession === next.onUndoCommandSession &&
    prev.onRedoCommandSession === next.onRedoCommandSession &&
    prev.onConfirmCommandAction === next.onConfirmCommandAction &&
    prev.onUpdateDuplicateCommandAction === next.onUpdateDuplicateCommandAction &&
    prev.onFindAlternativeCommandAction === next.onFindAlternativeCommandAction &&
    prev.onConfirmAllCommandActions === next.onConfirmAllCommandActions &&
    prev.onCancelCommandAction === next.onCancelCommandAction &&
    prev.onOpenCodePlayground === next.onOpenCodePlayground &&
    prev.isTyping === next.isTyping &&
    prev.messageIndex === next.messageIndex &&
    prev.messageCount === next.messageCount &&
    prev.onEditGeneratedImage === next.onEditGeneratedImage &&
    prev.attachments === next.attachments &&
    prev.hideActions === next.hideActions
  );
});
