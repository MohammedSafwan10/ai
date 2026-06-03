import { AlertTriangle, ArrowUp, AtSign, Blocks, Check, ChevronDown, ChevronRight, ClipboardList, Crosshair, Eye, FileText, FolderOpen, ImageOff, Maximize2, Minimize2, Paperclip, Plus, Search, ShieldAlert, Square, TerminalSquare, X, Zap } from "lucide-react";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getModelOption, getModelProviderGroups, type PermissionMode, type ReasoningEffort } from "../../shared/models";
import type { ContextMentionRecord, ContextMentionSuggestion, ContextUsageRecord, DesktopAttachmentRecord, SettingsRecord } from "../../shared/types";
import { ContextMeter } from "./ContextMeter";

interface ComposerProps {
  settings: SettingsRecord;
  disabled: boolean;
  inputDisabledReason?: string;
  running: boolean;
  stopping?: boolean;
  activeThreadId: string | null;
  promptHistory: string[];
  contextUsage?: ContextUsageRecord;
  draft?: {
    id: number;
    text: string;
    attachments?: DesktopAttachmentRecord[];
    contextMentions?: ContextMentionRecord[];
  } | null;
  onSubmit: (value: string, attachments?: DesktopAttachmentRecord[], contextMentions?: ContextMentionRecord[]) => void | boolean | Promise<void | boolean>;
  onStop: () => void;
  onSettings: (settings: Partial<SettingsRecord>) => void;
  onDraftConsumed?: () => void;
}

interface PastedBlock {
  id: string;
  label: string;
  text: string;
  createdAt: number;
}

type ComposerMenu = "tools" | "access" | "model";

export function Composer({
  settings,
  disabled,
  inputDisabledReason,
  running,
  stopping = false,
  activeThreadId,
  promptHistory,
  contextUsage,
  draft,
  onSubmit,
  onStop,
  onSettings,
  onDraftConsumed,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<DesktopAttachmentRecord[]>([]);
  const [contextMentions, setContextMentions] = useState<ContextMentionRecord[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<number | null>(null);
  const [persistedPromptHistory, setPersistedPromptHistory] = useState<string[]>([]);
  const [historySearchOpen, setHistorySearchOpen] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [pastedBlocks, setPastedBlocks] = useState<PastedBlock[]>([]);
  const [mentionToken, setMentionToken] = useState<{ query: string; start: number; end: number } | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<ContextMentionSuggestion[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [activeMenu, setActiveMenu] = useState<ComposerMenu | null>(null);
  const [modelSubmenuOpen, setModelSubmenuOpen] = useState(false);
  const [pursueGoal, setPursueGoal] = useState(false);
  const [confirmFullAccessOpen, setConfirmFullAccessOpen] = useState(false);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastHistoryTextRef = useRef<string | null>(null);
  const activeModel = getModelOption(settings.model);
  const modelProviderGroups = getModelProviderGroups();
  const firstVisionModel = useMemo(
    () => modelProviderGroups.flatMap((group) => group.models).find((model) => model.supportsImageInput),
    [modelProviderGroups],
  );
  const combinedPromptHistory = useMemo(
    () => mergePromptHistory(promptHistory, persistedPromptHistory),
    [persistedPromptHistory, promptHistory],
  );
  const historySearchResults = useMemo(
    () => filterPromptHistory(combinedPromptHistory, historySearchQuery),
    [combinedPromptHistory, historySearchQuery],
  );
  const lineCount = value ? value.split(/\r?\n/).length : 0;
  const showLongPromptControls = value.length > COMPOSER_LONG_PROMPT_CHARS || lineCount > COMPOSER_LONG_PROMPT_LINES || expanded;

  const toggleMenu = (menu: ComposerMenu) => {
    setActiveMenu((current) => {
      const next = current === menu ? null : menu;
      setModelSubmenuOpen(next === "model");
      return next;
    });
    setHistorySearchOpen(false);
    setMentionToken(null);
    setMentionSuggestions([]);
  };

  const closeComposerPopovers = () => {
    setActiveMenu(null);
    setModelSubmenuOpen(false);
    setHistorySearchOpen(false);
    setMentionToken(null);
    setMentionSuggestions([]);
  };

  const choosePermissionMode = (mode: PermissionMode) => {
    if (mode === "yolo" && settings.permissionMode !== "yolo") {
      setActiveMenu(null);
      setConfirmFullAccessOpen(true);
      return;
    }
    onSettings({ permissionMode: mode });
    setActiveMenu(null);
  };

  useEffect(() => {
    setPersistedPromptHistory(readPromptHistory());
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!composerRef.current?.contains(event.target as Node)) closeComposerPopovers();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeComposerPopovers();
        setConfirmFullAccessOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!draft) return;
    setValue(draft.text);
    setAttachments(draft.attachments || []);
    setContextMentions(draft.contextMentions || []);
    setPastedBlocks([]);
    setSubmitError(null);
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
    setHistorySearchOpen(false);
    setHistorySearchQuery("");
    setActiveMenu(null);
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

  const submit = async () => {
    const expandedValue = expandPastedBlocks(value, pastedBlocks);
    const trimmed = expandedValue.trim();
    if ((!trimmed && attachments.length === 0 && contextMentions.length === 0) || disabled || inputDisabledReason) return;
    if (trimmed.length > MAX_PROMPT_CHARS) {
      setSubmitError(`Prompt is ${trimmed.length.toLocaleString()} characters. Keep it under ${MAX_PROMPT_CHARS.toLocaleString()} characters.`);
      setExpanded(true);
      return;
    }
    if (attachments.length > 0 && !activeModel.supportsImageInput) {
      setSubmitError(`${activeModel.label} is text-only. Remove the images or switch to a vision model.`);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    const submittedAttachments = attachments;
    const submittedMentions = contextMentions;
    let accepted: void | boolean;
    try {
      accepted = await Promise.resolve(onSubmit(
        trimmed,
        submittedAttachments.length ? submittedAttachments : undefined,
        submittedMentions.length ? submittedMentions : undefined,
      ));
    } catch (error) {
      console.error(error);
      accepted = false;
    } finally {
      setSubmitting(false);
    }
    if (accepted === false) {
      setSubmitError("Privora could not start that turn. Your draft was kept.");
      return;
    }
    const nextHistory = rememberPrompt(trimmed, persistedPromptHistory);
    setPersistedPromptHistory(nextHistory);
    setValue("");
    setAttachments([]);
    setContextMentions([]);
    setPastedBlocks([]);
    setMentionToken(null);
    setMentionSuggestions([]);
    setAttachmentError(null);
    setSubmitError(null);
    setExpanded(false);
    setHistoryCursor(null);
    setHistorySearchOpen(false);
    setHistorySearchQuery("");
    lastHistoryTextRef.current = null;
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
    if (combinedPromptHistory.length === 0 || mentionToken || historySearchOpen) return false;
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
      const nextCursor = historyCursor === null ? combinedPromptHistory.length - 1 : Math.max(0, historyCursor - 1);
      applyHistoryValue(combinedPromptHistory[nextCursor] || "", nextCursor);
      return true;
    }
    if (historyCursor === null) return false;
    const nextCursor = historyCursor + 1;
    if (nextCursor >= combinedPromptHistory.length) {
      applyHistoryValue("", null);
      return true;
    }
    applyHistoryValue(combinedPromptHistory[nextCursor] || "", nextCursor);
    return true;
  };

  const chooseHistoryResult = (text: string) => {
    applyHistoryValue(text, null);
    setHistorySearchOpen(false);
    setHistorySearchQuery("");
  };

  const addLargePaste = (text: string, cursorStart: number, cursorEnd: number) => {
    const label = nextPasteLabel(text.length, pastedBlocks);
    const before = value.slice(0, cursorStart);
    const after = value.slice(cursorEnd);
    const nextValue = `${before}${after}`;
    const nextCursor = before.length;
    setValue(nextValue);
    setPastedBlocks((current) => [...current, { id: crypto.randomUUID(), label, text, createdAt: Date.now() }]);
    setSubmitError(null);
    setExpanded(true);
    setMentionToken(null);
    setMentionSuggestions([]);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  };

  const removePastedBlock = (block: PastedBlock) => {
    setPastedBlocks((current) => current.filter((item) => item.id !== block.id));
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
    if (!activeModel.supportsImageInput) {
      setAttachmentError(`${activeModel.label} is text-only. Switch to a vision model before adding images.`);
      return;
    }
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
      ref={composerRef}
      className={clsx("composer", dragging && "is-dragging", expanded && "is-expanded")}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
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
        disabled={disabled || Boolean(inputDisabledReason)}
        placeholder={inputDisabledReason || (disabled ? "Choose a workspace to start" : attachments.length ? "Ask about these images or add instructions" : settings.collaborationMode === "plan" ? "Ask Privora to research and draft a plan" : "Ask for follow-up changes")}
        onChange={(event) => {
          setValue(event.target.value);
          setSubmitError(null);
          detectMentionToken(event.target.value, event.currentTarget.selectionStart);
        }}
        onPaste={(event) => {
          const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
          if (imageFiles.length > 0) void addFiles(imageFiles);
          const text = event.clipboardData.getData("text/plain");
          if (text.length >= LARGE_PASTE_CHARS) {
            event.preventDefault();
            addLargePaste(text, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
          }
        }}
        onKeyDown={(event) => {
          if (event.ctrlKey && event.altKey && event.key.toLowerCase() === "h") {
            event.preventDefault();
            setHistorySearchOpen(true);
            setHistorySearchQuery("");
            setMentionToken(null);
            setMentionSuggestions([]);
            return;
          }
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
            void submit();
          }
        }}
      />
      {historySearchOpen && (
        <div className="prompt-history-search">
          <label>
            <Search size={14} />
            <input
              autoFocus
              value={historySearchQuery}
              placeholder="Search prompt history"
              onChange={(event) => setHistorySearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setHistorySearchOpen(false);
                }
                if (event.key === "Enter" && historySearchResults[0]) {
                  event.preventDefault();
                  chooseHistoryResult(historySearchResults[0]);
                }
              }}
            />
          </label>
          <div className="prompt-history-results">
            {historySearchResults.slice(0, 6).map((item) => (
              <button type="button" key={item} onClick={() => chooseHistoryResult(item)}>
                {item}
              </button>
            ))}
            {historySearchResults.length === 0 && <span>No matching prompts</span>}
          </div>
        </div>
      )}
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
      {pastedBlocks.length > 0 && (
        <div className="pasted-block-tray" aria-label="Large pasted content">
          {pastedBlocks.map((block) => (
            <div className="pasted-block-chip" key={block.id}>
              <FileText size={13} />
              <span>{block.label}</span>
              <small>{block.text.length.toLocaleString()} chars, expands on send</small>
              <button type="button" title="Remove pasted content" onClick={() => removePastedBlock(block)}>
                <X size={12} />
              </button>
            </div>
          ))}
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
      {(attachmentError || submitError) && <div className="attachment-error">{attachmentError || submitError}</div>}
      {attachments.length > 0 && !activeModel.supportsImageInput && (
        <div className="vision-model-warning" role="status">
          <ImageOff size={15} />
          <span>{activeModel.label} cannot read images.</span>
          {firstVisionModel && (
            <button
              type="button"
              onClick={() => {
                onSettings({ model: firstVisionModel.id });
                setAttachmentError(null);
                setSubmitError(null);
              }}
            >
              Switch to {modelDisplayLabel(firstVisionModel.label)}
            </button>
          )}
        </div>
      )}
      {confirmFullAccessOpen && createPortal(
        <div
          className="full-access-dialog-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmFullAccessOpen(false);
          }}
        >
          <div className="full-access-dialog" role="dialog" aria-modal="true" aria-labelledby="full-access-title">
            <button
              type="button"
              className="full-access-dialog-close"
              onClick={() => setConfirmFullAccessOpen(false)}
              title="Close"
              aria-label="Close"
            >
              <X size={22} />
            </button>
            <h2 id="full-access-title">Enable full access?</h2>
            <p>
              Full access lets Privora run commands, use the network, and edit files without asking before risky actions.
              This can move faster, but it also increases the chance of unintended changes or unsafe tool output.
            </p>
            <div className="full-access-dialog-actions">
              <button type="button" className="full-access-cancel" onClick={() => setConfirmFullAccessOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="full-access-confirm"
                onClick={() => {
                  onSettings({ permissionMode: "yolo" });
                  setConfirmFullAccessOpen(false);
                }}
              >
                <AlertTriangle size={18} />
                Turn on full access
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      <div className="composer-toolbar">
        <div className="toolbar-left">
          <div className="menu-anchor">
            <button
              type="button"
              className="icon-tool-button"
              title="Add tools"
              disabled={disabled || Boolean(inputDisabledReason) || running}
              onClick={() => toggleMenu("tools")}
            >
              <Plus size={21} />
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
            {activeMenu === "tools" && (
              <div className="floating-menu composer-tools-menu">
                <button
                  type="button"
                  className="composer-menu-row"
                  onClick={() => {
                    setActiveMenu(null);
                    fileInputRef.current?.click();
                  }}
                >
                  <span><Paperclip size={18} /> Add photos & files</span>
                </button>
                <button
                  type="button"
                  className="composer-menu-row"
                  onClick={() => {
                    onSettings({ collaborationMode: settings.collaborationMode === "plan" ? "default" : "plan" });
                  }}
                >
                  <span><ClipboardList size={18} /> Plan mode</span>
                  <ToggleSwitch checked={settings.collaborationMode === "plan"} />
                </button>
                <button
                  type="button"
                  className="composer-menu-row"
                  onClick={() => setPursueGoal((current) => !current)}
                >
                  <span><Crosshair size={18} /> Pursue goal</span>
                  <ToggleSwitch checked={pursueGoal} />
                </button>
                <div className="composer-menu-divider" />
                <button type="button" className="composer-menu-row" disabled title="Plugins are coming soon">
                  <span><Blocks size={18} /> Plugins</span>
                  <ChevronRight size={17} />
                </button>
              </div>
            )}
          </div>
          <div className="menu-anchor">
            <button
              type="button"
              className="tool-pill permission-pill"
              onClick={() => toggleMenu("access")}
            >
              {settings.permissionMode === "yolo" ? <Zap size={15} /> : <ShieldAlert size={15} />}
              {settings.permissionMode === "yolo" ? "Full access" : "Ask risky"}
              <ChevronDown size={13} />
            </button>
            {activeMenu === "access" && (
              <div className="floating-menu compact-menu">
                {permissionOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      choosePermissionMode(option.id);
                    }}
                  >
                    <span>{option.label}</span>
                    {settings.permissionMode === option.id && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          {settings.collaborationMode === "plan" && (
            <button
              type="button"
              className="composer-mode-status"
              title="Turn off Plan mode"
              aria-label="Turn off Plan mode"
              onClick={() => onSettings({ collaborationMode: "default" })}
            >
              <ClipboardList size={15} />
              <span>Plan</span>
              <X className="composer-mode-dismiss" size={13} />
            </button>
          )}
        </div>
        <div className="toolbar-right">
          <div className="menu-anchor">
            <button
              type="button"
              className="model-reasoning-button"
              title={`${activeModel.label} · ${reasoningLabel(settings.reasoningEffort)}`}
              onClick={() => toggleMenu("model")}
            >
              <span className="model-short">{modelDisplayLabel(activeModel.label)}</span>
              <span className="reasoning-short">{reasoningLabel(settings.reasoningEffort)}</span>
              <ChevronDown size={13} />
            </button>
            {activeMenu === "model" && (
              <>
              <div className="floating-menu model-reasoning-menu">
                <small>Reasoning</small>
                {reasoningOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onSettings({ reasoningEffort: option.id });
                      setActiveMenu(null);
                    }}
                  >
                    <span>{option.label}</span>
                    {settings.reasoningEffort === option.id && <Check size={14} />}
                  </button>
                ))}
                <div className="composer-menu-divider" />
                <button
                  type="button"
                  className={clsx("model-branch-row", modelSubmenuOpen && "active")}
                  onMouseEnter={() => setModelSubmenuOpen(true)}
                  onFocus={() => setModelSubmenuOpen(true)}
                  onClick={() => setModelSubmenuOpen((open) => !open)}
                >
                  <span>{activeModel.label}</span>
                  <ChevronRight size={17} />
                </button>
              </div>
              {modelSubmenuOpen && (
                <div
                  className="floating-menu model-picker-submenu"
                  onMouseEnter={() => setModelSubmenuOpen(true)}
                >
                  <small>Model</small>
                  {modelProviderGroups.map((group) => (
                    <div className="model-group" key={group.id}>
                      <small>{group.label}</small>
                      {group.models.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          title={model.supportsImageInput ? "Supports image input" : "Text input only"}
                          onClick={() => {
                            onSettings({ model: model.id });
                            setActiveMenu(null);
                          }}
                        >
                          <span>{model.label}</span>
                          <span className={clsx("model-capability", model.supportsImageInput ? "vision" : "text-only")}>
                            {model.supportsImageInput ? <Eye size={13} /> : <ImageOff size={13} />}
                          </span>
                          {activeModel.id === model.id && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              </>
            )}
          </div>
          <ContextMeter usage={contextUsage} modelContextWindow={activeModel.contextWindowTokens} attachedContextCount={contextMentions.length} />
          <button
            type="button"
            className={clsx("send-button", stopping && "is-stopping")}
            title={running ? (stopping ? "Stopping" : "Stop") : "Send"}
            onClick={running ? onStop : () => void submit()}
            disabled={running ? stopping : disabled || Boolean(inputDisabledReason) || submitting || (!value.trim() && attachments.length === 0 && contextMentions.length === 0)}
          >
            {running ? <Square size={17} fill="currentColor" /> : <ArrowUp size={19} />}
          </button>
        </div>
      </div>
    </form>
  );
}

function ToggleSwitch({ checked }: { checked: boolean }) {
  return <span className={clsx("composer-toggle", checked && "checked")} aria-hidden="true"><i /></span>;
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

const modelDisplayLabel = (label: string) =>
  label
    .replace(/\s*\(CLIProxy\)$/i, "")
    .trim();

const MAX_ATTACHMENTS = 15;
const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif"];
const COMPOSER_LONG_PROMPT_CHARS = 1200;
const COMPOSER_LONG_PROMPT_LINES = 12;
const LARGE_PASTE_CHARS = 4000;
const MAX_PROMPT_CHARS = 1_000_000;
const PROMPT_HISTORY_STORAGE_KEY = "privora.promptHistory.v1";
const MAX_PERSISTED_PROMPTS = 200;

const mergePromptHistory = (currentThread: string[], persisted: string[]) => {
  const seen = new Set<string>();
  return [...persisted.slice().reverse(), ...currentThread]
    .map((item) => item.trim())
    .reverse()
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    })
    .reverse();
};

const filterPromptHistory = (history: string[], query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return history.slice().reverse();
  return history.filter((item) => item.toLowerCase().includes(normalized)).reverse();
};

const readPromptHistory = () => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROMPT_HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, MAX_PERSISTED_PROMPTS) : [];
  } catch {
    return [];
  }
};

const rememberPrompt = (prompt: string, current: string[]) => {
  const trimmed = prompt.trim();
  if (!trimmed) return current;
  const next = [trimmed, ...current.filter((item) => item.trim() !== trimmed)].slice(0, MAX_PERSISTED_PROMPTS);
  try {
    window.localStorage.setItem(PROMPT_HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // History is a convenience cache; failing to persist it must not block sending.
  }
  return next;
};

const nextPasteLabel = (charCount: number, existing: PastedBlock[]) => {
  const base = `[Pasted Content ${charCount.toLocaleString()} chars]`;
  if (!existing.some((block) => block.label === base)) return base;
  let index = 2;
  while (existing.some((block) => block.label === `${base} #${index}`)) index += 1;
  return `${base} #${index}`;
};

const expandPastedBlocks = (value: string, blocks: PastedBlock[]) =>
  [
    ...blocks.map((block) => block.text),
    value,
  ].filter((part) => part.trim()).join("\n\n");

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
