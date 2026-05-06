import type { RefObject } from "react";
import { ChatMessage } from "./ChatMessage";
import type { Attachment } from "../../../lib/attachments";
import type { ChatMessageRecord } from "../../../lib/db";

interface ChatViewportProps {
  messages: ChatMessageRecord[];
  isTyping: boolean;
  chatScrollRef: RefObject<HTMLElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  onEditMessage: (messageId: string) => void;
  onRetryMessage: (messageId: string) => void;
  onStartResearchPlan: (messageId: string) => void;
  onEditResearchPlan: (messageId: string) => void;
  onCancelResearchPlan: (messageId: string) => void;
  onStopResearchPlan: () => void;
  onOpenResearchActivity: () => void;
  onPreviewAttachment: (attachment: Attachment) => void;
}

export function ChatViewport({
  messages,
  isTyping,
  chatScrollRef,
  messagesEndRef,
  onScroll,
  onEditMessage,
  onRetryMessage,
  onStartResearchPlan,
  onEditResearchPlan,
  onCancelResearchPlan,
  onStopResearchPlan,
  onOpenResearchActivity,
  onPreviewAttachment,
}: ChatViewportProps) {
  return (
    <main ref={chatScrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
      <div className="w-full max-w-[46rem] mx-auto flex flex-col justify-end min-h-full pb-4 pt-14 sm:pb-6 sm:pt-20">
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
                researchStartedAt={message.researchStartedAt}
                researchCompletedAt={message.researchCompletedAt}
                researchTimeBudgetMs={message.researchTimeBudgetMs}
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
                attachments={message.attachments}
                onPreviewAttachment={onPreviewAttachment}
              />
            ))}
          </div>
        )}
        <div ref={messagesEndRef} className="h-2" />
      </div>
    </main>
  );
}
