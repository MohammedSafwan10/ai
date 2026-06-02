// @refresh reset
import { setupConnect } from "@webcontainer/api/connect";
import { useCallback, useState, useRef, useEffect, useMemo, type ChangeEvent, type ClipboardEvent, type CSSProperties } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { PanelLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AttachmentPreviewModal } from "./features/attachments/components/AttachmentPreviewModal";
import { ChatComposer } from "./features/chat/components/ChatComposer";
import { ResearchActivityPanel } from "./features/chat/components/ResearchActivityPanel";
import { CanvasPanel } from "./features/artifacts/components/CanvasPanel";
import { ChatCodePlaygroundPanel, type CodePlaygroundPayload } from "./features/code-playground/components/ChatCodePlaygroundPanel";
import { ChatSidebar } from "./features/chat/components/ChatSidebar";
import { ChatViewport } from "./features/chat/components/ChatViewport";
import { RenameChatModal } from "./features/chat/components/RenameChatModal";
import { SearchModal } from "./features/chat/components/SearchModal";
import { WebDevWorkspace } from "./features/webdev/components/WebDevWorkspace";
import { CharacterWorkspace } from "./features/characters/components/CharacterWorkspace";
import { CommandCenterWorkspace } from "./features/command-center/components/CommandCenterWorkspace";
import { getModelOption, normalizeModelId } from "./lib/models";
import { appLogger } from "./lib/logger";
import { useChatStorage } from "./features/chat/hooks/useChatStorage";
import { useLatestRef } from "./hooks/useLatestRef";
import { useRootDarkMode } from "./hooks/useRootDarkMode";
import { useTextareaAutosize } from "./hooks/useTextareaAutosize";
import { useViewportCssVars } from "./hooks/useViewportCssVars";
import { useChatGeneration } from "./features/chat/hooks/useChatGeneration";
import { useToast } from "./features/ui/ToastProvider";
import {
  GEMINI_MAX_INLINE_PAYLOAD_BYTES,
  MAX_ATTACHMENTS,
  getAttachmentExtension,
  getAttachmentTotalSize,
  isCliproxySupportedAttachment,
  isGeminiSupportedAttachment,
  readFileAsAttachment,
  revokeAttachmentUrl,
  validateCliproxyAttachments,
  validateGeminiAttachments,
  validateOpenRouterAttachments,
  type Attachment,
} from "./lib/attachments";
import { DEFAULT_MODEL_ID, loadUiSettings, saveUiSettings, type ClashSettings, type DebateSettings, type ImageSettings } from "./lib/settings";
import type { ResponseStyleId } from "./lib/prompt";
import {
  createChat,
  createId,
  deleteChatFromDb,
  loadArtifactsForChat,
  replaceChatMessages,
  updateChatMeta,
  type ArtifactRecord,
  type CharacterRecord,
  type CharacterSessionRecord,
  type ChatMessageRecord,
  type ChatRecord,
  type CommandAgentAction,
  type WebDevProjectRecord,
  type WebDevThreadRecord,
} from "./lib/db";
import { copyArtifactContent, downloadArtifactContent } from "./lib/artifacts";
import { createWebDevProject, createWebDevThread, deleteWebDevProject, deleteWebDevThread, ensureDefaultWebDevThread, loadWebDevProjects, loadWebDevThreads, updateWebDevProject } from "./features/webdev/lib/storage";
import { deleteCharacterSession, loadCharacterSessions, loadCharacters } from "./features/characters/lib/storage";
import type { CommandSection } from "./features/command-center/lib/storage";
import { redoCommandSession, undoCommandActivity, undoCommandSession, updateCommandActivity, updateCommandSession } from "./features/command-center/lib/storage";
import {
  executeCommandToolCall,
  getCommandCancelledMessage,
  getCommandPendingConfirmationMessage,
  type CommandToolCall,
} from "./features/command-center/lib/agentTools";
import {
  appendCommandAssistantToolCalls,
  appendCommandToolResults,
  CommandProviderIdleTimeoutError,
  streamCommandAgentResponse,
  withCommandNativeToolCallId,
  type CommandFunctionResponse,
  type CommandProviderMessage,
} from "./features/command-center/lib/provider";
import { commandInternalToNativeName, commandNativeToInternalCall, type CommandNativeToolCall } from "./features/command-center/lib/nativeTools";
import type { ProviderId } from "./lib/models";

type Message = ChatMessageRecord;
type Chat = ChatRecord;
type WorkspaceMode = "chat" | "web-dev" | "characters" | "command-center";
type AppRouteState =
  | { mode: "chat"; chatId: string | null }
  | { mode: "web-dev"; projectId: string | null; threadId: string | null }
  | { mode: "characters"; sessionId: string | null; view: "home" | "library" }
  | { mode: "command-center"; section: CommandSection; itemId: string | null };

const CHAT_BOTTOM_THRESHOLD_PX = 128;
const COMMAND_AGENT_MAX_RESUME_ITERATIONS = 8;
const COMMAND_AGENT_MAX_TOOL_CALLS = 24;
const isWebContainerConnectRoute =
  typeof window !== "undefined" && window.location.pathname.startsWith("/webcontainer/connect/");

const parseAppRoute = (pathname: string, fallbackMode: WorkspaceMode): AppRouteState => {
  const parts = pathname.split("/").filter(Boolean);
  const [modeSegment, idSegment] = parts;

  if (modeSegment === "web-dev") {
    const threadId = parts[2] === "thread" ? parts[3] || null : null;
    return { mode: "web-dev", projectId: idSegment || null, threadId };
  }

  if (modeSegment === "characters") {
    if (idSegment === "library") return { mode: "characters", sessionId: null, view: "library" };
    return { mode: "characters", sessionId: idSegment || null, view: "home" };
  }

  if (modeSegment === "command-center") {
    const section = idSegment === "schedule" || idSegment === "notes" || idSegment === "finance" || idSegment === "activity" ? idSegment : "tasks";
    return { mode: "command-center", section, itemId: parts[2] || null };
  }

  if (modeSegment === "chat") {
    return { mode: "chat", chatId: idSegment || null };
  }

  if (fallbackMode === "web-dev") return { mode: "web-dev", projectId: null, threadId: null };
  if (fallbackMode === "characters") return { mode: "characters", sessionId: null, view: "home" };
  if (fallbackMode === "command-center") return { mode: "command-center", section: "tasks", itemId: null };
  return { mode: "chat", chatId: null };
};

const getScreenCaptureFile = async () => {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("screen-capture-unsupported");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: "browser",
      frameRate: 1,
    } as MediaTrackConstraints,
    audio: false,
  });

  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("screen-capture-video-failed"));
    });

    await video.play();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      throw new Error("screen-capture-empty");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("screen-capture-canvas-failed");
    }

    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) resolve(nextBlob);
        else reject(new Error("screen-capture-encode-failed"));
      }, "image/png");
    });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new File([blob], `privora-screenshot-${timestamp}.png`, { type: "image/png" });
  } finally {
    stream.getTracks().forEach(track => track.stop());
  }
};

export default function App() {
  useEffect(() => {
    if (!isWebContainerConnectRoute) return;
    try {
      setupConnect({ editorOrigin: window.location.origin });
    } catch (error) {
      appLogger.error("Failed to setup WebContainer preview connection", { err: error });
    }
  }, []);

  if (isWebContainerConnectRoute) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--privora-bg)] px-6 text-center text-sm text-[var(--privora-muted)]">
        Connecting preview...
      </div>
    );
  }

  const { notify } = useToast();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: state => state.location.pathname });
  const initialUiSettingsRef = useRef(loadUiSettings());
  const routeState = useMemo(
    () => parseAppRoute(pathname, initialUiSettingsRef.current.workspaceMode),
    [pathname]
  );
  const workspaceMode = routeState.mode;
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [webDevProjects, setWebDevProjects] = useState<WebDevProjectRecord[]>([]);
  const [webDevThreads, setWebDevThreads] = useState<WebDevThreadRecord[]>([]);
  const [currentWebDevProjectId, setCurrentWebDevProjectId] = useState<string | null>(null);
  const [currentWebDevThreadId, setCurrentWebDevThreadId] = useState<string | null>(null);
  const [isWebDevStorageReady, setIsWebDevStorageReady] = useState(false);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [characterSessions, setCharacterSessions] = useState<CharacterSessionRecord[]>([]);
  const [currentCharacterSessionId, setCurrentCharacterSessionId] = useState<string | null>(null);
  const [isCharactersStorageReady, setIsCharactersStorageReady] = useState(false);
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(600);
  const [isChatPlaygroundOpen, setIsChatPlaygroundOpen] = useState(false);
  const [chatPlaygroundWidth, setChatPlaygroundWidth] = useState(560);
  const [chatPlaygroundPayload, setChatPlaygroundPayload] = useState<CodePlaygroundPayload>({ version: 0 });
  const [webDevPanelWidth, setWebDevPanelWidth] = useState(720);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(initialUiSettingsRef.current.isDarkMode);
  const [selectedModel, setSelectedModel] = useState(initialUiSettingsRef.current.selectedModel);
  const [selectedStyle, setSelectedStyle] = useState<ResponseStyleId>(initialUiSettingsRef.current.selectedStyle);
  const [isThinkingEnabled, setIsThinkingEnabled] = useState(initialUiSettingsRef.current.isThinkingEnabled);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(initialUiSettingsRef.current.isWebSearchEnabled);
  const [isDeepResearchEnabled, setIsDeepResearchEnabled] = useState(initialUiSettingsRef.current.isDeepResearchEnabled);
  const [isDebateModeEnabled, setIsDebateModeEnabled] = useState(initialUiSettingsRef.current.isDebateModeEnabled);
  const [isClashModeEnabled, setIsClashModeEnabled] = useState(initialUiSettingsRef.current.isClashModeEnabled);
  const [isAgentModeEnabled, setIsAgentModeEnabled] = useState(initialUiSettingsRef.current.isAgentModeEnabled);
  const [composerMode, setComposerMode] = useState<"chat" | "image">(initialUiSettingsRef.current.composerMode);
  const [debateSettings, setDebateSettings] = useState<DebateSettings>(initialUiSettingsRef.current.debateSettings);
  const [clashSettings, setClashSettings] = useState<ClashSettings>(initialUiSettingsRef.current.clashSettings);
  const [imageSettings, setImageSettings] = useState<ImageSettings>(initialUiSettingsRef.current.imageSettings);
  const [isResearchActivityOpen, setIsResearchActivityOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [renameTarget, setRenameTarget] = useState<{ kind: "chat" | "web-dev"; id: string } | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showScrollToLatest, setShowScrollToLatest] = useState(false);
  const chatScrollRef = useRef<HTMLElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const isScrollingToLatestRef = useRef(false);
  const previousWorkspaceModeRef = useRef<WorkspaceMode>(workspaceMode);
  const shouldScrollOnChatEntryRef = useRef(false);
  const chatsRef = useLatestRef(chats);
  const messagesRef = useLatestRef(messages);
  const currentChatIdRef = useLatestRef(currentChatId);
  const isTypingRef = useLatestRef(isTyping);
  const selectedModelRef = useLatestRef(selectedModel);
  const selectedStyleRef = useLatestRef(selectedStyle);
  const isThinkingEnabledRef = useLatestRef(isThinkingEnabled);
  const isWebSearchEnabledRef = useLatestRef(isWebSearchEnabled);
  const isDeepResearchEnabledRef = useLatestRef(isDeepResearchEnabled);
  const isDebateModeEnabledRef = useLatestRef(isDebateModeEnabled);
  const isClashModeEnabledRef = useLatestRef(isClashModeEnabled);
  const isAgentModeEnabledRef = useLatestRef(isAgentModeEnabled);
  const debateSettingsRef = useLatestRef(debateSettings);
  const clashSettingsRef = useLatestRef(clashSettings);
  const imageSettingsRef = useLatestRef(imageSettings);

  useEffect(() => {
    if (!renameTarget) return;

    window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  }, [renameTarget]);

  useEffect(() => {
    const normalizedModel = normalizeModelId(selectedModel) || DEFAULT_MODEL_ID;
    if (normalizedModel === selectedModel && getModelOption(selectedModel)) return;
    selectedModelRef.current = normalizedModel;
    setSelectedModel(normalizedModel);
  }, [selectedModel, selectedModelRef]);

  useEffect(() => {
    saveUiSettings({
      workspaceMode,
      selectedModel,
      selectedStyle,
      isThinkingEnabled,
      isWebSearchEnabled,
      isDeepResearchEnabled,
      isDebateModeEnabled,
      isClashModeEnabled,
      isAgentModeEnabled,
      isDarkMode,
      composerMode,
      debateSettings,
      clashSettings,
      imageSettings,
    });
  }, [workspaceMode, selectedModel, selectedStyle, isThinkingEnabled, isWebSearchEnabled, isDeepResearchEnabled, isDebateModeEnabled, isClashModeEnabled, isAgentModeEnabled, isDarkMode, composerMode, debateSettings, clashSettings, imageSettings]);

  const addAttachmentFiles = async (fileList: FileList | File[], source: "select" | "paste" | "screenshot") => {
    const files = Array.from(fileList);
    if (files.length === 0) return 0;

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      appLogger.warn("Attachment add exceeded count limit", {
        source,
        existingCount: attachments.length,
        selectedCount: files.length,
        maxAttachments: MAX_ATTACHMENTS,
      });
      notify({
        title: "Too many attachments",
        description: `You can attach up to ${MAX_ATTACHMENTS} files at once.`,
        variant: "error",
      });
      return 0;
    }

    const isImageAttachmentMode = composerMode === "image";
    const selectedProvider = isImageAttachmentMode ? "image" : getModelOption(selectedModelRef.current)?.provider;
    const newAttachments: Attachment[] = [];
    const attachmentIssues: string[] = [];
    const noteAttachmentIssue = (message: string) => {
      attachmentIssues.push(message);
    };

    for (const file of files) {
       if (isImageAttachmentMode && !file.type.startsWith("image/")) {
          appLogger.warn("Non-image attachment rejected in image mode", {
            mimeType: file.type || "unknown",
            extension: getAttachmentExtension(file.name),
            size: file.size,
          });
          noteAttachmentIssue(`Image mode only accepts images. "${file.name}" was skipped.`);
          continue;
       }

       if (selectedProvider === "openrouter") {
          appLogger.warn("OpenRouter attachment rejected", {
            mimeType: file.type || "unknown",
            extension: getAttachmentExtension(file.name),
            size: file.size,
          });
          noteAttachmentIssue(`OpenRouter free models are text-only here. Remove "${file.name}" or switch to Gemini/GPT for files and vision.`);
          continue;
       }

       if (selectedProvider === "cliproxy" && !isCliproxySupportedAttachment({ mimeType: file.type, name: file.name })) {
          appLogger.warn("Unsupported CLIProxy attachment rejected", {
            mimeType: file.type || "unknown",
            extension: getAttachmentExtension(file.name),
            size: file.size,
          });
          noteAttachmentIssue(`GPT-5.5 supports images plus common PDF/text/code/Office files here. "${file.name}" is not supported.`);
          continue;
       }

       if (selectedProvider === "gemini" && !isGeminiSupportedAttachment({ mimeType: file.type, name: file.name })) {
          appLogger.warn("Unsupported Gemini attachment rejected", {
            mimeType: file.type || "unknown",
            extension: getAttachmentExtension(file.name),
            size: file.size,
          });
          noteAttachmentIssue(`Gemini supports images, PDFs, and common text/code files here. "${file.name}" is not supported.`);
          continue;
       }

       if (selectedProvider === "gemini" && getAttachmentTotalSize([...attachments, ...newAttachments]) + file.size > GEMINI_MAX_INLINE_PAYLOAD_BYTES) {
          appLogger.warn("Gemini attachment payload limit exceeded", {
            attemptedSize: getAttachmentTotalSize([...attachments, ...newAttachments]) + file.size,
            maxSize: GEMINI_MAX_INLINE_PAYLOAD_BYTES,
          });
          noteAttachmentIssue(`Gemini inline uploads are kept under 20 MB in this app. "${file.name}" would go over the limit.`);
          continue;
       }

       try {
          newAttachments.push(await readFileAsAttachment(file));
       } catch (error) {
          appLogger.error("Failed to read selected attachment", {
            err: error,
            mimeType: file.type || "unknown",
            extension: getAttachmentExtension(file.name),
            size: file.size,
          });
          noteAttachmentIssue(error instanceof Error ? error.message : `Could not read ${file.name}.`);
       }
    }

    if (attachmentIssues.length > 0) {
      notify({
        title: attachmentIssues.length === 1 ? "File skipped" : `${attachmentIssues.length} files skipped`,
        description: attachmentIssues.length === 1 ? attachmentIssues[0] : `${attachmentIssues[0]} +${attachmentIssues.length - 1} more.`,
        variant: "error",
        durationMs: 8000,
      });
    }

    if (selectedProvider === "cliproxy") {
      const validationError = validateCliproxyAttachments([...attachments, ...newAttachments]);
      if (validationError) {
        newAttachments.forEach(revokeAttachmentUrl);
        appLogger.warn("CLIProxy attachment validation failed", {
          attachmentCount: attachments.length + newAttachments.length,
          totalSize: getAttachmentTotalSize([...attachments, ...newAttachments]),
        });
        notify({ title: "Attachment problem", description: validationError, variant: "error" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return 0;
      }
    }

    if (selectedProvider === "gemini") {
      const validationError = validateGeminiAttachments([...attachments, ...newAttachments]);
      if (validationError) {
        newAttachments.forEach(revokeAttachmentUrl);
        appLogger.warn("Gemini attachment validation failed", {
          attachmentCount: attachments.length + newAttachments.length,
          totalSize: getAttachmentTotalSize([...attachments, ...newAttachments]),
        });
        notify({ title: "Attachment problem", description: validationError, variant: "error" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return 0;
      }
    }

    if (selectedProvider === "openrouter") {
      const validationError = validateOpenRouterAttachments([...attachments, ...newAttachments]);
      if (validationError) {
        newAttachments.forEach(revokeAttachmentUrl);
        appLogger.warn("OpenRouter attachment validation failed", {
          attachmentCount: attachments.length + newAttachments.length,
        });
        notify({ title: "Attachment problem", description: validationError, variant: "error" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return 0;
      }
    }

    setAttachments(prev => [...prev, ...newAttachments]);
    appLogger.debug("Attachments added", {
      source,
      provider: selectedProvider || "unknown",
      addedCount: newAttachments.length,
      totalCount: attachments.length + newAttachments.length,
      totalSize: getAttachmentTotalSize([...attachments, ...newAttachments]),
    });
    return newAttachments.length;
  };

  const handleFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    await addAttachmentFiles(files, "select");
    if (fileInputRef.current) {
       fileInputRef.current.value = "";
    }
  };

  const handleComposerPaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData?.items || []);
    const filesFromItems = items
      .filter(item => item.kind === "file")
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const files = filesFromItems.length > 0
      ? filesFromItems
      : Array.from(event.clipboardData?.files || []);
    if (files.length === 0) return;

    event.preventDefault();
    await addAttachmentFiles(files, "paste");
  };

  const handleTakeScreenshot = async () => {
    const selectedProvider = getModelOption(selectedModelRef.current)?.provider;
    if (composerMode !== "image" && selectedProvider === "openrouter") {
      notify({
        title: "Screenshot needs vision",
        description: "OpenRouter free models are text-only here. Switch to Gemini/GPT, then capture the screen.",
        variant: "error",
        durationMs: 6500,
      });
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      notify({
        title: "Screen capture unavailable",
        description: "This browser or mobile device cannot capture the screen directly. Pick a screenshot or photo instead.",
        variant: "info",
        durationMs: 6500,
      });
      fileInputRef.current?.click();
      return;
    }

    notify({
      title: "Choose what to capture",
      description: "Select a tab, window, or screen. Privora will attach one PNG frame.",
      variant: "info",
      durationMs: 5000,
    });

    try {
      const file = await getScreenCaptureFile();
      const addedCount = await addAttachmentFiles([file], "screenshot");
      if (addedCount > 0) {
        notify({ title: "Screenshot attached", description: "Ready to send with your prompt.", variant: "success" });
      }
    } catch (error: any) {
      if (error?.name === "NotAllowedError" || error?.name === "AbortError") {
        notify({ title: "Screenshot cancelled", description: "No screen was attached.", variant: "info" });
        return;
      }

      appLogger.error("Screen capture failed", { err: error });
      notify({
        title: "Screen capture failed",
        description: "Your browser could not capture the screen. Pick a screenshot file instead.",
        variant: "error",
        durationMs: 6500,
      });
      fileInputRef.current?.click();
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
       const newArr = [...prev];
       revokeAttachmentUrl(newArr[index]);
       newArr.splice(index, 1);
       appLogger.debug("Attachment removed", { remainingCount: newArr.length });
       return newArr;
    });
  };

  useChatStorage({ setChats, setMessages, setCurrentChatId, setIsStorageReady });
  useTextareaAutosize(textareaRef, input);
  useViewportCssVars();
  useRootDarkMode(isDarkMode);

  useEffect(() => {
    setIsWebDevStorageReady(false);
    void loadWebDevProjects()
      .then((projects) => {
        setWebDevProjects(projects);
        setIsWebDevStorageReady(true);
      })
      .catch(err => {
        setIsWebDevStorageReady(true);
        appLogger.error("Failed to load Web Dev projects", { err });
      });
  }, []);

  useEffect(() => {
    setIsCharactersStorageReady(false);
    void Promise.all([loadCharacters(), loadCharacterSessions()])
      .then(([nextCharacters, nextSessions]) => {
        setCharacters(nextCharacters);
        setCharacterSessions(nextSessions);
        setIsCharactersStorageReady(true);
      })
      .catch(err => {
        setIsCharactersStorageReady(true);
        appLogger.error("Failed to load Characters workspace", { err });
      });
  }, []);
  
  const selectModelForNextMessage = (modelId: string) => {
    selectedModelRef.current = modelId;
    setSelectedModel(modelId);
  };

  const selectStyleForNextMessage = (styleId: ResponseStyleId) => {
    selectedStyleRef.current = styleId;
    setSelectedStyle(styleId);
  };

  const toggleThinkingForNextMessage = () => {
    const nextValue = !isThinkingEnabledRef.current;
    isThinkingEnabledRef.current = nextValue;
    setIsThinkingEnabled(nextValue);
  };

  const clearCurrentPendingResearchIntent = () => {
    const chatId = currentChatIdRef.current;
    if (!chatId) return;
    setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, pendingResearchIntent: undefined, updatedAt: Date.now() } : chat));
    void updateChatMeta(chatId, { pendingResearchIntent: undefined }).catch(err =>
      appLogger.error("Failed to clear pending research intent", { err, chatId })
    );
  };

  const toggleWebSearchForNextMessage = () => {
    const nextValue = !isWebSearchEnabledRef.current;
    setComposerMode("chat");
    isWebSearchEnabledRef.current = nextValue;
    setIsWebSearchEnabled(nextValue);
    if (!nextValue) {
      isDeepResearchEnabledRef.current = false;
      setIsDeepResearchEnabled(false);
      clearCurrentPendingResearchIntent();
    }
  };

  const toggleDeepResearchForNextMessage = () => {
    const nextValue = !isDeepResearchEnabledRef.current;
    setComposerMode("chat");
    isDeepResearchEnabledRef.current = nextValue;
    setIsDeepResearchEnabled(nextValue);
    if (nextValue) {
      isDebateModeEnabledRef.current = false;
      setIsDebateModeEnabled(false);
      isClashModeEnabledRef.current = false;
      setIsClashModeEnabled(false);
      isAgentModeEnabledRef.current = false;
      setIsAgentModeEnabled(false);
      isWebSearchEnabledRef.current = true;
      setIsWebSearchEnabled(true);
    } else {
      clearCurrentPendingResearchIntent();
    }
  };

  const toggleDebateModeForNextMessage = () => {
    const nextValue = !isDebateModeEnabledRef.current;
    setComposerMode("chat");
    isDebateModeEnabledRef.current = nextValue;
    setIsDebateModeEnabled(nextValue);
    if (nextValue) {
      isDeepResearchEnabledRef.current = false;
      setIsDeepResearchEnabled(false);
      isClashModeEnabledRef.current = false;
      setIsClashModeEnabled(false);
      isAgentModeEnabledRef.current = false;
      setIsAgentModeEnabled(false);
      clearCurrentPendingResearchIntent();
    }
  };

  const toggleClashModeForNextMessage = () => {
    const nextValue = !isClashModeEnabledRef.current;
    setComposerMode("chat");
    isClashModeEnabledRef.current = nextValue;
    setIsClashModeEnabled(nextValue);
    if (nextValue) {
      isDeepResearchEnabledRef.current = false;
      isDebateModeEnabledRef.current = false;
      isAgentModeEnabledRef.current = false;
      setIsDeepResearchEnabled(false);
      setIsDebateModeEnabled(false);
      setIsAgentModeEnabled(false);
      clearCurrentPendingResearchIntent();
    }
  };

  const toggleAgentModeForNextMessage = () => {
    const nextValue = !isAgentModeEnabledRef.current;
    setComposerMode("chat");
    isAgentModeEnabledRef.current = nextValue;
    setIsAgentModeEnabled(nextValue);
    if (nextValue) {
      isDeepResearchEnabledRef.current = false;
      isDebateModeEnabledRef.current = false;
      isClashModeEnabledRef.current = false;
      setIsDeepResearchEnabled(false);
      setIsDebateModeEnabled(false);
      setIsClashModeEnabled(false);
      clearCurrentPendingResearchIntent();
    }
  };

  const selectComposerMode = (mode: "chat" | "image") => {
    setComposerMode(mode);
    if (mode === "image") {
      isWebSearchEnabledRef.current = false;
      isDeepResearchEnabledRef.current = false;
      isDebateModeEnabledRef.current = false;
      isClashModeEnabledRef.current = false;
      isAgentModeEnabledRef.current = false;
      setIsWebSearchEnabled(false);
      setIsDeepResearchEnabled(false);
      setIsDebateModeEnabled(false);
      setIsClashModeEnabled(false);
      setIsAgentModeEnabled(false);
      clearCurrentPendingResearchIntent();
    }
  };

  const isNearChatBottom = () => {
    const scroller = chatScrollRef.current;
    if (!scroller) return true;

    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < CHAT_BOTTOM_THRESHOLD_PX;
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const scroller = chatScrollRef.current;
    if (!scroller) return;

    shouldAutoScrollRef.current = true;
    isScrollingToLatestRef.current = true;
    setShowScrollToLatest(false);
    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior,
    });

    window.setTimeout(() => {
      isScrollingToLatestRef.current = false;
      const isNearBottom = isNearChatBottom();
      shouldAutoScrollRef.current = isNearBottom;
      setShowScrollToLatest(messagesRef.current.length > 0 && !isNearBottom);
    }, behavior === "smooth" ? 420 : 0);
  };

  const scrollToBottomAfterChatMount = () => {
    shouldAutoScrollRef.current = true;
    setShowScrollToLatest(false);

    window.requestAnimationFrame(() => {
      scrollToBottom("auto");
      window.requestAnimationFrame(() => scrollToBottom("auto"));
    });
    window.setTimeout(() => scrollToBottom("auto"), 120);
  };

  const handleChatScroll = () => {
    const isNearBottom = isNearChatBottom();
    if (isScrollingToLatestRef.current && !isNearBottom) return;

    shouldAutoScrollRef.current = isNearBottom;
    setShowScrollToLatest(messagesRef.current.length > 0 && !isNearBottom);
  };

  useEffect(() => {
    const previousWorkspaceMode = previousWorkspaceModeRef.current;
    if (previousWorkspaceMode !== workspaceMode && workspaceMode === "chat") {
      shouldScrollOnChatEntryRef.current = true;
      shouldAutoScrollRef.current = true;
      setShowScrollToLatest(false);
    }
    previousWorkspaceModeRef.current = workspaceMode;
  }, [workspaceMode]);

  useEffect(() => {
    if (workspaceMode !== "chat") return;
    if (!shouldScrollOnChatEntryRef.current) return;
    if (!currentChatId || messages.length === 0) return;

    shouldScrollOnChatEntryRef.current = false;
    scrollToBottomAfterChatMount();
  }, [workspaceMode, currentChatId, messages.length]);

  useEffect(() => {
    if (!currentChatId) {
      setArtifacts([]);
      setActiveArtifactId(null);
      return;
    }

    void loadArtifactsForChat(currentChatId)
      .then(setArtifacts)
      .catch(err => appLogger.error("Failed to load artifacts", { err, chatId: currentChatId }));
  }, [currentChatId]);

  const activeArtifact = activeArtifactId
    ? artifacts.find(artifact => artifact.id === activeArtifactId)
    : undefined;
  const openChatPlayground = useCallback((payload: CodePlaygroundPayload = {}) => {
    if (payload.code !== undefined || payload.language) {
      setChatPlaygroundPayload(prev => ({
        code: payload.code ?? prev.code,
        language: payload.language ?? prev.language,
        version: (prev.version || 0) + 1,
      }));
    }
    setActiveArtifactId(null);
    setIsChatPlaygroundOpen(true);
  }, []);
  const openEmptyChatPlayground = useCallback(() => openChatPlayground(), [openChatPlayground]);
  const openCodeInChatPlayground = useCallback((code: string, language?: string) => {
    openChatPlayground({ code, language });
  }, [openChatPlayground]);
  const closeChatPlayground = useCallback(() => setIsChatPlaygroundOpen(false), []);

  const upsertArtifactInState = (artifact: ArtifactRecord) => {
    setArtifacts(prev => {
      const exists = prev.some(item => item.id === artifact.id);
      const next = exists ? prev.map(item => item.id === artifact.id ? artifact : item) : [artifact, ...prev];
      return next.sort((a, b) => b.updatedAt - a.updatedAt);
    });
  };

  const sectionForCommandTarget = (targetType: CommandAgentAction["targetType"]): CommandSection => {
    if (targetType === "task") return "tasks";
    if (targetType === "schedule") return "schedule";
    if (targetType === "note") return "notes";
    return "finance";
  };

  const openCommandTarget = (targetType: CommandAgentAction["targetType"], targetId?: string) => {
    setActiveArtifactId(null);
    setIsChatPlaygroundOpen(false);
    navigateToCommandCenter(sectionForCommandTarget(targetType), targetId || null);
  };

  const persistCurrentChatMessages = async (nextMessages: Message[]) => {
    const chatId = currentChatIdRef.current;
    if (!chatId) return;
    setMessages(nextMessages);
    setChats(prev => prev.map(chat => chat.id === chatId ? { ...chat, messages: nextMessages, updatedAt: Date.now() } : chat));
    await replaceChatMessages(chatId, nextMessages, { updatedAt: Date.now() });
  };

  const patchCommandActionInMessage = async (
    messageId: string,
    actionId: string,
    updater: (action: CommandAgentAction) => CommandAgentAction
  ) => {
    const nextMessages = messagesRef.current.map(message => {
      if (message.id !== messageId || !message.agentActions) return message;
      return {
        ...message,
        agentActions: message.agentActions.map(action => action.id === actionId ? updater(action) : action),
      };
    });
    await persistCurrentChatMessages(nextMessages);
  };

  const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

  const streamCommandMessageContent = async (messageId: string, text: string, options: { isThinking?: boolean } = {}) => {
    let partial = "";
    const chunks = text.match(/.{1,4}/g) || [text];
    for (const chunk of chunks) {
      partial += chunk;
      const nextMessages = messagesRef.current.map(message => message.id === messageId ? {
        ...message,
        content: partial,
        isThinking: options.isThinking ?? message.isThinking,
      } : message);
      setMessages(nextMessages);
      setChats(prev => prev.map(chat => chat.id === currentChatIdRef.current ? { ...chat, messages: nextMessages, updatedAt: Date.now() } : chat));
      await sleep(16);
    }
  };

  const getCommandTargetType = (tool: CommandToolCall["tool"]): CommandAgentAction["targetType"] => {
    if (tool.includes("Task")) return "task";
    if (tool.includes("Schedule") || tool === "findFreeSlots") return "schedule";
    if (tool.includes("Note")) return "note";
    return "finance";
  };

  const getCommandActionKind = (tool: CommandToolCall["tool"]): CommandAgentAction["action"] =>
    tool.startsWith("delete") ? "delete" :
    tool.startsWith("search") || tool === "summarizeFinance" || tool === "findFreeSlots" ? "search" :
    tool === "completeTask" ? "complete" :
    tool.startsWith("create") || tool === "addFinanceEntry" ? "create" :
    "update";

  const getCommandActionTitle = (call: CommandToolCall) => {
    const args = call.arguments || {};
    const title =
      typeof args.title === "string" ? args.title :
      typeof args.note === "string" ? args.note :
      typeof args.query === "string" ? args.query :
      typeof args.category === "string" ? args.category :
      typeof args.id === "string" ? args.id :
      call.tool;
    return title.slice(0, 90);
  };

  const undoCommandAction = async (messageId: string, actionId: string) => {
    const action = messagesRef.current.find(message => message.id === messageId)?.agentActions?.find(item => item.id === actionId);
    if (!action?.activityId) return;
    try {
      await undoCommandActivity(action.activityId);
      await patchCommandActionInMessage(messageId, actionId, item => ({ ...item, status: "undone", canUndo: false, completedAt: Date.now() }));
    } catch (error) {
      appLogger.error("Command action undo failed", { err: error, messageId, actionId });
    }
  };

  const undoCommandMessageSession = async (messageId: string) => {
    const message = messagesRef.current.find(item => item.id === messageId);
    if (!message?.agentSessionId) return;
    try {
      const result = await undoCommandSession(message.agentSessionId);
      const undoneIds = new Set(result.undone.map(activity => activity.id));
      const nextMessages = messagesRef.current.map(item => item.id !== messageId || !item.agentActions ? item : ({
        ...item,
        agentActions: item.agentActions.map(action => action.activityId && undoneIds.has(action.activityId)
          ? { ...action, status: "undone" as const, canUndo: false, completedAt: Date.now() }
          : action),
      }));
      await persistCurrentChatMessages(nextMessages);
      if (result.undone.length === 0 && result.conflicts.length === 0) {
        notify({
          title: "Nothing undone",
          description: "This session has no reversible linked changes. Older action history may not support session undo.",
          variant: "info",
        });
      } else if (result.conflicts.length > 0) {
        notify({
          title: "Session partly undone",
          description: `${result.undone.length} change${result.undone.length === 1 ? "" : "s"} undone. ${result.conflicts.length} newer change${result.conflicts.length === 1 ? " was" : "s were"} kept.`,
          variant: "info",
        });
      } else {
        notify({
          title: "Session undone",
          description: `${result.undone.length} change${result.undone.length === 1 ? "" : "s"} restored.`,
          variant: "success",
        });
      }
    } catch (error) {
      appLogger.error("Command session undo failed", { err: error, messageId });
      notify({
        title: "Undo failed",
        description: error instanceof Error ? error.message : "Could not undo this session.",
        variant: "error",
      });
    }
  };

  const redoCommandMessageSession = async (messageId: string) => {
    const message = messagesRef.current.find(item => item.id === messageId);
    if (!message?.agentSessionId) return;
    try {
      const result = await redoCommandSession(message.agentSessionId);
      const redoneIds = new Set(result.redone.map(activity => activity.id));
      const nextMessages = messagesRef.current.map(item => item.id !== messageId || !item.agentActions ? item : ({
        ...item,
        agentActions: item.agentActions.map(action => action.activityId && redoneIds.has(action.activityId)
          ? { ...action, status: "done" as const, canUndo: true, completedAt: Date.now() }
          : action),
      }));
      await persistCurrentChatMessages(nextMessages);
      if (result.redone.length === 0 && result.conflicts.length === 0) {
        notify({ title: "Nothing redone", description: "This session has no undone changes to replay.", variant: "info" });
      } else if (result.conflicts.length > 0) {
        notify({
          title: "Session partly redone",
          description: `${result.redone.length} change${result.redone.length === 1 ? "" : "s"} replayed. ${result.conflicts.length} newer change${result.conflicts.length === 1 ? " was" : "s were"} kept.`,
          variant: "info",
        });
      } else {
        notify({
          title: "Session redone",
          description: `${result.redone.length} change${result.redone.length === 1 ? "" : "s"} reapplied.`,
          variant: "success",
        });
      }
    } catch (error) {
      appLogger.error("Command session redo failed", { err: error, messageId });
      notify({
        title: "Redo failed",
        description: error instanceof Error ? error.message : "Could not redo this session.",
        variant: "error",
      });
    }
  };

  const cancelCommandAction = async (messageId: string, actionId: string) => {
    const action = messagesRef.current.find(message => message.id === messageId)?.agentActions?.find(item => item.id === actionId);
    if (action?.activityId) {
      await updateCommandActivity(action.activityId, { status: "cancelled" }).catch(err => appLogger.error("Failed to cancel command activity", { err }));
    }
    const cancelText = action ? getCommandCancelledMessage(action) : "Okay, I left it unchanged.";
    await streamCommandMessageContent(messageId, cancelText, { isThinking: false });
    const nextMessages = messagesRef.current.map(message => {
      if (message.id !== messageId || !message.agentActions) return message;
      return {
        ...message,
        content: cancelText,
        isThinking: false,
        agentActions: message.agentActions.map(item => item.id === actionId ? {
          ...item,
          status: "cancelled" as const,
          requiresConfirmation: false,
          pendingCall: undefined,
          completedAt: Date.now(),
        } : item),
      };
    });
    await persistCurrentChatMessages(nextMessages);
    const updatedMessage = nextMessages.find(item => item.id === messageId);
    if (updatedMessage?.agentSessionId) {
      const remainingPending = updatedMessage.agentActions?.filter(item => item.status === "pending").length || 0;
      await updateCommandSession(updatedMessage.agentSessionId, {
        status: remainingPending > 0 ? "awaiting_confirmation" : "completed",
        pendingCount: remainingPending,
        completedCount: updatedMessage.agentActions?.filter(item => item.action !== "search" && item.status === "done").length || 0,
        finalSummary: cancelText,
        completedAt: remainingPending > 0 ? undefined : Date.now(),
      });
    }
  };

  const confirmCommandAction = async (messageId: string, actionId: string, approvedCall?: CommandToolCall) => {
    const message = messagesRef.current.find(item => item.id === messageId);
    const action = message?.agentActions?.find(item => item.id === actionId);
    if (!message || !action?.pendingCall) return;
    const resume = action.pendingCall.resume;
    let resumeController: AbortController | null = null;
    const runningMessages = messagesRef.current.map(item => {
      if (item.id !== messageId || !item.agentActions) return item;
      return {
        ...item,
        content: "",
        isThinking: true,
        agentActions: item.agentActions.map(commandAction => commandAction.id === actionId ? {
          ...commandAction,
          status: "running" as const,
          detail: action.action === "delete" ? "Deleting" : "Applying",
          requiresConfirmation: false,
        } : commandAction),
      };
    });
    isTypingRef.current = true;
    setIsTyping(true);
    await persistCurrentChatMessages(runningMessages);
    try {
      const previousUser = [...messagesRef.current]
        .reverse()
        .find(item => item.role === "user" && item.createdAt <= message.createdAt);
      const result = await executeCommandToolCall(
        approvedCall || {
          id: actionId,
          tool: action.pendingCall.tool as CommandToolCall["tool"],
          arguments: action.pendingCall.arguments,
        },
        {
          chatId: message.chatId,
          messageId,
          userMessageId: previousUser?.id || messageId,
          sessionId: message.agentSessionId,
        },
        { force: true }
      );
      if (approvedCall?.tool === "findFreeSlots") {
        result.summary = "Alternative times checked";
        result.response.output = `The user chose to find another time. No schedule block was created. ${result.response.output || "Free-slot results are attached."} Continue by proposing or creating a non-conflicting block from these results.`;
      }
      if (action.activityId) {
        await updateCommandActivity(action.activityId, { status: "cancelled", undoState: "unavailable" }).catch(err =>
          appLogger.error("Failed to close pending command activity", { err, activityId: action.activityId })
        );
      }
      const completedAction = {
        ...result.action,
        id: actionId,
        sessionId: message.agentSessionId,
        pendingCall: undefined,
        requiresConfirmation: false,
      };
      const remainingPendingActions = (message.agentActions || []).filter(commandAction =>
        commandAction.id !== actionId && commandAction.status === "pending" && commandAction.pendingCall
      );
      if (remainingPendingActions.length > 0) {
        const waitingText = `Approved. ${remainingPendingActions.length} more change${remainingPendingActions.length === 1 ? "" : "s"} still need confirmation before I continue.`;
        const waitingMessages = messagesRef.current.map(item => item.id !== messageId || !item.agentActions ? item : ({
          ...item,
          content: waitingText,
          isThinking: false,
          agentActions: item.agentActions.map(commandAction => commandAction.id === actionId ? completedAction : commandAction),
        }));
        await persistCurrentChatMessages(waitingMessages);
        if (message.agentSessionId) {
          await updateCommandSession(message.agentSessionId, {
            status: "awaiting_confirmation",
            completedCount: waitingMessages.find(item => item.id === messageId)?.agentActions?.filter(item => item.action !== "search" && item.status === "done").length || 0,
            pendingCount: remainingPendingActions.length,
            finalSummary: waitingText,
          });
        }
        return;
      }
      let currentDisplayText = "";
      let currentThought = message.thought || "";
      let currentAgentActions = (messagesRef.current.find(item => item.id === messageId)?.agentActions || [])
        .map(commandAction => commandAction.id === actionId ? completedAction : commandAction);
      let currentWebSearchStatus: Message["webSearchStatus"];
      let currentWebSearchQueries: string[] | undefined;
      let didCompleteWebSearch = false;

      const publishResumedMessage = (patch: Partial<Message> = {}) => {
        const nextMessages = messagesRef.current.map(item => {
          if (item.id !== messageId) return item;
          return {
            ...item,
            content: currentDisplayText,
            thought: currentThought,
            isThinking: true,
            webSearchStatus: currentWebSearchStatus,
            webSearchQueries: currentWebSearchQueries,
            agentActions: currentAgentActions,
            ...patch,
          };
        });
        setMessages(nextMessages);
        setChats(prev => prev.map(chat => chat.id === message.chatId ? { ...chat, messages: nextMessages, updatedAt: Date.now() } : chat));
      };

      const setResumedAgentActions = (updater: (actions: CommandAgentAction[]) => CommandAgentAction[]) => {
        currentAgentActions = updater(currentAgentActions);
        publishResumedMessage();
      };

      const upsertPreparingAction = (nativeCall: CommandNativeToolCall) => {
        const internalCall = commandNativeToInternalCall(nativeCall);
        const preparingAction: CommandAgentAction = {
          id: nativeCall.id || `draft_${nativeCall.name}`,
          toolName: internalCall.tool,
          action: getCommandActionKind(internalCall.tool),
          targetType: getCommandTargetType(internalCall.tool),
          targetId: typeof internalCall.arguments.id === "string" ? internalCall.arguments.id : undefined,
          targetTitle: getCommandActionTitle(internalCall),
          status: "preparing",
          detail: "Preparing",
          createdAt: Date.now(),
        };
        setResumedAgentActions(actions => {
          const index = actions.findIndex(item => item.id === preparingAction.id || (item.status === "preparing" && item.toolName === preparingAction.toolName));
          if (index < 0) return [...actions, preparingAction];
          return actions.map((item, itemIndex) => itemIndex === index ? { ...item, ...preparingAction, createdAt: item.createdAt } : item);
        });
      };

      const markNativeCallRunning = (nativeCall: Required<Pick<CommandNativeToolCall, "id">> & CommandNativeToolCall) => {
        const internalCall = commandNativeToInternalCall(nativeCall);
        const runningAction: CommandAgentAction = {
          id: nativeCall.id,
          toolName: internalCall.tool,
          action: getCommandActionKind(internalCall.tool),
          targetType: getCommandTargetType(internalCall.tool),
          targetId: typeof internalCall.arguments.id === "string" ? internalCall.arguments.id : undefined,
          targetTitle: getCommandActionTitle(internalCall),
          status: "running",
          detail: internalCall.tool,
          createdAt: Date.now(),
        };
        setResumedAgentActions(actions => [
          ...actions.filter(item => item.id !== nativeCall.id && !(item.status === "preparing" && item.toolName === internalCall.tool)),
          runningAction,
        ]);
      };

      if (!resume) {
        currentDisplayText = result.summary || "Done.";
        publishResumedMessage({ isThinking: false });
        await persistCurrentChatMessages(messagesRef.current.map(item => item.id === messageId ? {
          ...item,
          content: currentDisplayText,
          isThinking: false,
          agentActions: currentAgentActions,
        } : item));
        return;
      }

      let providerMessages = appendCommandToolResults(
        resume.providerMessages as CommandProviderMessage[],
        [{
          id: resume.nativeToolCallId,
          name: resume.nativeToolName,
          response: result.response,
        }]
      );
      if ((message.agentActions || []).some(item => item.id !== actionId && item.status === "pending")) {
        providerMessages = [
          ...providerMessages,
          {
            role: "user",
            content: "Command Agent runtime note:\nThe user reviewed the pending bundle. Previously approved changes in this bundle have already been applied; continue from the current Command Center state without recreating them.",
          },
        ];
      }
      let totalToolCalls = resume.completedToolCalls;
      let finalText = "";
      let stoppedForConfirmation = false;
      let loopCapped = false;
      let interruptedBeforeSummary = false;
      const actionSummaries = [result.summary].filter(Boolean);
      const countCompletedChanges = () => currentAgentActions.filter(item => item.action !== "search" && item.status === "done").length;
      const completedCallResults = new Map<string, CommandFunctionResponse>();
      const controller = new AbortController();
      resumeController = controller;
      abortControllerRef.current = controller;

      for (let iteration = 1; iteration <= COMMAND_AGENT_MAX_RESUME_ITERATIONS; iteration += 1) {
        if (controller.signal.aborted) break;
        const iterationToolCalls: Array<Required<Pick<CommandNativeToolCall, "id">> & CommandNativeToolCall> = [];
        const seenToolCalls = new Set<string>();
        let iterationText = "";

        publishResumedMessage();
        try {
          await streamCommandAgentResponse({
            provider: resume.provider as ProviderId | undefined,
            model: resume.model,
            systemInstruction: resume.systemInstruction,
            providerMessages,
            reasoningEnabled: resume.reasoningEnabled,
            webSearchEnabled: resume.webSearchEnabled,
            signal: controller.signal,
            onTextDelta: (delta) => {
              iterationText += delta;
              currentDisplayText = iterationText;
              publishResumedMessage();
            },
            onThoughtDelta: (delta) => {
              currentThought += delta;
              publishResumedMessage();
            },
            onWebSearch: ({ status, queries }) => {
              currentWebSearchStatus = status;
              if (status === "searched") didCompleteWebSearch = true;
              currentWebSearchQueries = queries || currentWebSearchQueries;
              publishResumedMessage();
            },
            onToolDelta: (draft) => upsertPreparingAction({ id: draft.id, name: draft.name, arguments: draft.arguments }),
            onToolCall: (nativeCall) => {
              const normalized = withCommandNativeToolCallId(nativeCall);
              const signature = `${normalized.name}:${JSON.stringify(normalized.arguments)}`;
              if (seenToolCalls.has(normalized.id) || seenToolCalls.has(signature)) return;
              seenToolCalls.add(normalized.id);
              seenToolCalls.add(signature);
              iterationToolCalls.push(normalized);
            },
          });
        } catch (error) {
          if (error instanceof CommandProviderIdleTimeoutError && actionSummaries.length > 0) {
            finalText = `Stopped. ${countCompletedChanges()} completed change${countCompletedChanges() === 1 ? " was" : "s were"} kept. The model connection stalled before it could finish the remaining steps.`;
            interruptedBeforeSummary = true;
            break;
          }
          throw error;
        }

        currentAgentActions = currentAgentActions.filter(item => item.status !== "preparing");
        publishResumedMessage();

        if (iterationToolCalls.length === 0) {
          finalText = iterationText.trim();
          break;
        }

        const remainingToolBudget = COMMAND_AGENT_MAX_TOOL_CALLS - totalToolCalls;
        const callsToRun = iterationToolCalls.slice(0, Math.max(0, remainingToolBudget));
        if (callsToRun.length === 0) {
          loopCapped = true;
          break;
        }

        const executedCalls: Array<Required<Pick<CommandNativeToolCall, "id">> & CommandNativeToolCall> = [];
        const toolResults: Array<{ id: string; name: string; response: CommandFunctionResponse }> = [];
        for (const nativeCall of callsToRun) {
          if (controller.signal.aborted) break;
          totalToolCalls += 1;
          const operationSignature = `${nativeCall.name}:${JSON.stringify(nativeCall.arguments)}`;
          const priorResponse = completedCallResults.get(operationSignature);
          if (priorResponse) {
            executedCalls.push(nativeCall);
            toolResults.push({
              id: nativeCall.id,
              name: nativeCall.name,
              response: {
                ...priorResponse,
                output: "This identical action was already completed in this operation. Continue without repeating it.",
              },
            });
            continue;
          }
          markNativeCallRunning(nativeCall);
          const internalCall = commandNativeToInternalCall(nativeCall);
          try {
            const nextResult = await executeCommandToolCall(
              { ...internalCall, id: nativeCall.id },
              { chatId: message.chatId, messageId, userMessageId: previousUser?.id || messageId, sessionId: message.agentSessionId }
            );
            actionSummaries.push(nextResult.summary);
            executedCalls.push(nativeCall);
            const toolResult = { id: nativeCall.id, name: nativeCall.name, response: nextResult.response };
            const nextAction = nextResult.pendingCall
              ? {
                  ...nextResult.action,
                  sessionId: message.agentSessionId,
                  pendingCall: {
                    tool: nextResult.pendingCall.tool,
                    arguments: nextResult.pendingCall.arguments,
                    resume: {
                      provider: resume.provider,
                      model: resume.model,
                      systemInstruction: resume.systemInstruction,
                      providerMessages: appendCommandToolResults(
                        appendCommandAssistantToolCalls(providerMessages, iterationText, executedCalls),
                        toolResults
                      ),
                      nativeToolName: nativeCall.name,
                      nativeToolCallId: nativeCall.id,
                      reasoningEnabled: resume.reasoningEnabled,
                      webSearchEnabled: resume.webSearchEnabled,
                      completedToolCalls: totalToolCalls,
                    },
                  },
                }
              : { ...nextResult.action, sessionId: message.agentSessionId };
            setResumedAgentActions(actions => actions.map(item => item.id === nativeCall.id ? nextAction : item));
            toolResults.push(toolResult);
            if (!nextResult.pendingCall) completedCallResults.set(operationSignature, nextResult.response);
            if (nextResult.pendingCall) {
              stoppedForConfirmation = true;
              finalText = getCommandPendingConfirmationMessage(nextAction);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Action failed.";
            setResumedAgentActions(actions => actions.map(item => item.id === nativeCall.id ? {
              ...item,
              status: "failed",
              error: errorMessage,
              completedAt: Date.now(),
            } : item));
            executedCalls.push(nativeCall);
            toolResults.push({
              id: nativeCall.id,
              name: nativeCall.name,
              response: {
                success: false,
                status: "failed",
                error: errorMessage,
                output: errorMessage,
              },
            });
          }
          if (totalToolCalls >= COMMAND_AGENT_MAX_TOOL_CALLS) break;
        }
        if (executedCalls.length > 0) {
          providerMessages = appendCommandToolResults(
            appendCommandAssistantToolCalls(providerMessages, iterationText, executedCalls),
            toolResults
          );
        }
        if (stoppedForConfirmation) break;
        if (totalToolCalls >= COMMAND_AGENT_MAX_TOOL_CALLS) {
          loopCapped = true;
          break;
        }
        providerMessages = [
          ...providerMessages,
          {
            role: "user",
            content: "Command Agent runtime note:\nTool results are available. If more tools are needed, call them now; otherwise give the user a short final summary.",
          },
        ];
      }

      if (!finalText) {
        finalText = loopCapped
          ? `Stopped. ${countCompletedChanges()} completed change${countCompletedChanges() === 1 ? " was" : "s were"} kept because the tool budget was reached.`
          : actionSummaries.length > 0
            ? `Done. ${actionSummaries.join("; ")}.`
            : "Done.";
      }

      currentDisplayText = finalText;
      publishResumedMessage({
        isThinking: false,
        webSearchStatus: didCompleteWebSearch ? "searched" : undefined,
        webSearchQueries: didCompleteWebSearch ? currentWebSearchQueries : undefined,
      });
      await persistCurrentChatMessages(messagesRef.current.map(item => item.id === messageId ? {
        ...item,
        content: finalText,
        thought: currentThought,
        isThinking: false,
        webSearchStatus: didCompleteWebSearch ? "searched" : undefined,
        webSearchQueries: didCompleteWebSearch ? currentWebSearchQueries : undefined,
        agentActions: currentAgentActions,
      } : item));
      if (message.agentSessionId) {
        await updateCommandSession(message.agentSessionId, {
          status: stoppedForConfirmation ? "awaiting_confirmation" : interruptedBeforeSummary || loopCapped ? "stopped" : "completed",
          actionCount: currentAgentActions.length,
          completedCount: countCompletedChanges(),
          pendingCount: currentAgentActions.filter(item => item.status === "pending").length,
          failedCount: currentAgentActions.filter(item => item.status === "failed").length,
          finalSummary: finalText,
          completedAt: stoppedForConfirmation || interruptedBeforeSummary || loopCapped ? undefined : Date.now(),
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Action failed.";
      const isStopped = error instanceof DOMException && error.name === "AbortError" || abortControllerRef.current?.signal.aborted;
      const failedText = isStopped ? "Stopped." : `I could not apply that change: ${errorMessage}`;
      await streamCommandMessageContent(messageId, failedText, { isThinking: false });
      const nextMessages = messagesRef.current.map(item => {
        if (item.id !== messageId || !item.agentActions) return item;
        return {
          ...item,
          content: failedText,
          isThinking: false,
          agentActions: item.agentActions.map(commandAction => commandAction.id === actionId ? {
            ...commandAction,
            status: "failed" as const,
            error: errorMessage,
            completedAt: Date.now(),
          } : commandAction),
        };
      });
      await persistCurrentChatMessages(nextMessages);
      if (message.agentSessionId) {
        await updateCommandSession(message.agentSessionId, {
          status: isStopped ? "stopped" : "failed",
          error: isStopped ? undefined : errorMessage,
          finalSummary: failedText,
        });
      }
    } finally {
      if (!resumeController || abortControllerRef.current === resumeController) {
        abortControllerRef.current = null;
      }
      isTypingRef.current = false;
      setIsTyping(false);
    }
  };

  const updateDuplicateCommandAction = async (messageId: string, actionId: string) => {
    const action = messagesRef.current.find(item => item.id === messageId)?.agentActions?.find(item => item.id === actionId);
    if (!action?.pendingCall || action.confirmationKind !== "duplicate" || !action.existingTargetId) return;
    if (action.targetType !== "task" || action.pendingCall.tool !== "createTask") {
      await cancelCommandAction(messageId, actionId);
      return;
    }
    await confirmCommandAction(messageId, actionId, {
      id: actionId,
      tool: "updateTask",
      arguments: {
        ...action.pendingCall.arguments,
        id: action.existingTargetId,
      },
    });
  };

  const findAlternativeCommandAction = async (messageId: string, actionId: string) => {
    const action = messagesRef.current.find(item => item.id === messageId)?.agentActions?.find(item => item.id === actionId);
    if (!action?.pendingCall || action.confirmationKind !== "conflict") return;
    const startAt = typeof action.pendingCall.arguments.startAt === "string"
      ? Date.parse(action.pendingCall.arguments.startAt)
      : Number(action.pendingCall.arguments.startAt);
    const endAt = typeof action.pendingCall.arguments.endAt === "string"
      ? Date.parse(action.pendingCall.arguments.endAt)
      : Number(action.pendingCall.arguments.endAt);
    if (!Number.isFinite(startAt)) {
      await cancelCommandAction(messageId, actionId);
      return;
    }
    const dayStart = new Date(startAt);
    dayStart.setHours(6, 0, 0, 0);
    const dayEnd = new Date(startAt);
    dayEnd.setHours(23, 0, 0, 0);
    const durationMinutes = Number.isFinite(endAt) && endAt > startAt
      ? Math.max(15, Math.round((endAt - startAt) / 60_000))
      : Number(action.pendingCall.arguments.durationMinutes) || 30;
    await confirmCommandAction(messageId, actionId, {
      id: actionId,
      tool: "findFreeSlots",
      arguments: {
        startAt: dayStart.toISOString(),
        endAt: dayEnd.toISOString(),
        durationMinutes,
      },
    });
  };

  const resolvePendingCommandActionFromText = async (text: string) => {
    const pendingMessage = [...messagesRef.current]
      .reverse()
      .find(message => message.role === "model" && message.agentActions?.some(action => action.status === "pending" && action.pendingCall));
    const pendingAction = pendingMessage?.agentActions?.find(action => action.status === "pending" && action.pendingCall);
    if (!pendingMessage || !pendingAction) return false;

    const normalized = text.trim().toLowerCase();
    const isCancel =
      /\b(cancel|stop|no|nope|leave it|keep it|don't|dont|do not)\b/i.test(normalized) ||
      /^(never mind|nevermind)$/i.test(normalized) ||
      /\b(keep|use)\s+(the\s+)?existing\b/i.test(normalized);
    const isUpdateExisting =
      pendingAction.confirmationKind === "duplicate" &&
      pendingAction.targetType === "task" &&
      /\b(update|change|edit)\b.{0,20}\b(existing|current|that|it)\b/i.test(normalized);
    const isFindAlternative =
      pendingAction.confirmationKind === "conflict" &&
      /\b(find|choose|pick|use)\b.{0,25}\b(another|other|free|different)\b.{0,15}\b(time|slot)?\b/i.test(normalized);
    const isConfirm =
      /^(yes|y|yeah|yep|ok|okay|sure|confirm|approve|approved|do it|go ahead|proceed|run it|apply it|continue)$/i.test(normalized) ||
      (pendingAction.action === "delete" && (/^(delete|remove)$/i.test(normalized) || /\b(delete|remove)\b.{0,24}\b(it|this|that)\b/i.test(normalized)));

    if (!isCancel && !isConfirm && !isUpdateExisting && !isFindAlternative) return false;
    if (isFindAlternative) {
      await findAlternativeCommandAction(pendingMessage.id, pendingAction.id);
      return true;
    }
    if (isUpdateExisting) {
      await updateDuplicateCommandAction(pendingMessage.id, pendingAction.id);
      return true;
    }
    if (isCancel) {
      await cancelCommandAction(pendingMessage.id, pendingAction.id);
      return true;
    }
    await confirmCommandAction(pendingMessage.id, pendingAction.id);
    return true;
  };

  const getPendingCommandConfirmation = () => {
    const message = [...messagesRef.current]
      .reverse()
      .find(item => item.role === "model" && item.agentActions?.some(action => action.status === "pending" && action.pendingCall));
    const action = message?.agentActions?.find(item => item.status === "pending" && item.pendingCall);
    return message && action ? { message, action } : null;
  };

  const confirmAllCommandActions = async (messageId: string) => {
    while (true) {
      const action = messagesRef.current
        .find(item => item.id === messageId)
        ?.agentActions?.find(item => item.status === "pending" && item.pendingCall);
      if (!action) return;
      await confirmCommandAction(messageId, action.id);
      await new Promise(resolve => window.setTimeout(resolve, 0));
    }
  };

  const hasPendingCommandConfirmation = Boolean(getPendingCommandConfirmation());

  const stopGenerationOrPendingCommand = () => {
    if (isTypingRef.current || abortControllerRef.current) {
      stopGeneration();
      return;
    }
    const pending = getPendingCommandConfirmation();
    if (pending) {
      void cancelCommandAction(pending.message.id, pending.action.id);
    }
  };

  useEffect(() => {
    if (messages.length === 0) {
      shouldAutoScrollRef.current = true;
      setShowScrollToLatest(false);
      return;
    }

    if (shouldAutoScrollRef.current) {
      scrollToBottom(isTyping ? "auto" : "smooth");
      return;
    }

    setShowScrollToLatest(true);
  }, [messages, isTyping]);

  const navigateToChat = (chatId?: string | null, replace = false) => {
    if (chatId) {
      void navigate({ to: "/chat/$chatId", params: { chatId } as any, replace });
      return;
    }
    void navigate({ to: "/chat", replace });
  };

  const navigateToWebDevProject = (projectId?: string | null, replace = false, threadId?: string | null) => {
    if (projectId && threadId) {
      void navigate({ to: "/web-dev/$projectId/thread/$threadId", params: { projectId, threadId } as any, replace });
      return;
    }
    if (projectId) {
      void navigate({ to: "/web-dev/$projectId", params: { projectId } as any, replace });
      return;
    }
    void navigate({ to: "/web-dev", replace });
  };

  const navigateToCharacters = (sessionId?: string | null, replace = false) => {
    if (sessionId) {
      void navigate({ to: "/characters/$sessionId", params: { sessionId } as any, replace });
      return;
    }
    void navigate({ to: "/characters", replace });
  };

  const navigateToCommandCenter = (section: CommandSection = "tasks", itemId?: string | null, replace = false) => {
    if (itemId) {
      void navigate({ to: "/command-center/$section/$itemId", params: { section, itemId } as any, replace });
      return;
    }
    if (section && section !== "tasks") {
      void navigate({ to: "/command-center/$section", params: { section } as any, replace });
      return;
    }
    void navigate({ to: "/command-center", replace });
  };

  const navigateToWorkspaceMode = (mode: WorkspaceMode) => {
    if (mode === "web-dev") {
      setActiveArtifactId(null);
      navigateToWebDevProject(currentWebDevProjectId, false, currentWebDevThreadId);
      return;
    }

    if (mode === "characters") {
      setActiveArtifactId(null);
      navigateToCharacters(currentCharacterSessionId);
      return;
    }

    if (mode === "command-center") {
      setActiveArtifactId(null);
      navigateToCommandCenter(routeState.mode === "command-center" ? routeState.section : "tasks");
      return;
    }

    navigateToChat(currentChatId);
  };

  const handleNewChat = async () => {
    const now = Date.now();
    const newChatId = createId("chat");
    const newChat: Chat = {
      id: newChatId,
      title: "New Conversation",
      messages: [],
      createdAt: now,
      updatedAt: now,
      model: selectedModelRef.current,
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChatId);
    setMessages([]);
    setActiveArtifactId(null);
    shouldAutoScrollRef.current = true;
    setShowScrollToLatest(false);
    await createChat(newChat);
    navigateToChat(newChatId);
  };

  const handleNewWebDevProject = async () => {
    const { project, thread } = await createWebDevProject("New web app", selectedModelRef.current);
    setWebDevProjects(prev => [project, ...prev]);
    setWebDevThreads([thread]);
    setCurrentWebDevProjectId(project.id);
    setCurrentWebDevThreadId(thread.id);
    navigateToWebDevProject(project.id, false, thread.id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const selectWebDevProject = async (id: string) => {
    setCurrentWebDevProjectId(id);
    const defaultThread = await ensureDefaultWebDevThread(id);
    const threads = await loadWebDevThreads(id);
    setWebDevThreads(threads);
    const thread = threads.find(item => item.id === currentWebDevThreadId) || defaultThread;
    setCurrentWebDevThreadId(thread.id);
    navigateToWebDevProject(id, false, thread.id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const selectWebDevThread = (projectId: string, threadId: string) => {
    setCurrentWebDevProjectId(projectId);
    setCurrentWebDevThreadId(threadId);
    navigateToWebDevProject(projectId, false, threadId);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleNewWebDevThread = async (projectId: string) => {
    const { thread } = await createWebDevThread(projectId, "New thread");
    const threads = await loadWebDevThreads(projectId);
    setWebDevThreads(threads);
    setCurrentWebDevProjectId(projectId);
    setCurrentWebDevThreadId(thread.id);
    navigateToWebDevProject(projectId, false, thread.id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const deleteWebDevThreadById = async (e: React.MouseEvent, projectId: string, threadId: string) => {
    e.stopPropagation();
    const projectThreads = webDevThreads.filter(thread => thread.projectId === projectId);
    const remainingThreads = projectThreads.filter(thread => thread.id !== threadId);
    await deleteWebDevThread(threadId);

    let nextThreads = webDevThreads.filter(thread => thread.id !== threadId);
    let nextThread = remainingThreads[0] || null;
    if (!nextThread) {
      nextThread = await ensureDefaultWebDevThread(projectId);
      nextThreads = await loadWebDevThreads(projectId);
    }
    setWebDevThreads(nextThreads);

    if (currentWebDevProjectId === projectId && currentWebDevThreadId === threadId) {
      setCurrentWebDevThreadId(nextThread.id);
      navigateToWebDevProject(projectId, true, nextThread.id);
    }
  };

  const handleNewCharacterSession = () => {
    setCurrentCharacterSessionId(null);
    setActiveArtifactId(null);
    navigateToCharacters(null);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const selectCharacterSession = (id: string) => {
    setCurrentCharacterSessionId(id);
    setActiveArtifactId(null);
    navigateToCharacters(id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const selectChat = (id: string) => {
    const chat = chats.find(c => c.id === id);
    if (chat) {
      setCurrentChatId(id);
      setActiveArtifactId(null);
      shouldAutoScrollRef.current = true;
      setShowScrollToLatest(false);
      setMessages(chat.messages);
      navigateToChat(id);
    }
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleChatRowKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, chatId: string) => {
    if (isTypingRef.current) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectChat(chatId);
    }
  };

  const closeRenameDialog = () => {
    setRenameTarget(null);
    setRenameTitle("");
  };

  const renameChat = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const chat = chatsRef.current.find(c => c.id === id);
    if (!chat) return;
    setRenameTarget({ kind: "chat", id });
    setRenameTitle(chat.title);
    setActiveMenuId(null);
  };

  const renameWebDevProject = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const project = webDevProjects.find(item => item.id === id);
    if (!project) return;
    setRenameTarget({ kind: "web-dev", id });
    setRenameTitle(project.title);
    setActiveMenuId(null);
  };

  const submitRenameChat = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!renameTarget) return;

    const title = renameTitle.trim();
    if (!title) {
      renameInputRef.current?.focus();
      return;
    }

    if (renameTarget.kind === "chat") {
      const chatId = renameTarget.id;
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, title, updatedAt: Date.now() } : c));
      await updateChatMeta(chatId, { title });
    } else {
      const projectId = renameTarget.id;
      setWebDevProjects(prev => prev.map(project => project.id === projectId ? { ...project, title, updatedAt: Date.now() } : project));
      await updateWebDevProject(projectId, { title });
    }
    closeRenameDialog();
  };

  const toggleStarChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const chat = chatsRef.current.find(c => c.id === id);
    const isStarred = !chat?.isStarred;
    setChats(prev => prev.map(c => c.id === id ? { ...c, isStarred, updatedAt: Date.now() } : c));
    await updateChatMeta(id, { isStarred });
    setActiveMenuId(null);
  };

  const deleteChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updatedChats = chatsRef.current.filter(c => c.id !== id);
    setChats(updatedChats);
    await deleteChatFromDb(id);
    if (currentChatId === id) {
      if (updatedChats.length > 0) {
        navigateToChat(updatedChats[0].id, true);
      } else {
        await handleNewChat();
      }
    }
    setActiveMenuId(null);
  };

  const deleteWebDevProjectById = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updatedProjects = webDevProjects.filter(project => project.id !== id);
    setWebDevProjects(updatedProjects);
    await deleteWebDevProject(id);
    if (currentWebDevProjectId === id) {
      setCurrentWebDevProjectId(null);
      navigateToWebDevProject(null, true);
    }
    setActiveMenuId(null);
  };

  const deleteCharacterSessionById = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updatedSessions = characterSessions.filter(session => session.id !== id);
    setCharacterSessions(updatedSessions);
    await deleteCharacterSession(id);
    if (currentCharacterSessionId === id) {
      setCurrentCharacterSessionId(null);
      navigateToCharacters(null, true);
    }
    setActiveMenuId(null);
  };

  const toggleStarWebDevProject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const project = webDevProjects.find(item => item.id === id);
    const isStarred = !project?.isStarred;
    setWebDevProjects(prev => prev
      .map(item => item.id === id ? { ...item, isStarred, updatedAt: Date.now() } : item)
      .sort((a, b) => Number(Boolean(b.isStarred)) - Number(Boolean(a.isStarred)) || b.updatedAt - a.updatedAt)
    );
    await updateWebDevProject(id, { isStarred });
    setActiveMenuId(null);
  };

  useEffect(() => {
    if (pathname !== "/") return;
    const fallbackMode = initialUiSettingsRef.current.workspaceMode;
    if (fallbackMode === "web-dev") {
      navigateToWebDevProject(null, true);
      return;
    }
    if (fallbackMode === "characters") {
      navigateToCharacters(null, true);
      return;
    }
    if (fallbackMode === "command-center") {
      navigateToCommandCenter("tasks", null, true);
      return;
    }
    navigateToChat(null, true);
  }, [pathname]);

  useEffect(() => {
    if (workspaceMode !== "chat") {
      setActiveArtifactId(null);
      return;
    }

    if (routeState.mode !== "chat") return;

    if (routeState.chatId) {
      const chat = chats.find(item => item.id === routeState.chatId);
      if (chat) {
        if (currentChatId !== chat.id) {
          setCurrentChatId(chat.id);
          shouldAutoScrollRef.current = true;
          setShowScrollToLatest(false);
        }
        setMessages(chat.messages);
      } else if (isStorageReady) {
        navigateToChat(null, true);
      }
      return;
    }

    if (!isStorageReady) return;
    if (chats.length > 0) {
      navigateToChat(chats[0].id, true);
    } else {
      void handleNewChat();
    }
  }, [workspaceMode, routeState, chats, currentChatId, isStorageReady]);

  useEffect(() => {
    if (workspaceMode !== "web-dev" || routeState.mode !== "web-dev") return;

    if (!routeState.projectId) {
      if (currentWebDevProjectId !== null) setCurrentWebDevProjectId(null);
      if (currentWebDevThreadId !== null) setCurrentWebDevThreadId(null);
      setWebDevThreads([]);
      return;
    }

    const project = webDevProjects.find(item => item.id === routeState.projectId);
    if (project) {
      if (currentWebDevProjectId !== project.id) setCurrentWebDevProjectId(project.id);
      void (async () => {
        const defaultThread = await ensureDefaultWebDevThread(project.id);
        const threads = await loadWebDevThreads(project.id);
        setWebDevThreads(threads);
        const routeThread = routeState.threadId ? threads.find(thread => thread.id === routeState.threadId) : undefined;
        const selectedThread = routeThread || threads.find(thread => thread.id === currentWebDevThreadId) || defaultThread;
        if (currentWebDevThreadId !== selectedThread.id) setCurrentWebDevThreadId(selectedThread.id);
        if (!routeState.threadId || !routeThread) navigateToWebDevProject(project.id, true, selectedThread.id);
      })().catch(err => appLogger.error("Failed to load Web Dev threads", { err, projectId: project.id }));
    } else if (isWebDevStorageReady) {
      navigateToWebDevProject(null, true);
    }
  }, [workspaceMode, routeState, webDevProjects, currentWebDevProjectId, currentWebDevThreadId, isWebDevStorageReady]);

  useEffect(() => {
    if (workspaceMode !== "characters" || routeState.mode !== "characters") return;

    if (!routeState.sessionId) {
      if (currentCharacterSessionId !== null) setCurrentCharacterSessionId(null);
      return;
    }

    const session = characterSessions.find(item => item.id === routeState.sessionId);
    if (session) {
      if (currentCharacterSessionId !== session.id) setCurrentCharacterSessionId(session.id);
    } else if (isCharactersStorageReady) {
      navigateToCharacters(null, true);
    }
  }, [workspaceMode, routeState, characterSessions, currentCharacterSessionId, isCharactersStorageReady]);

  const {
    handleEditMessage,
    handleEditGeneratedImage,
    handleKeyDown,
    handleRetryMessage,
    startResearchPlan,
    resumeResearchJob,
    editResearchPlan,
    clearResearchPlanEdit,
    cancelResearchPlan,
    handleSubmit,
    stopGeneration,
  } = useChatGeneration({
    input,
    messages,
    attachments,
    composerMode,
    setInput,
    setAttachments,
    setComposerMode,
    setMessages,
    setChats,
    setIsTyping,
    currentChatIdRef,
    isTypingRef,
    selectedModelRef,
    selectedStyleRef,
    isThinkingEnabledRef,
    isWebSearchEnabledRef,
    isDeepResearchEnabledRef,
    isDebateModeEnabledRef,
    isClashModeEnabledRef,
    isAgentModeEnabledRef,
    debateSettingsRef,
    clashSettingsRef,
    imageSettingsRef,
    messagesRef,
    chatsRef,
    abortControllerRef,
    shouldAutoScrollRef,
    textareaRef,
    isNearChatBottom,
    onArtifactUpsert: upsertArtifactInState,
    onArtifactOpen: setActiveArtifactId,
    onResolvePendingCommandAction: resolvePendingCommandActionFromText,
  });

  const isLandingChat = messages.length === 0;
  const activeResearchMessage = [...messages].reverse().find(message => message.researchPlan || message.researchActivity?.length);
  const editingResearchPlanMessage = [...messages].reverse().find(message => message.researchPlan?.status === "editing");
  const chatSidePanelOffset = workspaceMode === "chat"
    ? activeArtifact
      ? canvasWidth
      : isChatPlaygroundOpen
        ? chatPlaygroundWidth
        : 0
    : 0;

  useEffect(() => {
    if (activeResearchMessage?.researchPlan && activeResearchMessage.researchPlan.status !== "completed" && activeResearchMessage.researchPlan.status !== "cancelled") {
      setIsResearchActivityOpen(true);
    }
  }, [activeResearchMessage?.id, activeResearchMessage?.researchPlan?.status]);

  useEffect(() => {
    if (!isStorageReady || isTypingRef.current) return;
    const runningResearchMessage = messages.find(message =>
      message.researchPlan?.status === "running" &&
      message.researchJobId &&
      message.researchStatus !== "completed" &&
      message.researchStatus !== "stopped" &&
      message.researchStatus !== "failed"
    );
    if (!runningResearchMessage?.researchJobId) return;
    void resumeResearchJob(runningResearchMessage.id, runningResearchMessage.researchJobId);
  }, [isStorageReady, currentChatId, messages, resumeResearchJob]);

  const renderComposer = (placement: "footer" | "landing") => (
    <ChatComposer
      input={input}
      attachments={attachments}
      isTyping={isTyping}
      isAwaitingConfirmation={hasPendingCommandConfirmation}
      selectedModel={selectedModel}
      selectedStyle={selectedStyle}
      isThinkingEnabled={isThinkingEnabled}
      isWebSearchEnabled={isWebSearchEnabled}
      isDeepResearchEnabled={isDeepResearchEnabled}
      isDebateModeEnabled={isDebateModeEnabled}
      isClashModeEnabled={isClashModeEnabled}
      isAgentModeEnabled={isAgentModeEnabled}
      composerMode={composerMode}
      debateSettings={debateSettings}
      clashSettings={clashSettings}
      imageSettings={imageSettings}
      researchEditContext={editingResearchPlanMessage?.researchPlan ? {
        title: editingResearchPlanMessage.researchPlan.title,
      } : undefined}
      textareaRef={textareaRef}
      fileInputRef={fileInputRef}
      onInputChange={setInput}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      onPaste={handleComposerPaste}
      onFileSelect={handleFileSelect}
      onTakeScreenshot={handleTakeScreenshot}
      onPreviewAttachment={setPreviewAttachment}
      onRemoveAttachment={removeAttachment}
      onToggleThinking={toggleThinkingForNextMessage}
      onToggleWebSearch={toggleWebSearchForNextMessage}
      onToggleDeepResearch={toggleDeepResearchForNextMessage}
      onToggleDebateMode={toggleDebateModeForNextMessage}
      onToggleClashMode={toggleClashModeForNextMessage}
      onToggleAgentMode={toggleAgentModeForNextMessage}
      onOpenCodePlayground={openEmptyChatPlayground}
      onSelectComposerMode={selectComposerMode}
      onDebateSettingsChange={setDebateSettings}
      onClashSettingsChange={setClashSettings}
      onImageSettingsChange={setImageSettings}
      onSelectModel={selectModelForNextMessage}
      onSelectStyle={selectStyleForNextMessage}
      onStopGeneration={stopGenerationOrPendingCommand}
      onClearResearchEdit={() => editingResearchPlanMessage && clearResearchPlanEdit(editingResearchPlanMessage.id)}
      placement={placement}
    />
  );

  return (
    <div className="relative h-[var(--privora-app-height,100dvh)] w-full flex font-sans bg-[var(--privora-bg)] text-[var(--privora-text)] overflow-hidden transition-colors duration-500">
      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      <ChatSidebar
        isOpen={isSidebarOpen}
        workspaceMode={workspaceMode}
        chats={chats}
        webDevProjects={webDevProjects}
        webDevThreads={webDevThreads}
        characters={characters}
        characterSessions={characterSessions}
        currentChatId={currentChatId}
        currentWebDevProjectId={currentWebDevProjectId}
        currentWebDevThreadId={currentWebDevThreadId}
        currentCharacterSessionId={currentCharacterSessionId}
        isTyping={isTyping}
        isDarkMode={isDarkMode}
        activeMenuId={activeMenuId}
        onOpenChange={setIsSidebarOpen}
        onWorkspaceModeChange={(mode) => {
          navigateToWorkspaceMode(mode);
        }}
        onNewChat={handleNewChat}
        onNewWebDevProject={() => void handleNewWebDevProject()}
        onNewWebDevThread={(projectId) => void handleNewWebDevThread(projectId)}
        onDeleteWebDevThread={(event, projectId, threadId) => void deleteWebDevThreadById(event, projectId, threadId)}
        onNewCharacterSession={handleNewCharacterSession}
        onSearchOpen={() => setIsSearchModalOpen(true)}
        onSelectChat={selectChat}
        onSelectWebDevProject={selectWebDevProject}
        onSelectWebDevThread={selectWebDevThread}
        onSelectCharacterSession={selectCharacterSession}
        onChatRowKeyDown={handleChatRowKeyDown}
        onActiveMenuChange={setActiveMenuId}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        onToggleStarChat={toggleStarChat}
        onRenameChat={renameChat}
        onDeleteChat={deleteChat}
        onRenameWebDevProject={renameWebDevProject}
        onDeleteWebDevProject={deleteWebDevProjectById}
        onToggleStarWebDevProject={toggleStarWebDevProject}
        onDeleteCharacterSession={deleteCharacterSessionById}
      />

      {/* Main Content Area */}
      <div
        className="flex-1 relative flex flex-col min-w-0 h-full overflow-hidden transition-[margin] duration-200 ease-out lg:mr-[var(--privora-canvas-offset)]"
        style={{ "--privora-canvas-offset": chatSidePanelOffset ? `${chatSidePanelOffset}px` : "0px" } as CSSProperties}
      >
        {!isSidebarOpen && (
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="md:hidden absolute left-3 top-3 z-30 h-9 w-9 rounded-full border border-[var(--privora-border)] bg-[var(--privora-surface)] text-[var(--privora-muted)] shadow-sm flex items-center justify-center transition-colors hover:text-[var(--privora-text)]"
            title="Open sidebar"
          >
            <PanelLeft className="h-[18px] w-[18px]" />
          </button>
        )}

        <div className={workspaceMode === "web-dev" ? "contents" : "hidden"} aria-hidden={workspaceMode !== "web-dev"}>
          <WebDevWorkspace
            projects={webDevProjects}
            threads={webDevThreads}
            currentProjectId={currentWebDevProjectId}
            currentThreadId={currentWebDevThreadId}
            isDarkMode={isDarkMode}
            selectedModel={selectedModel}
            isThinkingEnabled={isThinkingEnabled}
            webDevPanelWidth={webDevPanelWidth}
            setProjects={setWebDevProjects}
            setCurrentProjectId={setCurrentWebDevProjectId}
            onNewProject={handleNewWebDevProject}
            onSelectModel={selectModelForNextMessage}
            onToggleThinking={toggleThinkingForNextMessage}
            onPanelWidthChange={setWebDevPanelWidth}
            onPreviewAttachment={setPreviewAttachment}
          />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {workspaceMode === "web-dev" ? null : workspaceMode === "command-center" ? (
            <motion.div
              key="command-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="contents"
            >
              <CommandCenterWorkspace
                initialSection={routeState.mode === "command-center" ? routeState.section : "tasks"}
                selectedItemId={routeState.mode === "command-center" ? routeState.itemId : null}
                onOpenChatSession={(chatId) => selectChat(chatId)}
              />
            </motion.div>
          ) : workspaceMode === "characters" ? (
            <motion.div
              key="characters"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="contents"
            >
              <CharacterWorkspace
                characters={characters}
                sessions={characterSessions}
                currentSessionId={currentCharacterSessionId}
                setCharacters={setCharacters}
                setSessions={setCharacterSessions}
                setCurrentSessionId={(sessionId) => {
                  setCurrentCharacterSessionId(sessionId);
                  navigateToCharacters(sessionId);
                }}
                selectedModel={selectedModel}
                selectedStyle={selectedStyle}
                isThinkingEnabled={isThinkingEnabled}
                isWebSearchEnabled={isWebSearchEnabled}
                isDeepResearchEnabled={isDeepResearchEnabled}
                imageSettings={imageSettings}
                onSelectModel={selectModelForNextMessage}
                onSelectStyle={selectStyleForNextMessage}
                onToggleThinking={toggleThinkingForNextMessage}
                onToggleWebSearch={toggleWebSearchForNextMessage}
                onToggleDeepResearch={toggleDeepResearchForNextMessage}
                onImageSettingsChange={setImageSettings}
                onPreviewAttachment={setPreviewAttachment}
              />
            </motion.div>
          ) : isLandingChat ? (
            <motion.main
              key="landing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              className="flex-1 overflow-y-auto px-3 sm:px-4"
            >
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="mx-auto flex min-h-full w-full max-w-[46rem] flex-col justify-center pb-[14vh] pt-16 sm:pb-[18vh]"
              >
                <div className="mb-6 text-center sm:mb-7">
                  <h1 className="font-display text-[2rem] font-medium leading-tight text-[var(--privora-text)] sm:text-[2.4rem]">
                    How can I help today?
                  </h1>
                </div>
                {renderComposer("landing")}
              </motion.div>
            </motion.main>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="contents"
            >
              <ChatViewport
                messages={messages}
                isTyping={isTyping}
                chatScrollRef={chatScrollRef}
                messagesEndRef={messagesEndRef}
                onScroll={handleChatScroll}
                showScrollToLatest={showScrollToLatest}
                onScrollToLatest={() => scrollToBottom("smooth")}
                onEditMessage={handleEditMessage}
                onRetryMessage={handleRetryMessage}
                onStartResearchPlan={startResearchPlan}
                onEditResearchPlan={editResearchPlan}
                onCancelResearchPlan={cancelResearchPlan}
                onStopResearchPlan={stopGeneration}
                onEditGeneratedImage={handleEditGeneratedImage}
                onOpenResearchActivity={() => setIsResearchActivityOpen(true)}
                onOpenArtifact={(artifactId) => {
                  setIsChatPlaygroundOpen(false);
                  setActiveArtifactId(artifactId);
                }}
                onOpenCommandTarget={openCommandTarget}
                onUndoCommandAction={(messageId, actionId) => void undoCommandAction(messageId, actionId)}
                onUndoCommandSession={(messageId) => void undoCommandMessageSession(messageId)}
                onRedoCommandSession={(messageId) => void redoCommandMessageSession(messageId)}
                onConfirmCommandAction={(messageId, actionId) => void confirmCommandAction(messageId, actionId)}
                onUpdateDuplicateCommandAction={(messageId, actionId) => void updateDuplicateCommandAction(messageId, actionId)}
                onFindAlternativeCommandAction={(messageId, actionId) => void findAlternativeCommandAction(messageId, actionId)}
                onConfirmAllCommandActions={(messageId) => void confirmAllCommandActions(messageId)}
                onCancelCommandAction={(messageId, actionId) => void cancelCommandAction(messageId, actionId)}
                onOpenCodePlayground={openCodeInChatPlayground}
                onPreviewAttachment={setPreviewAttachment}
              />
              {renderComposer("footer")}
            </motion.div>
          )}
        </AnimatePresence>

      <RenameChatModal
        isOpen={Boolean(renameTarget)}
        title={renameTitle}
        inputRef={renameInputRef}
        onTitleChange={setRenameTitle}
        onClose={closeRenameDialog}
        onSubmit={submitRenameChat}
        heading={renameTarget?.kind === "web-dev" ? "Rename web app" : "Rename chat"}
        placeholder={renameTarget?.kind === "web-dev" ? "Web app title" : "Chat title"}
      />

      <SearchModal
        isOpen={isSearchModalOpen}
        chats={chats}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        onClose={() => setIsSearchModalOpen(false)}
        onSelectChat={(chatId) => {
          selectChat(chatId);
          setIsSearchModalOpen(false);
        }}
      />

      <AttachmentPreviewModal
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />

      <ResearchActivityPanel
        isOpen={isResearchActivityOpen && Boolean(activeResearchMessage?.researchPlan)}
        title={activeResearchMessage?.researchPlan?.title}
        plan={activeResearchMessage?.researchPlan}
        activity={activeResearchMessage?.researchActivity}
        onClose={() => setIsResearchActivityOpen(false)}
      />

      <ChatCodePlaygroundPanel
        isOpen={workspaceMode === "chat" && isChatPlaygroundOpen}
        isDarkMode={isDarkMode}
        width={chatPlaygroundWidth}
        payload={chatPlaygroundPayload}
        onWidthChange={setChatPlaygroundWidth}
        onClose={closeChatPlayground}
      />

      <CanvasPanel
        isOpen={workspaceMode === "chat" && Boolean(activeArtifact)}
        artifact={activeArtifact}
        isDarkMode={isDarkMode}
        width={canvasWidth}
        onWidthChange={setCanvasWidth}
        onClose={() => setActiveArtifactId(null)}
        onCopy={() => activeArtifact ? copyArtifactContent(activeArtifact.content) : Promise.resolve()}
        onDownload={() => activeArtifact && downloadArtifactContent(activeArtifact.title, activeArtifact.kind, activeArtifact.content, activeArtifact.language)}
      />

    </div>
  </div>
);
}

