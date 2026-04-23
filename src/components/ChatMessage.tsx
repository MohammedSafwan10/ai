import { cn } from "../lib/utils";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "motion/react";
import { TypingIndicator } from "./TypingIndicator";
import { Copy, ThumbsUp, ThumbsDown, RotateCcw } from "lucide-react";

interface ChatMessageProps {
  role: "user" | "model";
  content: string;
  isTyping?: boolean;
}

export function ChatMessage({ role, content, isTyping }: ChatMessageProps) {
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "w-full flex mb-6 max-w-[46rem] mx-auto px-4 md:px-6",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div 
        className={cn(
          "flex flex-col gap-2",
          isUser 
            ? "items-end bg-[var(--nexus-user-bubble)] px-5 py-3.5 rounded-[24px] max-w-[85%] sm:max-w-xl text-[var(--nexus-text)] font-sans text-[15px] shadow-sm transition-colors duration-500" 
            : "items-start w-full text-[var(--nexus-text)] transition-colors duration-500"
        )}
      >
        <div
          className={cn(
            "prose max-w-none text-inherit transition-colors duration-500",
            isUser ? "prose-p:my-0 leading-relaxed" : "prose-p:leading-[1.75] prose-p:font-sans prose-p:text-[1.05rem] prose-pre:bg-[var(--nexus-surface)] prose-pre:border prose-pre:border-[var(--nexus-border)] prose-pre:text-[var(--nexus-text)] prose-code:bg-[var(--nexus-text)]/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none prose-headings:font-display prose-headings:font-medium prose-headings:text-[var(--nexus-text)] prose-strong:text-[var(--nexus-text)] prose-a:text-[var(--nexus-accent)]"
          )}
        >
          {!isUser && isTyping && !content ? (
            <TypingIndicator />
          ) : (
             <>
               <Markdown remarkPlugins={[remarkGfm]}>
                 {content + (!isUser && isTyping && content ? " ▋" : "")}
               </Markdown>
               {!isUser && !isTyping && (
                 <div className="flex items-center gap-3 mt-4 text-[var(--nexus-muted)] transition-colors duration-500">
                   <button className="hover:text-[var(--nexus-text)] transition-colors"><Copy className="w-[14px] h-[14px]" /></button>
                   <button className="hover:text-[var(--nexus-text)] transition-colors"><ThumbsUp className="w-[14px] h-[14px]" /></button>
                   <button className="hover:text-[var(--nexus-text)] transition-colors"><ThumbsDown className="w-[14px] h-[14px]" /></button>
                   <button className="hover:text-[var(--nexus-text)] transition-colors"><RotateCcw className="w-[14px] h-[14px]" /></button>
                 </div>
               )}
             </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
