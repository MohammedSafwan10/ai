import { useState, useEffect } from "react";
import { cn } from "../lib/utils";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "motion/react";
import { TypingIndicator } from "./TypingIndicator";
import { Copy, ThumbsUp, ThumbsDown, RotateCcw, Brain, ChevronDown, Check, Pencil } from "lucide-react";

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
  isTyping?: boolean;
  onEdit?: () => void;
  onRetry?: () => void;
  attachments?: Attachment[];
  onPreviewAttachment?: (att: Attachment) => void;
}

export function ChatMessage({ role, content, thought, isThinking, isTyping, onEdit, onRetry, attachments, onPreviewAttachment }: ChatMessageProps) {
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
        "w-full flex mb-6 max-w-[46rem] mx-auto px-4 md:px-6 group",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="mr-4 mt-0.5 shrink-0 transition-opacity duration-500">
          <TypingIndicator size={26} className="text-[var(--privora-text)] opacity-90" isAnimating={isTyping} />
        </div>
      )}
      <div className={cn("relative flex flex-col w-full items-start", isUser ? "max-w-full" : "max-w-[calc(100%-3rem)]")}>
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
          {!isUser && (thought || isThinking) && (
            <div className="w-full flex flex-col items-start max-w-[100%] mb-1.5">
               <button 
                  onClick={() => setIsThoughtOpen(!isThoughtOpen)}
                  className={cn(
                    "flex items-center gap-2 text-[14px] font-medium transition-colors py-1.5 rounded hover:opacity-70",
                    isThinking ? "text-[var(--privora-accent)]" : "text-[var(--privora-muted)]"
                  )}
               >
                  <span className={cn(isThinking ? "animate-text-shimmer" : "text-[var(--privora-muted)]")}>{isThinking ? "Thinking" : "Thought process"}</span>
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-300", !isThoughtOpen ? "-rotate-90" : "rotate-0")} />
               </button>
               
               <AnimatePresence initial={false}>
                 {isThoughtOpen && (
                   <motion.div
                      initial={{ opacity: 0, height: 0, marginTop: 0 }}
                      animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                      exit={{ opacity: 0, height: 0, marginTop: 0 }}
                      className="overflow-hidden w-full flex"
                   >
                      <div className="border border-[var(--privora-border)]/60 bg-[var(--privora-text)]/[0.04] backdrop-blur-md px-5 py-4 rounded-[20px] max-w-[95%]">
                        <div className="prose prose-sm max-w-none text-[var(--privora-muted)] prose-p:leading-relaxed prose-p:my-1 opacity-90 transition-colors duration-500 font-sans">
                            {thought ? <Markdown>{thought}</Markdown> : <span className="animate-text-shimmer">Thinking...</span>}
                        </div>
                      </div>
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>
          )}

          <div
            className={cn(
              "prose max-w-none text-inherit transition-colors duration-500",
              isUser ? "prose-p:my-0 leading-relaxed" : "prose-p:leading-[1.75] prose-p:font-sans prose-p:text-[1.05rem] prose-pre:bg-[var(--privora-surface)] prose-pre:border prose-pre:border-[var(--privora-border)] prose-pre:text-[var(--privora-text)] prose-code:bg-[var(--privora-text)]/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none prose-headings:font-display prose-headings:font-medium prose-headings:text-[var(--privora-text)] prose-strong:text-[var(--privora-text)] prose-a:text-[var(--privora-accent)]"
            )}
          >
             <>
               {(content || (!isUser && isTyping && !isThinking)) && (
                 <Markdown remarkPlugins={[remarkGfm]}>
                   {content}
                 </Markdown>
               )}
               {!isUser && !isTyping && content && (
                 <div className="flex items-center gap-3 mt-4 text-[var(--privora-muted)] transition-colors duration-500">
                     <button onClick={handleCopy} className="hover:text-[var(--privora-text)] transition-colors">
                       {isCopied ? <Check className="w-[14px] h-[14px]" /> : <Copy className="w-[14px] h-[14px]" />}
                     </button>
                     <button className="hover:text-[var(--privora-text)] transition-colors"><ThumbsUp className="w-[14px] h-[14px]" /></button>
                     <button className="hover:text-[var(--privora-text)] transition-colors"><ThumbsDown className="w-[14px] h-[14px]" /></button>
                     {onRetry && (
                       <button onClick={onRetry} className="hover:text-[var(--privora-text)] transition-colors"><RotateCcw className="w-[14px] h-[14px]" /></button>
                     )}
                   </div>
                 )}
               </>
          </div>
        </div>
        )}

        {/* User message hover actions */}
        {isUser && (
          <div className="flex items-center gap-2 mt-1.5 text-[var(--privora-muted)] transition-colors duration-500 opacity-0 group-hover:opacity-100 self-end mr-2">
             {onEdit && (
               <button onClick={onEdit} className="hover:text-[var(--privora-text)] transition-colors" title="Edit text"><Pencil className="w-3.5 h-3.5" /></button>
             )}
             <button onClick={handleCopy} className="hover:text-[var(--privora-text)] transition-colors" title="Copy text">
               {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
             </button>
             {onRetry && (
               <button onClick={onRetry} className="hover:text-[var(--privora-text)] transition-colors" title="Retry message"><RotateCcw className="w-3.5 h-3.5" /></button>
             )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
