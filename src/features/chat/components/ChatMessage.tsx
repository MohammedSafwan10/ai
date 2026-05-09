import { memo, useState, useEffect, useRef } from "react";
import { cn } from "../../../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { Copy, ThumbsUp, ThumbsDown, RotateCcw, ChevronDown, Check, Pencil, Globe, Share2, Clock3, CornerDownRight } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ImageGenerationCard } from "./ImageGenerationCard";
import { ResearchPlanCard } from "./ResearchPlanCard";
import { ResearchReportCard } from "./ResearchReportCard";
import { TypingIndicator } from "./TypingIndicator";
import { ArtifactCard } from "../../artifacts/components/ArtifactCard";
import type { ArtifactReferenceRecord, ImageGenerationRecord, ResearchPlanRecord, ResearchSourceRecord, ResearchStatus } from "../../../lib/db";
import { copyTextToClipboard } from "../../../lib/clipboard";
import { useToast } from "../../ui/ToastProvider";

interface Attachment {
  url: string;
  base64: string; 
  mimeType: string;
  name: string;
}

interface ChatMessageProps {
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
  onEditGeneratedImage?: (attachment: Attachment) => void;
  attachments?: Attachment[];
  onPreviewAttachment?: (att: Attachment) => void;
}

const formatElapsed = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
};

function ChatMessageComponent({ role, content, thought, isThinking, webSearchStatus, webSearchQueries, researchStatus, researchSources, researchPreflight, researchPlan, researchPlanReference, researchStartedAt, researchCompletedAt, researchTimeBudgetMs, imageGeneration, artifact, isTyping, onEdit, onRetry, onStartResearchPlan, onEditResearchPlan, onCancelResearchPlan, onStopResearchPlan, onOpenResearchActivity, onOpenArtifact, onEditGeneratedImage, attachments, onPreviewAttachment }: ChatMessageProps) {
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
  const isCompletedResearchReport = !isUser && Boolean(content) && researchStatus === "completed" && Boolean(researchPlan);
  const shouldRenderContent = !isResearchRunning && !isImageGenerationMessage && (content || (!isUser && isTyping && !isThinking));
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

  const handleShare = async () => {
    if (!navigator.share) {
      setIsMenuOpen(false);
      notify({ title: "Share unavailable", description: "This browser does not support native sharing.", variant: "error" });
      return;
    }

    try {
      await navigator.share({ title: "Privora message", text: content });
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

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!isUser) return;
    if (event.pointerType !== "touch") return;
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
    event.preventDefault();
    openMessageMenu(event.clientX, event.clientY);
  };
  
  // Auto-close thought when content starts generating
  // Just a nice UX touch so content is in focus
  useEffect(() => {
    if (content && isThoughtOpen && !isThinking) {
      setIsThoughtOpen(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, isThinking]);

  useEffect(() => {
    if (thought && isThinking) {
      setIsThoughtOpen(true);
    }
  }, [thought, isThinking]);

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
      onContextMenu={handleContextMenu}
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
                  <img src={att.url} alt={att.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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

          {!isUser && (thought || isThinking) && (
            <div className="w-full flex flex-col items-start max-w-[100%] mb-1.5">
               <button
                  onClick={() => setIsThoughtOpen(!isThoughtOpen)}
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
                   <MarkdownRenderer compact={isUser} isStreaming={Boolean(isTyping)}>{content}</MarkdownRenderer>
                 </div>
               )}
                 {!isUser && artifact && (
                   <ArtifactCard artifact={artifact} onOpen={onOpenArtifact || (() => undefined)} />
                 )}
              {!isUser && !isTyping && content && !isCompletedResearchReport && !isImageGenerationMessage && (
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
    prev.artifact === next.artifact &&
    prev.onOpenResearchActivity === next.onOpenResearchActivity &&
    prev.onOpenArtifact === next.onOpenArtifact &&
    prev.isTyping === next.isTyping &&
    prev.messageIndex === next.messageIndex &&
    prev.messageCount === next.messageCount &&
    prev.onEditGeneratedImage === next.onEditGeneratedImage &&
    prev.attachments === next.attachments
  );
});
