import { Code2, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import {
  GEMINI_MAX_INLINE_PAYLOAD_BYTES,
  MAX_ATTACHMENTS,
  getAttachmentTotalSize,
  isCliproxySupportedAttachment,
  isGeminiSupportedAttachment,
  readFileAsAttachment,
  revokeAttachmentUrl,
  validateCliproxyAttachments,
  validateGeminiAttachments,
  validateOpenRouterAttachments,
  type Attachment,
} from "../../../lib/attachments";
import type { WebDevFileRecord, WebDevMessageRecord, WebDevProjectRecord, WebDevThreadRecord } from "../../../lib/db";
import { getModelOption } from "../../../lib/models";
import { appLogger } from "../../../lib/logger";
import { useToast } from "../../ui/ToastProvider";
import { useTextareaAutosize } from "../../../hooks/useTextareaAutosize";
import { useWebDevGeneration } from "../hooks/useWebDevGeneration";
import { loadWebDevFiles, loadWebDevMessages, settleStreamingWebDevFiles, updateWebDevProject, upsertWebDevFile } from "../lib/storage";
import { deleteWebDevPath, renameWebDevPath } from "../lib/storage";
import { canonicalizeWebDevPath } from "../lib/files";
import { WebDevChatPanel } from "./WebDevChatPanel";
import { WebDevIdePanel } from "./WebDevIdePanel";
import type { WebDevFileDiff } from "../lib/types";

type FileActionDialog =
  | { type: "create-file"; title: string; value: string }
  | { type: "create-folder"; title: string; value: string }
  | { type: "rename"; title: string; path: string; value: string }
  | { type: "delete"; title: string; path: string };

export function WebDevWorkspace({
  projects,
  threads,
  currentProjectId,
  currentThreadId,
  isDarkMode,
  selectedModel,
  isThinkingEnabled,
  webDevPanelWidth,
  setProjects,
  setCurrentProjectId,
  onNewProject,
  onSelectModel,
  onToggleThinking,
  onPanelWidthChange,
  onPreviewAttachment,
}: {
  projects: WebDevProjectRecord[];
  threads: WebDevThreadRecord[];
  currentProjectId: string | null;
  currentThreadId: string | null;
  isDarkMode: boolean;
  selectedModel: string;
  isThinkingEnabled: boolean;
  webDevPanelWidth: number;
  setProjects: Dispatch<SetStateAction<WebDevProjectRecord[]>>;
  setCurrentProjectId: (projectId: string | null) => void;
  onNewProject: () => Promise<void>;
  onSelectModel: (modelId: string) => void;
  onToggleThinking: () => void;
  onPanelWidthChange: (width: number) => void;
  onPreviewAttachment: (attachment: Attachment) => void;
}) {
  const { notify } = useToast();
  const [files, setFiles] = useState<WebDevFileRecord[]>([]);
  const [messages, setMessages] = useState<WebDevMessageRecord[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isIdeOpen, setIsIdeOpen] = useState(true);
  const [activeDiff, setActiveDiff] = useState<WebDevFileDiff | null>(null);
  const [patchPreviewDiff, setPatchPreviewDiff] = useState<WebDevFileDiff | null>(null);
  const [fileActionDialog, setFileActionDialog] = useState<FileActionDialog | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const project = useMemo(() => projects.find(item => item.id === currentProjectId), [currentProjectId, projects]);
  const thread = useMemo(() => threads.find(item => item.id === currentThreadId), [currentThreadId, threads]);
  const activeThreadId = thread?.projectId === currentProjectId ? thread.id : null;
  const activeFilePath = project?.activeFilePath || files.find(file => file.path === "src/App.tsx")?.path || files[0]?.path;
  useTextareaAutosize(textareaRef, input);

  useEffect(() => {
    setActiveDiff(null);
    setPatchPreviewDiff(null);
    setFiles([]);
    setMessages([]);
    if (!currentProjectId || !activeThreadId) {
      return;
    }
    let cancelled = false;
    Promise.all([
      project?.status === "generating" ? Promise.resolve([]) : settleStreamingWebDevFiles(currentProjectId),
      loadWebDevFiles(currentProjectId),
      loadWebDevMessages(currentProjectId, activeThreadId),
    ]).then(([, nextFiles, nextMessages]) => {
      if (cancelled) return;
      setFiles(nextFiles);
      setMessages(nextMessages);
    });
    return () => {
      cancelled = true;
    };
  }, [currentProjectId, activeThreadId, project?.status]);

  const { sendWebDevMessage, stopWebDevGeneration } = useWebDevGeneration({
    project,
    threadId: activeThreadId || undefined,
    files,
    messages,
    selectedModel,
    isThinkingEnabled,
    setProjects,
    setFiles,
    setMessages,
    setIsGenerating,
    onPatchPreviewChange: (diff) => {
      setPatchPreviewDiff(prev => {
        if (!diff) return null;
        if (
          prev?.path === diff.path &&
          prev.beforeContent === diff.beforeContent &&
          prev.afterContent === diff.afterContent &&
          prev.status === diff.status
        ) {
          return prev;
        }
        return diff;
      });
      if (diff) setIsIdeOpen(true);
    },
  });

  const addAttachmentFiles = async (fileList: FileList | File[], source: "select" | "paste" | "screenshot") => {
    const selectedFiles = Array.from(fileList);
    if (selectedFiles.length === 0) return 0;

    if (attachments.length + selectedFiles.length > MAX_ATTACHMENTS) {
      notify({ title: "Too many attachments", description: `You can attach up to ${MAX_ATTACHMENTS} files at once.`, variant: "error" });
      return 0;
    }

    const provider = getModelOption(selectedModel)?.provider;
    const nextAttachments: Attachment[] = [];
    const skipped: string[] = [];

    for (const file of selectedFiles) {
      if (provider === "openrouter") {
        skipped.push(`OpenRouter is text-only here. "${file.name}" was skipped.`);
        continue;
      }
      if (provider === "cliproxy" && !isCliproxySupportedAttachment({ mimeType: file.type, name: file.name })) {
        skipped.push(`GPT file input does not support "${file.name}" here.`);
        continue;
      }
      if ((provider === "gemini" || !provider) && !isGeminiSupportedAttachment({ mimeType: file.type, name: file.name })) {
        skipped.push(`Gemini does not support "${file.name}" here.`);
        continue;
      }
      if ((provider === "gemini" || !provider) && getAttachmentTotalSize([...attachments, ...nextAttachments]) + file.size > GEMINI_MAX_INLINE_PAYLOAD_BYTES) {
        skipped.push(`"${file.name}" would exceed Gemini's 20 MB inline limit.`);
        continue;
      }
      try {
        nextAttachments.push(await readFileAsAttachment(file));
      } catch (error) {
        appLogger.error("Failed to read Web Dev attachment", { err: error, source, fileName: file.name });
        skipped.push(`Could not read "${file.name}".`);
      }
    }

    const validationError = provider === "cliproxy"
      ? validateCliproxyAttachments([...attachments, ...nextAttachments])
      : provider === "openrouter"
        ? validateOpenRouterAttachments([...attachments, ...nextAttachments])
        : validateGeminiAttachments([...attachments, ...nextAttachments]);

    if (validationError) {
      nextAttachments.forEach(revokeAttachmentUrl);
      notify({ title: "Attachment problem", description: validationError, variant: "error" });
      return 0;
    }

    if (skipped.length > 0) {
      notify({ title: "File skipped", description: skipped[0], variant: "error", durationMs: 7000 });
    }
    if (nextAttachments.length > 0) {
      setAttachments(prev => [...prev, ...nextAttachments]);
    }
    return nextAttachments.length;
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) await addAttachmentFiles(event.target.files, "select");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length === 0) return;
    event.preventDefault();
    await addAttachmentFiles(files, "paste");
  };

  const handleTakeScreenshot = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      notify({ title: "Screen capture unavailable", description: "Pick a screenshot file instead.", variant: "info" });
      fileInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 } as MediaTrackConstraints, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("screen-capture-video-failed"));
      });
      await video.play();
      await new Promise(resolve => requestAnimationFrame(resolve));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
      stream.getTracks().forEach(track => track.stop());
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("screen-capture-encode-failed")), "image/png"));
      const file = new File([blob], `privora-webdev-screenshot-${Date.now()}.png`, { type: "image/png" });
      await addAttachmentFiles([file], "screenshot");
    } catch (error: any) {
      if (error?.name === "NotAllowedError" || error?.name === "AbortError") return;
      appLogger.error("Web Dev screen capture failed", { err: error });
      notify({ title: "Screen capture failed", description: "Pick a screenshot file instead.", variant: "error" });
      fileInputRef.current?.click();
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) revokeAttachmentUrl(removed);
      return next;
    });
  };

  const handleSubmit = () => {
    const value = input.trim();
    if ((!value && attachments.length === 0) || !project || !activeThreadId) return;
    const pendingAttachments = attachments;
    setInput("");
    setAttachments([]);
    setActiveDiff(null);
    setPatchPreviewDiff(null);
    void sendWebDevMessage(value, pendingAttachments);
    setIsIdeOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    if (window.innerWidth < 768) return;
    event.preventDefault();
    handleSubmit();
  };

  const handleSelectFile = (path: string) => {
    if (!project) return;
    setProjects(prev => prev.map(item => item.id === project.id ? { ...item, activeFilePath: path, updatedAt: Date.now() } : item));
    void updateWebDevProject(project.id, { activeFilePath: path });
    setActiveDiff(null);
    setPatchPreviewDiff(null);
  };

  const handleSelectActivityFile = (path: string) => {
    setIsIdeOpen(true);
    handleSelectFile(path);
  };

  const handleOpenActivityDiff = (diff: WebDevFileDiff) => {
    if (!project) return;
    setIsIdeOpen(true);
    setActiveDiff(diff);
    setProjects(prev => prev.map(item => item.id === project.id ? { ...item, activeFilePath: diff.path, updatedAt: Date.now() } : item));
    void updateWebDevProject(project.id, { activeFilePath: diff.path });
  };

  const handleFileChange = async (path: string, content: string) => {
    if (!project || isGenerating) return;
    const file = await upsertWebDevFile(project.id, { path, content, status: "ready", summary: "Manual edit" });
    setFiles(prev => prev.map(item => item.id === file.id ? file : item));
  };

  const createFile = (basePath = "") => {
    if (!project || isGenerating) return;
    setFileActionDialog({ type: "create-file", title: "New file", value: basePath ? `${basePath}/NewFile.tsx` : "src/NewFile.tsx" });
  };

  const createFolder = (basePath = "") => {
    if (!project || isGenerating) return;
    setFileActionDialog({ type: "create-folder", title: "New folder", value: basePath ? `${basePath}/new-folder` : "src/new-folder" });
  };

  const renamePath = (path: string) => {
    if (!project || isGenerating) return;
    setFileActionDialog({ type: "rename", title: "Rename path", path, value: path });
  };

  const deletePath = (path: string) => {
    if (!project || isGenerating) return;
    setFileActionDialog({ type: "delete", title: "Delete path", path });
  };

  const submitFileAction = async () => {
    if (!project || !fileActionDialog) return;

    if (fileActionDialog.type === "delete") {
      const deleted = await deleteWebDevPath(project.id, fileActionDialog.path);
      setFiles(prev => prev.filter(file => !deleted.some(target => target.id === file.id)));
      setFileActionDialog(null);
      return;
    }

    const path = canonicalizeWebDevPath(fileActionDialog.value);
    if (!path) {
      notify({ title: "Unsafe path", description: "Use a normal project-relative path without dot segments, drive letters, reserved names, or special characters.", variant: "error" });
      return;
    }

    if (fileActionDialog.type === "create-file") {
      const file = await upsertWebDevFile(project.id, { path, content: "", status: "created", summary: "Manual file" });
      setFiles(prev => [...prev.filter(item => item.id !== file.id), file].sort((a, b) => a.path.localeCompare(b.path)));
      handleSelectFile(path);
      setFileActionDialog(null);
      return;
    }

    if (fileActionDialog.type === "create-folder") {
      const markerPath = `${path}/privora-folder`;
      const file = await upsertWebDevFile(project.id, { path: markerPath, content: "", status: "created", summary: "Manual folder" });
      setFiles(prev => [...prev.filter(item => item.id !== file.id), file].sort((a, b) => a.path.localeCompare(b.path)));
      handleSelectFile(markerPath);
      setFileActionDialog(null);
      return;
    }

    if (fileActionDialog.type === "rename") {
      if (path === fileActionDialog.path) {
        setFileActionDialog(null);
        return;
      }
      const renamed = await renameWebDevPath(project.id, fileActionDialog.path, path);
      setFiles(prev => [
        ...prev.filter(file => file.path !== fileActionDialog.path && !file.path.startsWith(`${fileActionDialog.path}/`)),
        ...renamed,
      ].sort((a, b) => a.path.localeCompare(b.path)));
      setFileActionDialog(null);
    }
  };

  if (!project) {
    return (
      <main className="grid h-full flex-1 place-items-center px-4">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--privora-border)] bg-[var(--privora-surface)] text-[var(--privora-text)] shadow-sm">
            <Code2 className="h-5 w-5" />
          </div>
          <h1 className="font-display text-3xl font-medium text-[var(--privora-text)]">Web Dev</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--privora-muted)]">
            Create a local React/Vite workspace with live code editing and preview.
          </p>
          <button
            type="button"
            onClick={() => void onNewProject()}
            className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-[var(--privora-accent)] px-4 text-sm font-semibold text-[var(--privora-accent-fg)] shadow-sm transition hover:bg-[var(--privora-accent-hover)]"
          >
            <Plus className="h-4 w-4" /> New web app
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden bg-[var(--privora-bg)]">
      <WebDevChatPanel
        messages={messages}
        threadTitle={thread?.title}
        input={input}
        isGenerating={isGenerating}
        selectedModel={selectedModel}
        isThinkingEnabled={isThinkingEnabled}
        attachments={attachments}
        textareaRef={textareaRef}
        fileInputRef={fileInputRef}
        onInputChange={setInput}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        onSelectModel={onSelectModel}
        onToggleThinking={onToggleThinking}
        onStop={stopWebDevGeneration}
        onOpenIde={isIdeOpen ? undefined : () => setIsIdeOpen(true)}
        onSelectFile={handleSelectActivityFile}
        onOpenFileDiff={handleOpenActivityDiff}
        onPaste={handlePaste}
        onFileSelect={handleFileSelect}
        onTakeScreenshot={handleTakeScreenshot}
        onPreviewAttachment={onPreviewAttachment}
        onRemoveAttachment={removeAttachment}
      />
      {isIdeOpen && (
        <WebDevIdePanel
          project={project}
          files={files}
          activeFilePath={activeFilePath}
          activeDiff={patchPreviewDiff || activeDiff}
          isDarkMode={isDarkMode}
          isGenerating={isGenerating}
          width={webDevPanelWidth}
          onWidthChange={onPanelWidthChange}
          onClose={() => setIsIdeOpen(false)}
          onSelectFile={handleSelectFile}
          onCloseDiff={() => {
            setPatchPreviewDiff(null);
            setActiveDiff(null);
          }}
          onFileChange={handleFileChange}
          onCreateFile={createFile}
          onCreateFolder={createFolder}
          onRenamePath={renamePath}
          onDeletePath={deletePath}
        />
      )}
      <AnimatePresence>
        {fileActionDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm"
              onClick={() => setFileActionDialog(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -10 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              className="fixed inset-x-0 top-[22vh] z-[101] mx-auto w-full max-w-md px-4"
            >
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitFileAction();
                }}
                onClick={(event) => event.stopPropagation()}
                className="overflow-hidden rounded-2xl border border-[var(--privora-border)] bg-[var(--privora-surface)] shadow-2xl"
              >
                <div className="border-b border-[var(--privora-border)] px-5 py-4">
                  <h2 className="text-[15px] font-semibold text-[var(--privora-text)]">{fileActionDialog.title}</h2>
                  {"path" in fileActionDialog && (
                    <p className="mt-1 truncate text-xs text-[var(--privora-muted)]">{fileActionDialog.path}</p>
                  )}
                </div>
                <div className="space-y-4 px-5 py-5">
                  {fileActionDialog.type === "delete" ? (
                    <p className="text-sm leading-6 text-[var(--privora-text)]">
                      Delete this {files.some(file => file.path.startsWith(`${fileActionDialog.path}/`)) ? "folder and its files" : "file"} from the Web Dev project?
                    </p>
                  ) : (
                    <input
                      autoFocus
                      value={fileActionDialog.value}
                      onChange={(event) => setFileActionDialog(prev => prev && prev.type !== "delete" ? { ...prev, value: event.target.value } : prev)}
                      className="w-full rounded-xl border border-[var(--privora-border)] bg-[var(--privora-bg)] px-4 py-3 text-[15px] text-[var(--privora-text)] outline-none transition focus:border-[var(--privora-text)]/30 focus:bg-[var(--privora-surface)]"
                    />
                  )}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setFileActionDialog(null)} className="rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]">
                      Cancel
                    </button>
                    <button type="submit" className="rounded-xl bg-[var(--privora-text)] px-4 py-2.5 text-sm font-medium text-[var(--privora-bg)] hover:opacity-90">
                      {fileActionDialog.type === "delete" ? "Delete" : "Save"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
