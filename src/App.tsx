// @refresh reset
import { setupConnect } from "@webcontainer/api/connect";
import { useState, useRef, useEffect, useMemo, type ChangeEvent, type ClipboardEvent, type CSSProperties } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { PanelLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AttachmentPreviewModal } from "./features/attachments/components/AttachmentPreviewModal";
import { ChatComposer } from "./features/chat/components/ChatComposer";
import { ResearchActivityPanel } from "./features/chat/components/ResearchActivityPanel";
import { CanvasPanel } from "./features/artifacts/components/CanvasPanel";
import { ChatSidebar } from "./features/chat/components/ChatSidebar";
import { ChatViewport } from "./features/chat/components/ChatViewport";
import { RenameChatModal } from "./features/chat/components/RenameChatModal";
import { SearchModal } from "./features/chat/components/SearchModal";
import { WebDevWorkspace } from "./features/webdev/components/WebDevWorkspace";
import { CharacterWorkspace } from "./features/characters/components/CharacterWorkspace";
import { getModelOption } from "./lib/models";
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
import { DEFAULT_MODEL_ID, loadUiSettings, saveUiSettings, type ImageSettings } from "./lib/settings";
import type { ResponseStyleId } from "./lib/prompt";
import {
  createChat,
  createId,
  deleteChatFromDb,
  loadArtifactsForChat,
  updateChatMeta,
  type ArtifactRecord,
  type CharacterRecord,
  type CharacterSessionRecord,
  type ChatMessageRecord,
  type ChatRecord,
  type WebDevProjectRecord,
} from "./lib/db";
import { copyArtifactContent, downloadArtifactContent } from "./lib/artifacts";
import { createWebDevProject, deleteWebDevProject, loadWebDevProjects, updateWebDevProject } from "./features/webdev/lib/storage";
import { deleteCharacterSession, loadCharacterSessions, loadCharacters } from "./features/characters/lib/storage";

type Message = ChatMessageRecord;
type Chat = ChatRecord;
type WorkspaceMode = "chat" | "web-dev" | "characters";
type AppRouteState =
  | { mode: "chat"; chatId: string | null }
  | { mode: "web-dev"; projectId: string | null }
  | { mode: "characters"; sessionId: string | null; view: "home" | "library" };

const CHAT_BOTTOM_THRESHOLD_PX = 128;
const isWebContainerConnectRoute =
  typeof window !== "undefined" && window.location.pathname.startsWith("/webcontainer/connect/");

const parseAppRoute = (pathname: string, fallbackMode: WorkspaceMode): AppRouteState => {
  const parts = pathname.split("/").filter(Boolean);
  const [modeSegment, idSegment] = parts;

  if (modeSegment === "web-dev") {
    return { mode: "web-dev", projectId: idSegment || null };
  }

  if (modeSegment === "characters") {
    if (idSegment === "library") return { mode: "characters", sessionId: null, view: "library" };
    return { mode: "characters", sessionId: idSegment || null, view: "home" };
  }

  if (modeSegment === "chat") {
    return { mode: "chat", chatId: idSegment || null };
  }

  if (fallbackMode === "web-dev") return { mode: "web-dev", projectId: null };
  if (fallbackMode === "characters") return { mode: "characters", sessionId: null, view: "home" };
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
  const [currentWebDevProjectId, setCurrentWebDevProjectId] = useState<string | null>(null);
  const [isWebDevStorageReady, setIsWebDevStorageReady] = useState(false);
  const [characters, setCharacters] = useState<CharacterRecord[]>([]);
  const [characterSessions, setCharacterSessions] = useState<CharacterSessionRecord[]>([]);
  const [currentCharacterSessionId, setCurrentCharacterSessionId] = useState<string | null>(null);
  const [isCharactersStorageReady, setIsCharactersStorageReady] = useState(false);
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(600);
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
  const [composerMode, setComposerMode] = useState<"chat" | "image">(initialUiSettingsRef.current.composerMode);
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
  const chatsRef = useLatestRef(chats);
  const messagesRef = useLatestRef(messages);
  const currentChatIdRef = useLatestRef(currentChatId);
  const isTypingRef = useLatestRef(isTyping);
  const selectedModelRef = useLatestRef(selectedModel);
  const selectedStyleRef = useLatestRef(selectedStyle);
  const isThinkingEnabledRef = useLatestRef(isThinkingEnabled);
  const isWebSearchEnabledRef = useLatestRef(isWebSearchEnabled);
  const isDeepResearchEnabledRef = useLatestRef(isDeepResearchEnabled);
  const imageSettingsRef = useLatestRef(imageSettings);

  useEffect(() => {
    if (!renameTarget) return;

    window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  }, [renameTarget]);

  useEffect(() => {
    if (getModelOption(selectedModel)) return;
    selectedModelRef.current = DEFAULT_MODEL_ID;
    setSelectedModel(DEFAULT_MODEL_ID);
  }, [selectedModel, selectedModelRef]);

  useEffect(() => {
    saveUiSettings({
      workspaceMode,
      selectedModel,
      selectedStyle,
      isThinkingEnabled,
      isWebSearchEnabled,
      isDeepResearchEnabled,
      isDarkMode,
      composerMode,
      imageSettings,
    });
  }, [workspaceMode, selectedModel, selectedStyle, isThinkingEnabled, isWebSearchEnabled, isDeepResearchEnabled, isDarkMode, composerMode, imageSettings]);

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
      isWebSearchEnabledRef.current = true;
      setIsWebSearchEnabled(true);
    } else {
      clearCurrentPendingResearchIntent();
    }
  };

  const selectComposerMode = (mode: "chat" | "image") => {
    setComposerMode(mode);
    if (mode === "image") {
      isWebSearchEnabledRef.current = false;
      isDeepResearchEnabledRef.current = false;
      setIsWebSearchEnabled(false);
      setIsDeepResearchEnabled(false);
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

  const handleChatScroll = () => {
    const isNearBottom = isNearChatBottom();
    if (isScrollingToLatestRef.current && !isNearBottom) return;

    shouldAutoScrollRef.current = isNearBottom;
    setShowScrollToLatest(messagesRef.current.length > 0 && !isNearBottom);
  };

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

  const upsertArtifactInState = (artifact: ArtifactRecord) => {
    setArtifacts(prev => {
      const exists = prev.some(item => item.id === artifact.id);
      const next = exists ? prev.map(item => item.id === artifact.id ? artifact : item) : [artifact, ...prev];
      return next.sort((a, b) => b.updatedAt - a.updatedAt);
    });
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

  const navigateToWebDevProject = (projectId?: string | null, replace = false) => {
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

  const navigateToWorkspaceMode = (mode: WorkspaceMode) => {
    if (mode === "web-dev") {
      setActiveArtifactId(null);
      navigateToWebDevProject(currentWebDevProjectId);
      return;
    }

    if (mode === "characters") {
      setActiveArtifactId(null);
      navigateToCharacters(currentCharacterSessionId);
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
    const { project } = await createWebDevProject("New web app", selectedModelRef.current);
    setWebDevProjects(prev => [project, ...prev]);
    setCurrentWebDevProjectId(project.id);
    navigateToWebDevProject(project.id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const selectWebDevProject = (id: string) => {
    setCurrentWebDevProjectId(id);
    navigateToWebDevProject(id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
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
      return;
    }

    const project = webDevProjects.find(item => item.id === routeState.projectId);
    if (project) {
      if (currentWebDevProjectId !== project.id) setCurrentWebDevProjectId(project.id);
    } else if (isWebDevStorageReady) {
      navigateToWebDevProject(null, true);
    }
  }, [workspaceMode, routeState, webDevProjects, currentWebDevProjectId, isWebDevStorageReady]);

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
    imageSettingsRef,
    messagesRef,
    chatsRef,
    abortControllerRef,
    shouldAutoScrollRef,
    textareaRef,
    isNearChatBottom,
    onArtifactUpsert: upsertArtifactInState,
    onArtifactOpen: setActiveArtifactId,
  });

  const isLandingChat = messages.length === 0;
  const activeResearchMessage = [...messages].reverse().find(message => message.researchPlan || message.researchActivity?.length);
  const editingResearchPlanMessage = [...messages].reverse().find(message => message.researchPlan?.status === "editing");

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
      selectedModel={selectedModel}
      selectedStyle={selectedStyle}
      isThinkingEnabled={isThinkingEnabled}
      isWebSearchEnabled={isWebSearchEnabled}
      isDeepResearchEnabled={isDeepResearchEnabled}
      composerMode={composerMode}
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
      onSelectComposerMode={selectComposerMode}
      onImageSettingsChange={setImageSettings}
      onSelectModel={selectModelForNextMessage}
      onSelectStyle={selectStyleForNextMessage}
      onStopGeneration={stopGeneration}
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
        characters={characters}
        characterSessions={characterSessions}
        currentChatId={currentChatId}
        currentWebDevProjectId={currentWebDevProjectId}
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
        onNewCharacterSession={handleNewCharacterSession}
        onSearchOpen={() => setIsSearchModalOpen(true)}
        onSelectChat={selectChat}
        onSelectWebDevProject={selectWebDevProject}
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
        style={{ "--privora-canvas-offset": workspaceMode === "chat" && activeArtifact ? `${canvasWidth}px` : "0px" } as CSSProperties}
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

        <AnimatePresence mode="wait" initial={false}>
          {workspaceMode === "web-dev" ? (
            <motion.div
              key="web-dev"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="contents"
            >
              <WebDevWorkspace
                projects={webDevProjects}
                currentProjectId={currentWebDevProjectId}
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
                onOpenArtifact={setActiveArtifactId}
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

