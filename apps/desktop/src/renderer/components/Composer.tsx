import { AtSign, Brain, BrainCircuit, Check, ChevronDown, FileText, FolderOpen, ImagePlus, Maximize2, Minimize2, Send, ShieldAlert, Square, TerminalSquare, X, Zap } from "lucide-react";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { getModelOption, getModelProviderGroups, type PermissionMode, type ReasoningEffort } from "../../shared/models";
import type { ContextMentionRecord, ContextMentionSuggestion, DesktopAttachmentRecord, SettingsRecord } from "../../shared/types";

interface ComposerProps {
  settings: SettingsRecord;
  disabled: boolean;
  running: boolean;
  activeThreadId: string | null;
  promptHistory: string[];
  draft?: {
    id: number;
    text: string;
    attachments?: DesktopAttachmentRecord[];
    contextMentions?: ContextMentionRecord[];
  } | null;
  onSubmit: (value: string, attachments?: DesktopAttachmentRecord[], contextMentions?: ContextMentionRecord[]) => void;
  onStop: () => void;
  onSettings: (settings: Partial<SettingsRecord>) => void;
  onDraftConsumed?: () => void;
}

export function Composer({ settings, disabled, running, activeThreadId, promptHistory, draft, onSubmit, onStop, onSettings, onDraftConsumed }: ComposerProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<DesktopAttachmentRecord[]>([]);
  const [contextMentions, setContextMentions] = useState<ContextMentionRecord[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [mentionToken, setMentionToken] = useState<{ query: string; start: number; end: number } | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<ContextMentionSuggestion[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [reasoningMenuOpen, setReasoningMenuOpen] = useState(false);
  const [accessMenuOpen, setAccessMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastHistoryTextRef = useRef<string | null>(null);
  const activeModel = getModelOption(settings.model);
  const modelProviderGroups = getModelProviderGroups();
  const lineCount = value ? value.split(/\r?\n/).length : 0;
  const showLongPromptControls = value.length > COMPOSER_LONG_PROMPT_CHARS || lineCount > COMPOSER_LONG_PROMPT_LINES || expanded;

  useEffect(() => {
    if (!draft) return;
    setValue(draft.text);
    setAttachments(draft.attachments || []);
    setContextMentions(draft.contextMentions || []);
    setMentionToken(null);
    setMentionSuggestions([]);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(draft.text.length, draft.text.length);
    }, 0);
    onDraftConsumed?.();
  }, [draft, onDraftConsumed]);

  useEffect(() => {
    setHistoryCursor(null);
    lastHistoryTextRef.current = null;
  }, [activeThreadId]);

  useEffect(() => {
    if (!activeThreadId || !mentionToken) {
      setMentionSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      window.privoraDesktop.searchContextMentions({ threadId: activeThreadId, query: mentionToken.query })
        .then((suggestions) => {
          if (!cancelled) setMentionSuggestions(suggestions);
        })
        .catch(() => {
          if (!cancelled) setMentionSuggestions([]);
        });
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeThreadId, mentionToken]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const maxHeight = expanded ? Math.min(window.innerHeight * 0.56, 520) : 180;
    el.style.height = "0px";
    el.style.height = `${Math.min(maxHeight, Math.max(52, el.scrollHeight))}px`;
  }, [expanded, value]);

  const submit = () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0 && contextMentions.length === 0) || disabled) return;
    setValue("");
    const submittedAttachments = attachments;
    const submittedMentions = contextMentions;
    setAttachments([]);
    setContextMentions([]);
    setMentionToken(null);
    setMentionSuggestions([]);
    setAttachmentError(null);
    setExpanded(false);
    setHistoryCursor(null);
    lastHistoryTextRef.current = null;
    onSubmit(
      trimmed,
      submittedAttachments.length ? submittedAttachments : undefined,
      submittedMentions.length ? submittedMentions : undefined,
    );
  };

  const detectMentionToken = (nextValue: string, cursor: number) => {
    setHistoryCursor(null);
    lastHistoryTextRef.current = null;
    const beforeCursor = nextValue.slice(0, cursor);
    const match = beforeCursor.match(/(^|\s)@([^\s]*)$/);
    if (!match) {
      setMentionToken(null);
      setMentionSuggestions([]);
      return;
    }
    const query = match[2] || "";
    setMentionToken({ query, start: cursor - query.length - 1, end: cursor });
  };

  const shouldNavigatePromptHistory = () => {
    if (promptHistory.length === 0 || mentionToken) return false;
    const textarea = textareaRef.current;
    if (!textarea || textarea.selectionStart !== textarea.selectionEnd) return false;
    if (!value) return true;
    if (textarea.selectionStart !== 0 && textarea.selectionStart !== value.length) return false;
    return lastHistoryTextRef.current === value;
  };

  const applyHistoryValue = (nextValue: string, nextCursor: number | null) => {
    setValue(nextValue);
    setHistoryCursor(nextCursor);
    lastHistoryTextRef.current = nextValue || null;
    setMentionToken(null);
    setMentionSuggestions([]);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextValue.length, nextValue.length);
    }, 0);
  };

  const navigatePromptHistory = (direction: "older" | "newer") => {
    if (!shouldNavigatePromptHistory()) return false;
    if (direction === "older") {
      const nextCursor = historyCursor === null ? promptHistory.length - 1 : Math.max(0, historyCursor - 1);
      applyHistoryValue(promptHistory[nextCursor] || "", nextCursor);
      return true;
    }
    if (historyCursor === null) return false;
    const nextCursor = historyCursor + 1;
    if (nextCursor >= promptHistory.length) {
      applyHistoryValue("", null);
      return true;
    }
    applyHistoryValue(promptHistory[nextCursor] || "", nextCursor);
    return true;
  };

  const selectMention = (suggestion: ContextMentionSuggestion) => {
    if (!mentionToken) return;
    const replacement = suggestion.type === "category" ? `@${suggestion.path || ""}` : "";
    const nextValue = `${value.slice(0, mentionToken.start)}${replacement}${value.slice(mentionToken.end)}`;
    setValue(nextValue);
    if (suggestion.type !== "category") {
      const mention: ContextMentionRecord = {
        id: suggestion.id,
        type: suggestion.type,
        label: suggestion.label,
        path: suggestion.path,
        createdAt: Date.now(),
      };
      setContextMentions((current) => current.some((item) => item.id === mention.id) ? current : [...current, mention]);
      setMentionToken(null);
      setMentionSuggestions([]);
    } else {
      const nextCursor = mentionToken.start + replacement.length;
      window.setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
        detectMentionToken(nextValue, nextCursor);
      }, 0);
    }
  };

  const addFiles = async (files: FileList | File[]) => {
    const incoming = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (incoming.length === 0) return;
    try {
      const remaining = MAX_ATTACHMENTS - attachments.length;
      if (remaining <= 0) {
        setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} images.`);
        return;
      }
      const accepted = incoming.slice(0, remaining);
      const next = await Promise.all(accepted.map(readImageAttachment));
      const currentBytes = attachments.reduce((sum, item) => sum + item.size, 0);
      const nextBytes = next.reduce((sum, item) => sum + item.size, 0);
      if (currentBytes + nextBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
        setAttachmentError("Images are over the 20 MB request limit.");
        return;
      }
      setAttachments((current) => [...current, ...next]);
      setAttachmentError(incoming.length > accepted.length ? `Added ${accepted.length}; ${incoming.length - accepted.length} skipped.` : null);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Could not attach that image.");
    }
  };

  return (
    <form
      className={clsx("composer", dragging && "is-dragging", expanded && "is-expanded")}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void addFiles(event.dataTransfer.files);
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        disabled={disabled}
        placeholder={disabled ? "Choose a workspace to start" : attachments.length ? "Ask about these images or add instructions" : "Ask Privora to inspect, edit, or run something locally"}
        onChange={(event) => {
          setValue(event.target.value);
          detectMentionToken(event.target.value, event.currentTarget.selectionStart);
        }}
        onPaste={(event) => {
          const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
          if (imageFiles.length > 0) void addFiles(imageFiles);
        }}
        onKeyDown={(event) => {
          if (mentionToken && mentionSuggestions.length > 0 && (event.key === "Enter" || event.key === "Tab")) {
            event.preventDefault();
            selectMention(mentionSuggestions[0]);
            return;
          }
          if (event.key === "Escape" && mentionToken) {
            event.preventDefault();
            setMentionToken(null);
            setMentionSuggestions([]);
            return;
          }
          if ((event.key === "ArrowUp" || event.key === "ArrowDown") && navigatePromptHistory(event.key === "ArrowUp" ? "older" : "newer")) {
            event.preventDefault();
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
      {showLongPromptControls && (
        <div className="composer-long-prompt-bar">
          <span>{value.length.toLocaleString()} chars · {lineCount.toLocaleString()} lines</span>
          <button
            type="button"
            className="composer-expand-button"
            onClick={() => {
              setExpanded((current) => !current);
              window.setTimeout(() => textareaRef.current?.focus(), 0);
            }}
          >
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            {expanded ? "Compact editor" : "Expand editor"}
          </button>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="attachment-tray" aria-label="Attached images">
          {attachments.map((attachment) => (
            <div className="attachment-chip" key={attachment.id}>
              <img src={attachmentDataUrl(attachment)} alt={attachment.name} />
              <div>
                <strong>{attachment.name}</strong>
                <span>{formatBytes(attachment.size)}</span>
              </div>
              <button
                type="button"
                title="Remove image"
                onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {contextMentions.length > 0 && (
        <div className="context-mention-tray" aria-label="Attached context">
          {contextMentions.map((mention) => (
            <span className="context-mention-chip" key={mention.id}>
              {mention.type === "file" && <FileText size={13} />}
              {mention.type === "folder" && <FolderOpen size={13} />}
              {mention.type === "terminal" && <TerminalSquare size={13} />}
              {mention.label}
              <button
                type="button"
                title="Remove context"
                onClick={() => setContextMentions((current) => current.filter((item) => item.id !== mention.id))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {mentionToken && mentionSuggestions.length > 0 && (
        <div className="context-mention-menu">
          {mentionSuggestions.map((suggestion) => (
            <button type="button" key={suggestion.id} onClick={() => selectMention(suggestion)}>
              {suggestion.type === "category" && <AtSign size={14} />}
              {suggestion.type === "file" && <FileText size={14} />}
              {suggestion.type === "folder" && <FolderOpen size={14} />}
              {suggestion.type === "terminal" && <TerminalSquare size={14} />}
              <span>
                <strong>{suggestion.label}</strong>
                {suggestion.sublabel && <small>{suggestion.sublabel}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
      {attachmentError && <div className="attachment-error">{attachmentError}</div>}
      <div className="composer-toolbar">
        <div className="toolbar-left">
          <button
            type="button"
            className="icon-tool-button"
            title="Add images"
            disabled={disabled || running}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={15} />
          </button>
          <input
            ref={fileInputRef}
            className="hidden-file-input"
            type="file"
            hidden
            aria-hidden="true"
            tabIndex={-1}
            accept={SUPPORTED_IMAGE_TYPES.join(",")}
            multiple
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <span className="tool-pill">
            <TerminalSquare size={15} />
            Files + terminal
          </span>
          <div className="menu-anchor">
            <button
              type="button"
              className="tool-pill permission-pill"
              onClick={() => setAccessMenuOpen((open) => !open)}
            >
              {settings.permissionMode === "yolo" ? <Zap size={15} /> : <ShieldAlert size={15} />}
              {settings.permissionMode === "yolo" ? "Full access" : "Ask risky"}
              <ChevronDown size={13} />
            </button>
            {accessMenuOpen && (
              <div className="floating-menu compact-menu">
                {permissionOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onSettings({ permissionMode: option.id });
                      setAccessMenuOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {settings.permissionMode === option.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="toolbar-right">
          <div className="menu-anchor">
            <button
              type="button"
              className="reasoning-button"
              onClick={() => setReasoningMenuOpen((open) => !open)}
            >
              <BrainCircuit size={15} className={running ? "reasoning-spin" : undefined} />
              <span>{reasoningLabel(settings.reasoningEffort)}</span>
              <ChevronDown size={13} />
            </button>
            {reasoningMenuOpen && (
              <div className="floating-menu reasoning-menu">
                <small>Thinking</small>
                {reasoningOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onSettings({ reasoningEffort: option.id });
                      setReasoningMenuOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {settings.reasoningEffort === option.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="menu-anchor">
            <button
              type="button"
              className="model-button"
              onClick={() => setModelMenuOpen((open) => !open)}
            >
              <Brain size={15} />
              <span className="model-short">{activeModel.label}</span>
              <ChevronDown size={13} />
            </button>
            {modelMenuOpen && (
              <div className="floating-menu model-menu">
                <section>
                  {modelProviderGroups.map((group) => (
                    <div className="model-group" key={group.id}>
                      <small>{group.label}</small>
                      {group.models.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => {
                            onSettings({ model: model.id });
                            setModelMenuOpen(false);
                          }}
                        >
                          <span>{model.label}</span>
                          {activeModel.id === model.id && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  ))}
                </section>
              </div>
            )}
          </div>
          <button type="button" className="send-button" onClick={running ? onStop : submit} disabled={(disabled || (!value.trim() && attachments.length === 0 && contextMentions.length === 0)) && !running}>
            {running ? <Square size={17} fill="currentColor" /> : <Send size={17} />}
          </button>
        </div>
      </div>
    </form>
  );
}

const reasoningOptions: Array<{ id: ReasoningEffort; label: string }> = [
  { id: "none", label: "Instant" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "extra_high", label: "Extra High" },
];

const permissionOptions: Array<{ id: PermissionMode; label: string }> = [
  { id: "ask_risky", label: "Ask risky" },
  { id: "yolo", label: "Full access" },
];

const reasoningLabel = (value: ReasoningEffort) =>
  reasoningOptions.find((option) => option.id === value)?.label || "Medium";

const MAX_ATTACHMENTS = 15;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif"];
const COMPOSER_LONG_PROMPT_CHARS = 1200;
const COMPOSER_LONG_PROMPT_LINES = 12;

const readImageAttachment = async (file: File): Promise<DesktopAttachmentRecord> => {
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error(`${file.name} is not a supported image type.`);
  }
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",").pop() || "" : result);
    };
    reader.readAsDataURL(file);
  });
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type,
    size: file.size,
    base64,
    createdAt: Date.now(),
  };
};

const attachmentDataUrl = (attachment: DesktopAttachmentRecord) =>
  `data:${attachment.mimeType};base64,${attachment.base64}`;

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
