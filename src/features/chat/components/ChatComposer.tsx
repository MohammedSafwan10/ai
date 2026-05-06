import { useEffect, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { Blocks, Brain, Camera, Check, ChevronDown, Feather, FolderPlus, Globe, Microscope, Paperclip, Plus, Square, Trash2, Workflow } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  CLIPROXY_ATTACHMENT_ACCEPT,
  GEMINI_ATTACHMENT_ACCEPT,
  type Attachment,
} from "../../../lib/attachments";
import {
  getModelLabel,
  getModelOption,
  getReasoningModeLabel,
  isCliproxyModel,
  isGeminiModel,
  modelOptions,
} from "../../../lib/models";
import { getResponseStyle, responseStyleOptions, type ResponseStyleId } from "../../../lib/prompt";



interface ChatComposerProps {
  input: string;
  attachments: Attachment[];
  isTyping: boolean;
  selectedModel: string;
  selectedStyle: ResponseStyleId;
  isThinkingEnabled: boolean;
  isWebSearchEnabled: boolean;
  isDeepResearchEnabled: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (value: string) => void;
  onSubmit: (event?: FormEvent) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onPreviewAttachment: (attachment: Attachment) => void;
  onRemoveAttachment: (index: number) => void;
  onToggleThinking: () => void;
  onToggleWebSearch: () => void;
  onToggleDeepResearch: () => void;
  onSelectModel: (modelId: string) => void;
  onSelectStyle: (styleId: ResponseStyleId) => void;
  onStopGeneration: () => void;
  placement?: "footer" | "landing";
}

export function ChatComposer({
  input,
  attachments,
  isTyping,
  selectedModel,
  selectedStyle,
  isThinkingEnabled,
  isWebSearchEnabled,
  isDeepResearchEnabled,
  textareaRef,
  fileInputRef,
  onInputChange,
  onSubmit,
  onKeyDown,
  onFileSelect,
  onPreviewAttachment,
  onRemoveAttachment,
  onToggleThinking,
  onToggleWebSearch,
  onToggleDeepResearch,
  onSelectModel,
  onSelectStyle,
  onStopGeneration,
  placement = "footer",
}: ChatComposerProps) {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isStyleDropdownOpen, setIsStyleDropdownOpen] = useState(false);
  const selectedModelOption = getModelOption(selectedModel);
  const selectedModelLabel = getModelLabel(selectedModel);
  const selectedStyleOption = getResponseStyle(selectedStyle);
  const selectedReasoningModeLabel = getReasoningModeLabel(
    selectedModelOption?.provider,
    isThinkingEnabled ? "thinking" : "instant"
  );
  const selectedModelIsGemini = isGeminiModel(selectedModel);
  const selectedModelIsCliproxy = isCliproxyModel(selectedModel);
  const settingsDisabled = isTyping;

  useEffect(() => {
    if (!settingsDisabled) return;
    setIsAddMenuOpen(false);
    setIsModelDropdownOpen(false);
    setIsStyleDropdownOpen(false);
  }, [settingsDisabled]);

  const handleSelectModel = (modelId: string) => {
    onSelectModel(modelId);
    setIsModelDropdownOpen(false);
  };

  const handleSelectStyle = (styleId: ResponseStyleId) => {
    onSelectStyle(styleId);
    setIsStyleDropdownOpen(false);
    setIsAddMenuOpen(false);
  };

  const isLanding = placement === "landing";
  const addMenuPositionClass = isLanding
    ? "absolute top-[calc(100%+0.5rem)] left-0"
    : "absolute bottom-[calc(100%+0.5rem)] left-0";
  const styleMenuPositionClass = isLanding
    ? "absolute top-0 left-[calc(100%+0.5rem)] max-[639px]:left-0 max-[639px]:top-[calc(100%+0.5rem)]"
    : "absolute top-0 left-[calc(100%+0.5rem)] max-[560px]:bottom-[calc(100%+0.5rem)] max-[560px]:left-0 max-[560px]:top-auto";

  return (
    <motion.footer
      layoutId="privora-chat-composer"
      layout="position"
      transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.85 }}
      className={
        isLanding
          ? "w-full px-0 pb-0 pt-0 bg-transparent transition-colors duration-500"
          : "shrink-0 w-full px-3 sm:px-4 pb-2 sm:pb-4 pt-2 sm:pt-4 bg-[var(--privora-bg)] transition-colors duration-500 border-t border-[var(--privora-border)]/50"
      }
    >
      <div className="max-w-[46rem] mx-auto relative">
        <form
          onSubmit={onSubmit}
          className="flex flex-col bg-[var(--privora-surface)] rounded-[22px] sm:rounded-[24px] border border-[var(--privora-border)] shadow-[var(--privora-shadow)] focus-within:border-[var(--privora-muted)] focus-within:shadow-xl transition-all"
        >
          {attachments.length > 0 && (
            <div className="flex gap-2 px-4 pt-4 pb-2 w-full overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: "none" }}>
              {attachments.map((attachment, index) => (
                <div key={`${attachment.name}-${index}`} className="shrink-0 relative group rounded-xl border border-[var(--privora-border)]/80 overflow-hidden bg-[var(--privora-bg)] shadow-sm">
                  <div
                    className="cursor-pointer"
                    onClick={() => onPreviewAttachment(attachment)}
                  >
                    {attachment.mimeType.startsWith("image/") ? (
                      <div className="w-14 h-14 sm:w-16 sm:h-16 bg-black/5">
                        <img src={attachment.url} alt={attachment.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-14 h-14 sm:w-16 sm:h-16 flex flex-col items-center justify-center p-2 text-center bg-[var(--privora-text)]/5">
                        <span className="text-[10px] font-medium text-[var(--privora-text)] truncate w-full">{attachment.name.split(".").pop()?.toUpperCase() || "FILE"}</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveAttachment(index);
                    }}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove attachment"
                  >
                    <Trash2 className="w-3 h-3" />
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
            onFocus={() => {
              window.setTimeout(() => {
                textareaRef.current?.scrollIntoView({ block: "nearest" });
              }, 250);
            }}
            placeholder="How can I help you today?"
            className="w-full max-h-48 min-h-[52px] sm:min-h-[56px] text-[15px] bg-transparent text-[var(--privora-text)] placeholder-[var(--privora-muted)] px-4 pt-4 outline-none resize-none leading-relaxed transition-colors duration-500 overflow-y-auto"
            rows={1}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 sm:px-3 py-2.5 sm:py-3">
            <div className="relative">
              <button
                type="button"
                disabled={settingsDisabled}
                onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                className={`p-2 rounded-full transition-colors flex items-center justify-center disabled:opacity-45 disabled:cursor-not-allowed ${isAddMenuOpen ? "bg-[var(--privora-text)]/10 text-[var(--privora-text)]" : "bg-[var(--privora-text)]/5 text-[var(--privora-text)] hover:bg-[var(--privora-text)]/10"}`}
                title="Add files or options"
              >
                <Plus className="w-5 h-5" />
              </button>
              <AnimatePresence>
                {isAddMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsAddMenuOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className={`${addMenuPositionClass} w-64 flex flex-col bg-[var(--privora-surface)] rounded-xl border border-[var(--privora-border)] shadow-[var(--privora-shadow)] z-50 overflow-visible py-1.5`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          fileInputRef.current?.click();
                        }}
                        className="w-full text-left px-3 py-2 flex items-center gap-3 text-[14px] font-sans hover:bg-[var(--privora-surface)] transition-colors text-[var(--privora-text)]"
                      >
                        <Paperclip className="w-4 h-4 opacity-70" />
                        <span className="font-medium leading-none">Add files or photos</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddMenuOpen(false)}
                        className="w-full text-left px-3 py-2 flex items-center gap-3 text-[14px] font-sans hover:bg-[var(--privora-surface)] transition-colors text-[var(--privora-text)]"
                      >
                        <Camera className="w-4 h-4 opacity-70" />
                        <span className="font-medium leading-none">Take a screenshot</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddMenuOpen(false)}
                        className="w-full text-left px-3 py-2 flex items-center justify-between text-[14px] font-sans hover:bg-[var(--privora-surface)] transition-colors text-[var(--privora-text)]"
                      >
                        <div className="flex items-center gap-3">
                          <FolderPlus className="w-4 h-4 opacity-70" />
                          <span className="font-medium leading-none">Add to project</span>
                        </div>
                        <ChevronDown className="w-3 h-3 opacity-50 -rotate-90" />
                      </button>
                      <div className="my-1.5 border-t border-[var(--privora-border)]/50" />
                      <button
                        type="button"
                        onClick={() => setIsAddMenuOpen(false)}
                        className="w-full text-left px-3 py-2 flex items-center justify-between text-[14px] font-sans hover:bg-[var(--privora-surface)] transition-colors text-[var(--privora-text)]"
                      >
                        <div className="flex items-center gap-3">
                          <Blocks className="w-4 h-4 opacity-70" />
                          <span className="font-medium leading-none">Skills</span>
                        </div>
                        <ChevronDown className="w-3 h-3 opacity-50 -rotate-90" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAddMenuOpen(false)}
                        className="w-full text-left px-3 py-2 flex items-center gap-3 text-[14px] font-sans hover:bg-[var(--privora-surface)] transition-colors text-[var(--privora-text)]"
                      >
                        <Workflow className="w-4 h-4 opacity-70" />
                        <span className="font-medium leading-none">Add connectors</span>
                      </button>
                      <div className="my-1.5 border-t border-[var(--privora-border)]/50" />
                      <button
                        type="button"
                        onClick={onToggleWebSearch}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between text-[14px] font-sans hover:bg-[var(--privora-surface)] transition-colors ${isWebSearchEnabled ? "text-[var(--privora-accent)]" : "text-[var(--privora-text)]"}`}
                      >
                        <div className="flex items-center gap-3">
                          <Globe className={`w-4 h-4 ${isWebSearchEnabled ? "opacity-100" : "opacity-70"}`} />
                          <span className="font-medium leading-none">Web search</span>
                        </div>
                        {isWebSearchEnabled && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                      </button>
                      <button
                        type="button"
                        onClick={onToggleDeepResearch}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between text-[14px] font-sans hover:bg-[var(--privora-surface)] transition-colors ${isDeepResearchEnabled ? "text-[var(--privora-accent)]" : "text-[var(--privora-text)]"}`}
                      >
                        <div className="flex items-center gap-3">
                          <Microscope className={`w-4 h-4 ${isDeepResearchEnabled ? "opacity-100" : "opacity-70"}`} />
                          <span className="font-medium leading-none">Deep research</span>
                        </div>
                        {isDeepResearchEnabled && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                      </button>
                      <div>
                        <button
                          type="button"
                          onClick={() => setIsStyleDropdownOpen(!isStyleDropdownOpen)}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between text-[14px] font-sans hover:bg-[var(--privora-user-bubble)] transition-colors ${
                            isStyleDropdownOpen ? "text-[var(--privora-accent)] bg-[var(--privora-user-bubble)]" : "text-[var(--privora-text)]"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <Feather className={`w-4 h-4 shrink-0 ${isStyleDropdownOpen ? "opacity-100" : "opacity-70"}`} />
                            <span className="truncate font-medium leading-none">Use style</span>
                          </div>
                          <ChevronDown className={`w-3 h-3 shrink-0 opacity-50 transition-transform ${isStyleDropdownOpen ? "rotate-180 sm:-rotate-90" : "-rotate-90"}`} />
                        </button>

                        <AnimatePresence>
                          {isStyleDropdownOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: 6, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 6, scale: 0.98 }}
                              transition={{ duration: 0.14 }}
                              className={`${styleMenuPositionClass} z-[60] w-64 rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] p-1 shadow-[var(--privora-shadow)]`}
                            >
                              {responseStyleOptions.map((style) => {
                                const isActive = selectedStyle === style.id;

                                return (
                                  <button
                                    key={style.id}
                                    type="button"
                                    onClick={() => handleSelectStyle(style.id)}
                                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[14px] transition-colors ${
                                      isActive
                                        ? "bg-[var(--privora-user-bubble)] text-[var(--privora-accent)]"
                                        : "text-[var(--privora-text)] hover:bg-[var(--privora-user-bubble)]"
                                    }`}
                                  >
                                    <span className="flex min-w-0 items-center gap-3">
                                      <Feather className="h-4 w-4 shrink-0 opacity-80" />
                                      <span className="truncate">{style.label}</span>
                                    </span>
                                    {isActive && <Check className="h-3.5 w-3.5 shrink-0" />}
                                  </button>
                                );
                              })}
                              <div className="my-1 border-t border-[var(--privora-border)]/70" />
                              <button
                                type="button"
                                onClick={() => setIsStyleDropdownOpen(false)}
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] text-[var(--privora-text)] transition-colors hover:bg-[var(--privora-user-bubble)]"
                              >
                                <Plus className="h-4 w-4 opacity-70" />
                                <span>Create & edit styles</span>
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <input
              type="file"
              multiple
              accept={selectedModelIsCliproxy ? CLIPROXY_ATTACHMENT_ACCEPT : GEMINI_ATTACHMENT_ACCEPT}
              ref={fileInputRef}
              onChange={onFileSelect}
              className="hidden"
            />

            <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-1.5 relative">
              {isDeepResearchEnabled && (
                <span className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--privora-user-bubble)] px-2 py-1.5 text-[12px] font-medium text-[var(--privora-text)]">
                  <Microscope className="h-3.5 w-3.5" />
                  Deep Research
                </span>
              )}
              <button
                type="button"
                disabled={settingsDisabled}
                onClick={onToggleThinking}
                className={`shrink-0 px-2 py-1.5 flex items-center gap-1.5 text-[12px] sm:text-[13px] font-sans rounded-md transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                  isThinkingEnabled
                    ? "bg-[var(--privora-user-bubble)] text-[var(--privora-text)] shadow-sm"
                    : "text-[var(--privora-muted)] hover:bg-[var(--privora-user-bubble)] hover:text-[var(--privora-text)]"
                }`}
                title={
                  isThinkingEnabled
                    ? selectedModelIsGemini
                      ? "Gemini medium thinking enabled"
                      : "GPT-5.5 medium reasoning enabled"
                    : "Instant mode"
                }
              >
                <Brain className="w-3.5 h-3.5" />
                {selectedReasoningModeLabel}
              </button>

              <div className="relative min-w-0">
                <button
                  type="button"
                  disabled={settingsDisabled}
                  onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                  className={`min-w-0 max-w-[9.5rem] sm:max-w-none text-[12px] sm:text-[13px] px-2 py-1.5 flex items-center gap-1.5 font-sans rounded-md transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                    isModelDropdownOpen
                      ? "bg-[var(--privora-user-bubble)] text-[var(--privora-text)]"
                      : "text-[var(--privora-muted)] hover:bg-[var(--privora-user-bubble)] hover:text-[var(--privora-text)]"
                  }`}
                  title="Select AI Model"
                >
                  <span className="min-w-0 truncate">{selectedModelLabel}</span>
                  <ChevronDown className={`w-3.5 h-3.5 opacity-50 shrink-0 transition-transform ${isModelDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                <AnimatePresence>
                  {isModelDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsModelDropdownOpen(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.98 }}
                        transition={{ duration: 0.14 }}
                        className="absolute bottom-[calc(100%+0.5rem)] right-0 w-[min(16rem,calc(100vw-2rem))] flex flex-col bg-[var(--privora-surface)] rounded-xl border border-[var(--privora-border)] shadow-[var(--privora-shadow)] z-50 overflow-hidden p-1"
                      >
                        {modelOptions.map((option) => {
                          const isActive = selectedModel === option.id;

                          return (
                            <button
                              key={`${option.provider}-${option.label}`}
                              type="button"
                              onClick={() => handleSelectModel(option.id)}
                              className={`text-left px-3 py-2.5 rounded-lg text-[14px] font-sans transition-colors ${
                                isActive
                                  ? "text-[var(--privora-text)] font-medium bg-[var(--privora-user-bubble)]"
                                  : "text-[var(--privora-text)] hover:bg-[var(--privora-user-bubble)]"
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              <AnimatePresence mode="popLayout">
                {isTyping ? (
                  <motion.button
                    key="stop"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    type="button"
                    onClick={onStopGeneration}
                    title="Stop generating"
                    className="shrink-0 ml-1 w-8 h-8 rounded-full flex items-center justify-center bg-[var(--privora-text)]/10 text-[var(--privora-text)] hover:bg-[var(--privora-text)]/20 transition-all border border-[var(--privora-text)]/10"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </motion.button>
                ) : (
                  <motion.button
                    key="send"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    type="submit"
                    disabled={!input.trim() && attachments.length === 0}
                    className="shrink-0 ml-1 w-8 h-8 rounded-full flex items-center justify-center bg-[var(--privora-accent)] text-[var(--privora-accent-fg)] hover:bg-[var(--privora-accent-hover)] shadow-md disabled:shadow-none disabled:opacity-30 disabled:bg-[var(--privora-text)]/10 disabled:text-[var(--privora-muted)] transition-all"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="translate-x-[0.5px]">
                      <path d="M12 19V5" />
                      <path d="M5 12l7-7 7 7" />
                    </svg>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </form>
      </div>
    </motion.footer>
  );
}
