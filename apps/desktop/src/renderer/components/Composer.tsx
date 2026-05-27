import { Brain, BrainCircuit, Check, ChevronDown, ImagePlus, Send, ShieldAlert, Square, TerminalSquare, X, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getModelOption, getModelProviderGroups, type PermissionMode, type ReasoningEffort } from "../../shared/models";
import type { DesktopAttachmentRecord, SettingsRecord } from "../../shared/types";

interface ComposerProps {
  settings: SettingsRecord;
  disabled: boolean;
  running: boolean;
  draft?: { id: number; text: string; attachments?: DesktopAttachmentRecord[] } | null;
  onSubmit: (value: string, attachments?: DesktopAttachmentRecord[]) => void;
  onStop: () => void;
  onSettings: (settings: Partial<SettingsRecord>) => void;
  onDraftConsumed?: () => void;
}

export function Composer({ settings, disabled, running, draft, onSubmit, onStop, onSettings, onDraftConsumed }: ComposerProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<DesktopAttachmentRecord[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [reasoningMenuOpen, setReasoningMenuOpen] = useState(false);
  const [accessMenuOpen, setAccessMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeModel = getModelOption(settings.model);
  const modelProviderGroups = getModelProviderGroups();

  useEffect(() => {
    if (!draft) return;
    setValue(draft.text);
    setAttachments(draft.attachments || []);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(draft.text.length, draft.text.length);
    }, 0);
    onDraftConsumed?.();
  }, [draft, onDraftConsumed]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(180, Math.max(52, el.scrollHeight))}px`;
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || disabled || running) return;
    setValue("");
    const submittedAttachments = attachments;
    setAttachments([]);
    setAttachmentError(null);
    onSubmit(trimmed, submittedAttachments.length ? submittedAttachments : undefined);
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
      className={dragging ? "composer is-dragging" : "composer"}
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
        onChange={(event) => setValue(event.target.value)}
        onPaste={(event) => {
          const imageFiles = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
          if (imageFiles.length > 0) void addFiles(imageFiles);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
      />
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
          <button type="button" className="send-button" onClick={running ? onStop : submit} disabled={(disabled || (!value.trim() && attachments.length === 0)) && !running}>
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
