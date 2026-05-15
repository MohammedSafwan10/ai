import type { RefObject } from "react";
import { ArrowDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { ChatMessage } from "./ChatMessage";
import type { Attachment } from "../../../lib/attachments";
import type { ChatMessageRecord } from "../../../lib/db";

interface ChatViewportProps {
  messages: ChatMessageRecord[];
  isTyping: boolean;
  chatScrollRef: RefObject<HTMLElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  showScrollToLatest: boolean;
  onScrollToLatest: () => void;
  onEditMessage: (messageId: string) => void;
  onRetryMessage: (messageId: string) => void;
  onStartResearchPlan: (messageId: string) => void;
  onEditResearchPlan: (messageId: string) => void;
  onCancelResearchPlan: (messageId: string) => void;
  onStopResearchPlan: () => void;
  onOpenResearchActivity: () => void;
  onOpenArtifact: (artifactId: string) => void;
  onEditGeneratedImage: (attachment: Attachment) => void;
  onPreviewAttachment: (attachment: Attachment) => void;
}

export function ChatViewport({
  messages,
  isTyping,
  chatScrollRef,
  messagesEndRef,
  onScroll,
  showScrollToLatest,
  onScrollToLatest,
  onEditMessage,
  onRetryMessage,
  onStartResearchPlan,
  onEditResearchPlan,
  onCancelResearchPlan,
  onStopResearchPlan,
  onOpenResearchActivity,
  onOpenArtifact,
  onEditGeneratedImage,
  onPreviewAttachment,
}: ChatViewportProps) {
  const hasWideMessage = messages.some(message => message.debate);

  return (
    <div className="relative min-h-0 flex-1">
      <main ref={chatScrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
        <div className={`${hasWideMessage ? "max-w-[72rem]" : "max-w-[46rem]"} w-full mx-auto flex flex-col justify-end min-h-full pb-4 pt-14 sm:pb-6 sm:pt-20`}>
          {messages.length > 0 && (
            <div className="flex flex-col w-full">
              {messages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  role={message.role}
                  content={message.content}
                  thought={message.thought}
                  isThinking={message.isThinking}
                  webSearchStatus={message.webSearchStatus}
                  webSearchQueries={message.webSearchQueries}
                  researchStatus={message.researchStatus}
                  researchSources={message.researchSources}
                  researchPreflight={message.researchPreflight}
                  researchPlan={message.researchPlan}
                  researchPlanReference={message.researchPlanReference}
                  researchStartedAt={message.researchStartedAt}
                  researchCompletedAt={message.researchCompletedAt}
                  researchTimeBudgetMs={message.researchTimeBudgetMs}
                  imageGeneration={message.imageGeneration}
                  debate={message.debate}
                  artifact={message.artifact}
                  isTyping={isTyping && index === messages.length - 1}
                  messageIndex={index}
                  messageCount={messages.length}
                  onEdit={() => onEditMessage(message.id)}
                  onRetry={() => onRetryMessage(message.id)}
                  onStartResearchPlan={() => onStartResearchPlan(message.id)}
                  onEditResearchPlan={() => onEditResearchPlan(message.id)}
                  onCancelResearchPlan={() => onCancelResearchPlan(message.id)}
                  onStopResearchPlan={onStopResearchPlan}
                  onOpenResearchActivity={onOpenResearchActivity}
                  onOpenArtifact={() => message.artifact && onOpenArtifact(message.artifact.artifactId)}
                  onEditGeneratedImage={onEditGeneratedImage}
                  attachments={message.attachments}
                  onPreviewAttachment={onPreviewAttachment}
                />
              ))}
            </div>
          )}
          <div ref={messagesEndRef} className="h-2" />
        </div>
      </main>

      <AnimatePresence>
        {showScrollToLatest && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 8, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.92 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            onClick={onScrollToLatest}
            className="absolute bottom-3 left-1/2 z-30 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-[var(--privora-border)] bg-[var(--privora-surface)] text-[var(--privora-text)] shadow-[0_10px_30px_rgba(0,0,0,0.12)] transition-colors hover:bg-[var(--privora-user-bubble)] focus:outline-none focus:ring-2 focus:ring-[var(--privora-text)]/20 dark:shadow-[0_14px_36px_rgba(0,0,0,0.35)]"
            title="Scroll to latest message"
            aria-label="Scroll to latest message"
          >
            <ArrowDown className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
