import { Brain, Camera, Check, ChevronDown, Paperclip, Send, Square, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import {
  CLIPROXY_ATTACHMENT_ACCEPT,
  GEMINI_ATTACHMENT_ACCEPT,
  OPENROUTER_ATTACHMENT_ACCEPT,
  type Attachment,
} from "../../../lib/attachments";
import { getModelLabel, getModelOption, getModelProviderGroups, getReasoningModeLabel } from "../../../lib/models";
import { getModelRuntimeLimits } from "../runtime/modelLimits";

export function WebDevComposer({
  input,
  isGenerating,
  selectedModel,
  isThinkingEnabled,
  onInputChange,
  onSubmit,
  onSelectModel,
  onToggleThinking,
  onStop,
  attachments,
  textareaRef,
  fileInputRef,
  onPaste,
  onFileSelect,
  onKeyDown,
  onTakeScreenshot,
  onPreviewAttachment,
  onRemoveAttachment,
}: {
  input: string;
  isGenerating: boolean;
  selectedModel: string;
  isThinkingEnabled: boolean;
  attachments: Attachment[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (value: string) => void;
  onSubmit: () => void;
  onSelectModel: (modelId: string) => void;
  onToggleThinking: () => void;
  onStop: () => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onTakeScreenshot: () => void;
  onPreviewAttachment: (attachment: Attachment) => void;
  onRemoveAttachment: (index: number) => void;
}) {
  const [isModelOpen, setIsModelOpen] = useState(false);
  const modelProviderGroups = getModelProviderGroups();
  const selectedModelOption = getModelOption(selectedModel);
  const provider = selectedModelOption?.provider;
  const supportsThinking = getModelRuntimeLimits(selectedModel).supportsThinking;
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-[var(--privora-border)] bg-[var(--privora-surface)] shadow-[var(--privora-shadow)]">
      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-4" style={{ scrollbarWidth: "none" }}>
          {attachments.map((attachment, index) => (
            <div key={`${attachment.name}-${index}`} className="group relative shrink-0 overflow-hidden rounded-xl border border-[var(--privora-border)]/80 bg-[var(--privora-bg)] shadow-sm">
              <button
                type="button"
                onClick={() => onPreviewAttachment(attachment)}
                className="block"
                title={attachment.name}
              >
                {attachment.mimeType.startsWith("image/") ? (
                  <img src={attachment.url} alt={attachment.name} className="h-16 w-16 object-cover" />
                ) : (
                  <div className="flex h-16 w-16 flex-col items-center justify-center bg-[var(--privora-text)]/5 p-2 text-center">
                    <span className="w-full truncate text-[10px] font-semibold uppercase text-[var(--privora-text)]">
                      {attachment.name.split(".").pop() || "file"}
                    </span>
                  </div>
                )}
              </button>
              <button
                type="button"
                onClick={() => onRemoveAttachment(index)}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition hover:bg-black/75 group-hover:opacity-100"
                title="Remove attachment"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={attachments.length > 0 ? "Describe what to build from these files" : "Describe the web app or change you want"}
        rows={1}
        className="max-h-40 min-h-[4.5rem] w-full resize-none overflow-y-auto bg-transparent px-4 py-3 text-[15px] leading-relaxed text-[var(--privora-text)] outline-none placeholder:text-[var(--privora-muted)]"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => fileInputRef.current?.click()}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--privora-muted)] transition hover:bg-[var(--privora-user-bubble)] hover:text-[var(--privora-text)] disabled:opacity-45"
            title="Add files or photos"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={isGenerating || !navigator.mediaDevices?.getDisplayMedia}
            onClick={onTakeScreenshot}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--privora-muted)] transition hover:bg-[var(--privora-user-bubble)] hover:text-[var(--privora-text)] disabled:opacity-45"
            title="Take a screenshot"
          >
            <Camera className="h-4 w-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={provider === "cliproxy" ? CLIPROXY_ATTACHMENT_ACCEPT : provider === "openrouter" ? OPENROUTER_ATTACHMENT_ACCEPT : GEMINI_ATTACHMENT_ACCEPT}
            onChange={onFileSelect}
            className="hidden"
          />
          <button
            type="button"
            disabled={isGenerating || !supportsThinking}
            onClick={onToggleThinking}
            className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition disabled:opacity-45 ${
              supportsThinking && isThinkingEnabled ? "bg-[var(--privora-user-bubble)] text-[var(--privora-text)]" : "text-[var(--privora-muted)] hover:bg-[var(--privora-user-bubble)] hover:text-[var(--privora-text)]"
            }`}
            title={supportsThinking ? "Reasoning mode" : "This model does not advertise reasoning output"}
          >
            <Brain className="h-3.5 w-3.5" />
            {getReasoningModeLabel(selectedModelOption?.provider, supportsThinking && isThinkingEnabled ? "thinking" : "instant")}
          </button>
          <div className="relative">
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => setIsModelOpen(value => !value)}
              className="flex h-8 max-w-[13rem] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[var(--privora-muted)] transition hover:bg-[var(--privora-user-bubble)] hover:text-[var(--privora-text)] disabled:opacity-45"
              title="Select AI model"
            >
              <span className="truncate">{getModelLabel(selectedModel)}</span>
              <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${isModelOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence>
              {isModelOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsModelOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    className="absolute bottom-[calc(100%+0.5rem)] left-0 z-50 max-h-[26rem] w-72 overflow-y-auto rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] p-1 shadow-[var(--privora-shadow)]"
                  >
                    {modelProviderGroups.map((group, groupIndex) => (
                      <div key={group.id} className={groupIndex === 0 ? "" : "mt-1 border-t border-[var(--privora-border)]/60 pt-1"}>
                        <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--privora-muted)]">
                          {group.label}
                        </div>
                        {group.models.map(option => {
                          const isActive = option.id === selectedModel;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => {
                                onSelectModel(option.id);
                                setIsModelOpen(false);
                              }}
                              className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                                isActive ? "bg-[var(--privora-user-bubble)] font-medium text-[var(--privora-text)]" : "text-[var(--privora-text)] hover:bg-[var(--privora-user-bubble)]"
                              }`}
                              title={option.description}
                            >
                              <span className="min-w-0 flex-1 truncate">{option.label}</span>
                              {isActive && <Check className="h-3.5 w-3.5 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
        {isGenerating ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--privora-text)]/10 text-[var(--privora-text)] transition hover:bg-[var(--privora-text)]/20"
            title="Stop"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() && attachments.length === 0}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--privora-accent)] text-[var(--privora-accent-fg)] shadow-md transition hover:bg-[var(--privora-accent-hover)] disabled:bg-[var(--privora-text)]/10 disabled:text-[var(--privora-muted)] disabled:shadow-none"
            title="Send"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </form>
  );
}
