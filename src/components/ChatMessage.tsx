import { memo, useState, useEffect } from "react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { Copy, ThumbsUp, ThumbsDown, RotateCcw, ChevronDown, Check, Pencil, Globe } from "lucide-react";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { TypingIndicator } from "./TypingIndicator";

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
  isTyping?: boolean;
  messageIndex?: number;
  messageCount?: number;
  onEdit?: () => void;
  onRetry?: () => void;
  attachments?: Attachment[];
  onPreviewAttachment?: (att: Attachment) => void;
}

function ChatMessageComponent({ role, content, thought, isThinking, webSearchStatus, webSearchQueries, isTyping, onEdit, onRetry, attachments, onPreviewAttachment }: ChatMessageProps) {
  const isUser = role === "user";
  const [isThoughtOpen, setIsThoughtOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "w-full flex mb-6 px-4 md:px-6 group",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div className="relative flex w-full max-w-full flex-col items-start">
        {attachments && attachments.length > 0 && (
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
          {!isUser && webSearchStatus && (
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
               {(content || (!isUser && isTyping && !isThinking)) && (
                 <MarkdownRenderer compact={isUser} isStreaming={Boolean(isTyping)}>{content}</MarkdownRenderer>
               )}
               {!isUser && !isTyping && content && (
                 <div className="flex items-center gap-3 mt-4 text-[var(--privora-muted)] transition-colors duration-500">
                     <button type="button" onClick={handleCopy} className="hover:text-[var(--privora-text)] transition-colors">
                       {isCopied ? <Check className="w-[14px] h-[14px]" /> : <Copy className="w-[14px] h-[14px]" />}
                     </button>
                     <button type="button" className="hover:text-[var(--privora-text)] transition-colors"><ThumbsUp className="w-[14px] h-[14px]" /></button>
                     <button type="button" className="hover:text-[var(--privora-text)] transition-colors"><ThumbsDown className="w-[14px] h-[14px]" /></button>
                     {onRetry && (
                       <button type="button" onClick={onRetry} className="hover:text-[var(--privora-text)] transition-colors"><RotateCcw className="w-[14px] h-[14px]" /></button>
                     )}
                   </div>
                 )}
               </>
          </div>
        </div>
        )}

        {/* User message hover actions */}
        {isUser && (
          <div className="flex items-center gap-2 mt-1.5 text-[var(--privora-muted)] transition-colors duration-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 self-end mr-2">
             {onEdit && (
               <button type="button" onClick={onEdit} className="hover:text-[var(--privora-text)] transition-colors" title="Edit text"><Pencil className="w-3.5 h-3.5" /></button>
             )}
             <button type="button" onClick={handleCopy} className="hover:text-[var(--privora-text)] transition-colors" title="Copy text">
               {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
             </button>
             {onRetry && (
               <button type="button" onClick={onRetry} className="hover:text-[var(--privora-text)] transition-colors" title="Retry message"><RotateCcw className="w-3.5 h-3.5" /></button>
             )}
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
    prev.isTyping === next.isTyping &&
    prev.messageIndex === next.messageIndex &&
    prev.messageCount === next.messageCount &&
    prev.attachments === next.attachments
  );
});
