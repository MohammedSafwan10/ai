import { useEffect, useState, type ChangeEvent, type ClipboardEvent, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { Blocks, Brain, Camera, Check, ChevronDown, CornerDownRight, Feather, FolderPlus, Globe, ImagePlus, Microscope, Paperclip, Plus, Square, Trash2, Workflow, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  CLIPROXY_ATTACHMENT_ACCEPT,
  GEMINI_ATTACHMENT_ACCEPT,
  OPENROUTER_ATTACHMENT_ACCEPT,
  type Attachment,
} from "../../../lib/attachments";
import {
  getModelLabel,
  getModelOption,
  getModelProviderGroups,
  getReasoningModeLabel,
  isCliproxyModel,
  isGeminiModel,
  isOpenRouterModel,
} from "../../../lib/models";
import { getImageModelOption, imageModelOptions, type ImageModelId } from "../../../lib/imageModels";
import { getResponseStyle, responseStyleOptions, type ResponseStyleId } from "../../../lib/prompt";
import type { ImageCount, ImageSettings, ImageSizePreset } from "../../../lib/settings";



interface ChatComposerProps {
  input: string;
  attachments: Attachment[];
  isTyping: boolean;
  selectedModel: string;
  selectedStyle: ResponseStyleId;
  isThinkingEnabled: boolean;
  isWebSearchEnabled: boolean;
  isDeepResearchEnabled: boolean;
  composerMode: "chat" | "image";
  imageSettings: ImageSettings;
  researchEditContext?: {
    title: string;
  };
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (value: string) => void;
  onSubmit: (event?: FormEvent) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onTakeScreenshot: () => void;
  onPreviewAttachment: (attachment: Attachment) => void;
  onRemoveAttachment: (index: number) => void;
  onToggleThinking: () => void;
  onToggleWebSearch: () => void;
  onToggleDeepResearch: () => void;
  onSelectComposerMode: (mode: "chat" | "image") => void;
  onImageSettingsChange: (settings: ImageSettings) => void;
  onSelectModel: (modelId: string) => void;
  onSelectStyle: (styleId: ResponseStyleId) => void;
  onStopGeneration: () => void;
  onClearResearchEdit?: () => void;
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
  composerMode,
  imageSettings,
  researchEditContext,
  textareaRef,
  fileInputRef,
  onInputChange,
  onSubmit,
  onKeyDown,
  onPaste,
  onFileSelect,
  onTakeScreenshot,
  onPreviewAttachment,
  onRemoveAttachment,
  onToggleThinking,
  onToggleWebSearch,
  onToggleDeepResearch,
  onSelectComposerMode,
  onImageSettingsChange,
  onSelectModel,
  onSelectStyle,
  onStopGeneration,
  onClearResearchEdit,
  placement = "footer",
}: ChatComposerProps) {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isImageModelDropdownOpen, setIsImageModelDropdownOpen] = useState(false);
  const [isStyleDropdownOpen, setIsStyleDropdownOpen] = useState(false);
  const [isImageOptionsOpen, setIsImageOptionsOpen] = useState(false);
  const selectedModelOption = getModelOption(selectedModel);
  const selectedModelLabel = getModelLabel(selectedModel);
  const modelProviderGroups = getModelProviderGroups();
  const selectedStyleOption = getResponseStyle(selectedStyle);
  const selectedReasoningModeLabel = getReasoningModeLabel(
    selectedModelOption?.provider,
    isThinkingEnabled ? "thinking" : "instant"
  );
  const selectedModelIsGemini = isGeminiModel(selectedModel);
  const selectedModelIsCliproxy = isCliproxyModel(selectedModel);
  const selectedModelIsOpenRouter = isOpenRouterModel(selectedModel);
  const settingsDisabled = isTyping;
  const isImageMode = composerMode === "image";
  const selectedImageModel = getImageModelOption(imageSettings.model);
  const hasImageAttachment = attachments.some(attachment => attachment.mimeType.startsWith("image/"));
  const explicitLineCount = input.split("\n").length;
  const estimatedSoftLineCount = input
    .split("\n")
    .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 72)), 0);
  const hasExpandedInput = explicitLineCount > 1 || estimatedSoftLineCount > 2;

  useEffect(() => {
    if (!settingsDisabled) return;
    setIsAddMenuOpen(false);
    setIsModelDropdownOpen(false);
    setIsImageModelDropdownOpen(false);
    setIsStyleDropdownOpen(false);
    setIsImageOptionsOpen(false);
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
  const imageSizeOptions: Array<{ id: ImageSizePreset; label: string; detail: string }> = [
    { id: "square", label: "1:1", detail: "1024" },
    { id: "square_2k", label: "1:1 2K", detail: "2048" },
    { id: "landscape", label: "3:2", detail: "1536x1024" },
    { id: "widescreen", label: "16:9", detail: "2048x1152" },
    { id: "widescreen_4k", label: "16:9 4K", detail: "3840x2160" },
    { id: "portrait", label: "2:3", detail: "1024x1536" },
    { id: "story_4k", label: "9:16", detail: "2160x3840" },
    { id: "auto", label: "Auto", detail: "Best fit" },
  ];
  const largeImageSizePresets: ImageSizePreset[] = ["square_2k", "widescreen_4k", "story_4k", "auto"];
  const isLargeImageSizePreset = (sizePreset: ImageSizePreset) => largeImageSizePresets.includes(sizePreset);
  const imageSizeLabel = imageSizeOptions.find(option => option.id === imageSettings.sizePreset)?.label || "1:1";
  const qualityLabel = imageSettings.quality[0].toUpperCase() + imageSettings.quality.slice(1);
  const showImageQuality = selectedImageModel.provider === "cliproxy";
  const updateImageSettings = (patch: Partial<ImageSettings>) => {
    const nextSizePreset = patch.sizePreset || imageSettings.sizePreset;
    const nextCount = patch.count || imageSettings.count;
    const nextModel = getImageModelOption(patch.model || imageSettings.model);
    onImageSettingsChange({
      ...imageSettings,
      ...patch,
      model: nextModel.id,
      count: isLargeImageSizePreset(nextSizePreset) && nextCount > 1 ? 1 : nextCount,
      partialImages: 0,
      outputFormat: "png",
    });
  };

  return (
    <motion.footer
      initial={{ opacity: 0, y: isLanding ? 8 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: isLanding ? -6 : 10 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
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
          {researchEditContext && (
            <div className="mx-1.5 mt-1.5 flex items-center gap-2 rounded-2xl bg-[var(--privora-text)]/[0.08] px-3 py-2 text-[13px] text-[var(--privora-text)] sm:mx-2 sm:mt-2">
              <CornerDownRight className="h-4 w-4 shrink-0 text-[var(--privora-muted)]" />
              <span className="min-w-0 flex-1 truncate font-medium">
                &ldquo;{researchEditContext.title}&rdquo;
              </span>
              <button
                type="button"
                onClick={onClearResearchEdit}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--privora-muted)] transition-colors hover:bg-[var(--privora-text)]/10 hover:text-[var(--privora-text)]"
                title="Remove research plan context"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

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
            onPaste={onPaste}
            onFocus={() => {
              window.setTimeout(() => {
                textareaRef.current?.scrollIntoView({ block: "nearest" });
              }, 250);
            }}
            placeholder={
              isImageMode
                ? hasImageAttachment
                  ? "Describe how to edit this image"
                  : "Describe the image to create"
                : researchEditContext
                  ? "Follow up with questions or adjustments"
                  : "How can I help you today?"
            }
            className={`w-full max-h-[min(16rem,42vh)] text-[15px] bg-transparent text-[var(--privora-text)] placeholder-[var(--privora-muted)] px-4 pb-3 pt-4 outline-none resize-none leading-relaxed transition-[color,min-height] duration-200 [overflow-wrap:anywhere] ${
              hasExpandedInput ? "min-h-[8.5rem] sm:min-h-[9.5rem]" : "min-h-[52px] sm:min-h-[56px]"
            }`}
            rows={1}
            wrap="soft"
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
                        className="w-full text-left px-3 py-2 flex items-center gap-3 text-[14px] font-sans hover:bg-[var(--privora-surface)] transition-colors text-[var(--privora-text)] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Paperclip className="w-4 h-4 opacity-70" />
                        <span className="font-medium leading-none">Add files or photos</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectComposerMode(isImageMode ? "chat" : "image");
                          setIsAddMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between text-[14px] font-sans hover:bg-[var(--privora-surface)] transition-colors ${isImageMode ? "text-[var(--privora-accent)]" : "text-[var(--privora-text)]"}`}
                      >
                        <div className="flex items-center gap-3">
                          <ImagePlus className={`w-4 h-4 ${isImageMode ? "opacity-100" : "opacity-70"}`} />
                          <span className="font-medium leading-none">Create image</span>
                        </div>
                        {isImageMode && <Check className="h-3.5 w-3.5 opacity-70" />}
                      </button>
                      <button
                        type="button"
                        disabled={settingsDisabled}
                        onClick={() => {
                          setIsAddMenuOpen(false);
                          onTakeScreenshot();
                        }}
                        className="w-full text-left px-3 py-2 flex items-center gap-3 text-[14px] font-sans hover:bg-[var(--privora-surface)] transition-colors text-[var(--privora-text)] disabled:cursor-not-allowed disabled:opacity-45"
                        title="Capture a tab, window, or screen as an image attachment"
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
                      {!isImageMode && (
                      <>
                        <div className="my-1.5 border-t border-[var(--privora-border)]/50" />
                        <button
                          type="button"
                          onClick={onToggleWebSearch}
                          title={isWebSearchEnabled ? "Web search is required for the next response." : "Web search is automatic when current information is needed."}
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
                      </>
                      )}
                      {!isImageMode && (
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
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <input
              type="file"
              multiple
              accept={isImageMode ? "image/*" : selectedModelIsCliproxy ? CLIPROXY_ATTACHMENT_ACCEPT : selectedModelIsOpenRouter ? OPENROUTER_ATTACHMENT_ACCEPT : GEMINI_ATTACHMENT_ACCEPT}
              ref={fileInputRef}
              onChange={onFileSelect}
              className="hidden"
            />

            <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-1.5 relative">
              {isDeepResearchEnabled && !isImageMode && (
                <span className="hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--privora-user-bubble)] px-2 py-1.5 text-[12px] font-medium text-[var(--privora-text)]">
                  <Microscope className="h-3.5 w-3.5" />
                  Deep Research
                </span>
              )}
              {isImageMode && (
                <button
                  type="button"
                  disabled={settingsDisabled}
                  onClick={() => onSelectComposerMode("chat")}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--privora-user-bubble)] px-2 py-1.5 text-[12px] font-medium text-[var(--privora-text)] transition-colors hover:bg-[var(--privora-text)]/10 disabled:opacity-45"
                  title={`Image mode uses ${selectedImageModel.label}`}
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Create image
                </button>
              )}
              {isImageMode && (
                <div className="relative">
                  <button
                    type="button"
                    disabled={settingsDisabled}
                    onClick={() => setIsImageOptionsOpen(!isImageOptionsOpen)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--privora-text)]/[0.04] px-2 py-1.5 text-[12px] font-medium text-[var(--privora-muted)] transition-colors hover:bg-[var(--privora-text)]/10 hover:text-[var(--privora-text)] disabled:opacity-45"
                    title="Image options"
                  >
                    <span>{imageSizeLabel}</span>
                    {showImageQuality && (
                      <>
                        <span className="text-[var(--privora-border)]">·</span>
                        <span>{qualityLabel}</span>
                      </>
                    )}
                    <span className="text-[var(--privora-border)]">·</span>
                    <span>{imageSettings.count}</span>
                  </button>

                  <AnimatePresence>
                    {isImageOptionsOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setIsImageOptionsOpen(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 6, scale: 0.98 }}
                          transition={{ duration: 0.14 }}
                          className="absolute bottom-[calc(100%+0.5rem)] right-0 z-50 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] p-2 shadow-[var(--privora-shadow)]"
                        >
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                              {imageSizeOptions.map((option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => updateImageSettings({ sizePreset: option.id })}
                                  className={`min-h-[3.25rem] rounded-lg px-2 py-2 text-center transition-colors ${
                                    imageSettings.sizePreset === option.id
                                      ? "bg-[var(--privora-user-bubble)] text-[var(--privora-text)]"
                                      : "text-[var(--privora-muted)] hover:bg-[var(--privora-user-bubble)] hover:text-[var(--privora-text)]"
                                  }`}
                                >
                                  <span className="block text-[12px] font-semibold leading-none">{option.label}</span>
                                  <span className="mt-1 block truncate text-[10px] font-medium opacity-70">{option.detail}</span>
                                </button>
                              ))}
                            </div>

                            {showImageQuality && (
                              <div className="grid grid-cols-3 gap-1">
                                {(["low", "medium", "high"] as const).map((quality) => (
                                  <button
                                    key={quality}
                                    type="button"
                                    onClick={() => updateImageSettings({ quality })}
                                    className={`rounded-lg px-2 py-2 text-[12px] font-medium capitalize transition-colors ${
                                      imageSettings.quality === quality
                                        ? "bg-[var(--privora-user-bubble)] text-[var(--privora-text)]"
                                        : "text-[var(--privora-muted)] hover:bg-[var(--privora-user-bubble)] hover:text-[var(--privora-text)]"
                                    }`}
                                  >
                                    {quality}
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="grid grid-cols-4 gap-1">
                              {([1, 2, 3, 4] as ImageCount[]).map((count) => (
                                <button
                                  key={count}
                                  type="button"
                                  disabled={count > 1 && isLargeImageSizePreset(imageSettings.sizePreset)}
                                  onClick={() => updateImageSettings({ count })}
                                  className={`rounded-lg px-2 py-2 text-[12px] font-medium transition-colors ${
                                    imageSettings.count === count
                                      ? "bg-[var(--privora-user-bubble)] text-[var(--privora-text)]"
                                      : "text-[var(--privora-muted)] hover:bg-[var(--privora-user-bubble)] hover:text-[var(--privora-text)] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[var(--privora-muted)]"
                                  }`}
                                  title={count > 1 && isLargeImageSizePreset(imageSettings.sizePreset) ? "Large image sizes generate one image at a time." : undefined}
                                >
                                  {count}
                                </button>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              )}
              <button
                type="button"
                disabled={settingsDisabled || isImageMode}
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
                      : selectedModelIsOpenRouter
                        ? "OpenRouter medium reasoning enabled when the selected model supports it"
                        : "GPT-5.5 medium reasoning enabled"
                    : "Instant mode"
                }
              >
                <Brain className="w-3.5 h-3.5" />
                {selectedReasoningModeLabel}
              </button>

              <div className="relative min-w-0">
                {isImageMode ? (
                  <>
                    <button
                      type="button"
                      disabled={settingsDisabled}
                      onClick={() => setIsImageModelDropdownOpen(!isImageModelDropdownOpen)}
                      className={`min-w-0 max-w-[9.5rem] sm:max-w-none text-[12px] sm:text-[13px] px-2 py-1.5 flex items-center gap-1.5 font-sans rounded-md transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                        isImageModelDropdownOpen
                          ? "bg-[var(--privora-user-bubble)] text-[var(--privora-text)]"
                          : "text-[var(--privora-muted)] hover:bg-[var(--privora-user-bubble)] hover:text-[var(--privora-text)]"
                      }`}
                      title={selectedImageModel.description}
                    >
                      <span className="min-w-0 truncate">{selectedImageModel.label}</span>
                      <ChevronDown className={`w-3.5 h-3.5 opacity-50 shrink-0 transition-transform ${isImageModelDropdownOpen ? "rotate-180" : ""}`} />
                    </button>

                    <AnimatePresence>
                      {isImageModelDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => setIsImageModelDropdownOpen(false)}
                          />
                          <motion.div
                            initial={{ opacity: 0, y: 6, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 6, scale: 0.98 }}
                            transition={{ duration: 0.14 }}
                            className="absolute bottom-[calc(100%+0.5rem)] right-0 z-50 flex w-[min(15rem,calc(100vw-2rem))] flex-col rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] p-1 shadow-[var(--privora-shadow)]"
                          >
                            {imageModelOptions.map((option) => {
                              const isActive = imageSettings.model === option.id;

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => {
                                    updateImageSettings({ model: option.id as ImageModelId });
                                    setIsImageModelDropdownOpen(false);
                                  }}
                                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] font-sans transition-colors ${
                                    isActive
                                      ? "bg-[var(--privora-user-bubble)] font-medium text-[var(--privora-text)]"
                                      : "text-[var(--privora-text)] hover:bg-[var(--privora-user-bubble)]"
                                  }`}
                                  title={option.description}
                                >
                                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                  {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--privora-text)]" />}
                                </button>
                              );
                            })}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </>
                ) : (
                <>
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
                        className="absolute bottom-[calc(100%+0.5rem)] right-0 z-50 flex max-h-[min(28rem,calc(100vh-8rem))] w-[min(17rem,calc(100vw-2rem))] flex-col overflow-y-auto rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] p-1 shadow-[var(--privora-shadow)]"
                      >
                        {modelProviderGroups.map((group, groupIndex) => (
                          <div key={group.id} className={groupIndex === 0 ? "" : "mt-1 border-t border-[var(--privora-border)]/60 pt-1"}>
                            <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--privora-muted)]">
                              {group.label}
                            </div>
                            {group.models.map((option) => {
                              const isActive = selectedModel === option.id;

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => handleSelectModel(option.id)}
                                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] font-sans transition-colors ${
                                    isActive
                                      ? "bg-[var(--privora-user-bubble)] font-medium text-[var(--privora-text)]"
                                      : "text-[var(--privora-text)] hover:bg-[var(--privora-user-bubble)]"
                                  }`}
                                  title={option.description}
                                >
                                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                  {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--privora-text)]" />}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
                </>
                )}
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
