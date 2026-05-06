// @refresh reset
import { useState, useRef, useEffect } from "react";
import { PanelLeft } from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import { AttachmentPreviewModal } from "./features/attachments/components/AttachmentPreviewModal";
import { ChatComposer } from "./features/chat/components/ChatComposer";
import { ResearchActivityPanel } from "./features/chat/components/ResearchActivityPanel";
import { ChatSidebar } from "./features/chat/components/ChatSidebar";
import { ChatViewport } from "./features/chat/components/ChatViewport";
import { RenameChatModal } from "./features/chat/components/RenameChatModal";
import { SearchModal } from "./features/chat/components/SearchModal";
import { getModelOption } from "./lib/models";
import { appLogger } from "./lib/logger";
import { useChatStorage } from "./features/chat/hooks/useChatStorage";
import { useLatestRef } from "./hooks/useLatestRef";
import { useRootDarkMode } from "./hooks/useRootDarkMode";
import { useTextareaAutosize } from "./hooks/useTextareaAutosize";
import { useViewportCssVars } from "./hooks/useViewportCssVars";
import { useChatGeneration } from "./features/chat/hooks/useChatGeneration";
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
  type Attachment,
} from "./lib/attachments";
import { loadUiSettings, saveUiSettings } from "./lib/settings";
import type { ResponseStyleId } from "./lib/prompt";
import {
  createChat,
  createId,
  deleteChatFromDb,
  updateChatMeta,
  type ChatMessageRecord,
  type ChatRecord,
} from "./lib/db";

type Message = ChatMessageRecord;
type Chat = ChatRecord;

export default function App() {
  const initialUiSettingsRef = useRef(loadUiSettings());
  const [messages, setMessages] = useState<Message[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
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
  const [isResearchActivityOpen, setIsResearchActivityOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [renameChatId, setRenameChatId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const chatScrollRef = useRef<HTMLElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const chatsRef = useLatestRef(chats);
  const messagesRef = useLatestRef(messages);
  const currentChatIdRef = useLatestRef(currentChatId);
  const isTypingRef = useLatestRef(isTyping);
  const selectedModelRef = useLatestRef(selectedModel);
  const selectedStyleRef = useLatestRef(selectedStyle);
  const isThinkingEnabledRef = useLatestRef(isThinkingEnabled);
  const isWebSearchEnabledRef = useLatestRef(isWebSearchEnabled);
  const isDeepResearchEnabledRef = useLatestRef(isDeepResearchEnabled);

  useEffect(() => {
    if (!renameChatId) return;

    window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
  }, [renameChatId]);

  useEffect(() => {
    saveUiSettings({
      selectedModel,
      selectedStyle,
      isThinkingEnabled,
      isWebSearchEnabled,
      isDeepResearchEnabled,
      isDarkMode,
    });
  }, [selectedModel, selectedStyle, isThinkingEnabled, isWebSearchEnabled, isDeepResearchEnabled, isDarkMode]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      appLogger.warn("Attachment selection exceeded count limit", {
        existingCount: attachments.length,
        selectedCount: files.length,
        maxAttachments: MAX_ATTACHMENTS,
      });
      alert(`You can attach up to ${MAX_ATTACHMENTS} files at once.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const selectedProvider = getModelOption(selectedModelRef.current)?.provider;
    const newAttachments: Attachment[] = [];
    for (let i = 0; i < files.length; i++) {
       const file = files[i];

       if (selectedProvider === "cliproxy" && !isCliproxySupportedAttachment({ mimeType: file.type, name: file.name })) {
          appLogger.warn("Unsupported CLIProxy attachment rejected", {
            mimeType: file.type || "unknown",
            extension: getAttachmentExtension(file.name),
            size: file.size,
          });
          alert(`GPT-5.5 supports images plus common PDF/text/code/Office files here. "${file.name}" is not supported.`);
          continue;
       }

       if (selectedProvider === "gemini" && !isGeminiSupportedAttachment({ mimeType: file.type, name: file.name })) {
          appLogger.warn("Unsupported Gemini attachment rejected", {
            mimeType: file.type || "unknown",
            extension: getAttachmentExtension(file.name),
            size: file.size,
          });
          alert(`Gemini supports images, PDFs, and common text/code files here. "${file.name}" is not supported.`);
          continue;
       }

       if (selectedProvider === "gemini" && getAttachmentTotalSize([...attachments, ...newAttachments]) + file.size > GEMINI_MAX_INLINE_PAYLOAD_BYTES) {
          appLogger.warn("Gemini attachment payload limit exceeded", {
            attemptedSize: getAttachmentTotalSize([...attachments, ...newAttachments]) + file.size,
            maxSize: GEMINI_MAX_INLINE_PAYLOAD_BYTES,
          });
          alert(`Gemini inline uploads are kept under 20 MB in this app. "${file.name}" would go over the limit.`);
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
          alert(error instanceof Error ? error.message : `Could not read ${file.name}.`);
       }
    }

    if (selectedProvider === "cliproxy") {
      const validationError = validateCliproxyAttachments([...attachments, ...newAttachments]);
      if (validationError) {
        newAttachments.forEach(revokeAttachmentUrl);
        appLogger.warn("CLIProxy attachment validation failed", {
          attachmentCount: attachments.length + newAttachments.length,
          totalSize: getAttachmentTotalSize([...attachments, ...newAttachments]),
        });
        alert(validationError);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
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
        alert(validationError);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    setAttachments(prev => [...prev, ...newAttachments]);
    appLogger.debug("Attachments added", {
      provider: selectedProvider || "unknown",
      addedCount: newAttachments.length,
      totalCount: attachments.length + newAttachments.length,
      totalSize: getAttachmentTotalSize([...attachments, ...newAttachments]),
    });
    if (fileInputRef.current) {
       fileInputRef.current.value = "";
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
    isDeepResearchEnabledRef.current = nextValue;
    setIsDeepResearchEnabled(nextValue);
    if (nextValue) {
      isWebSearchEnabledRef.current = true;
      setIsWebSearchEnabled(true);
    } else {
      clearCurrentPendingResearchIntent();
    }
  };

  const isNearChatBottom = () => {
    const scroller = chatScrollRef.current;
    if (!scroller) return true;

    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 96;
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const scroller = chatScrollRef.current;
    if (!scroller) return;

    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior,
    });
  };

  const handleChatScroll = () => {
    shouldAutoScrollRef.current = isNearChatBottom();
  };

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom(isTyping ? "auto" : "smooth");
    }
  }, [messages, isTyping]);

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
    await createChat(newChat);
  };

  const selectChat = (id: string) => {
    const chat = chats.find(c => c.id === id);
    if (chat) {
      setCurrentChatId(id);
      setMessages(chat.messages);
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
    setRenameChatId(null);
    setRenameTitle("");
  };

  const renameChat = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const chat = chatsRef.current.find(c => c.id === id);
    if (!chat) return;
    setRenameChatId(id);
    setRenameTitle(chat.title);
    setActiveMenuId(null);
  };

  const submitRenameChat = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!renameChatId) return;

    const title = renameTitle.trim();
    if (!title) {
      renameInputRef.current?.focus();
      return;
    }

    const chatId = renameChatId;
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, title, updatedAt: Date.now() } : c));
    await updateChatMeta(chatId, { title });
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
        selectChat(updatedChats[0].id);
      } else {
        await handleNewChat();
      }
    }
    setActiveMenuId(null);
  };

  useEffect(() => {
    if (isStorageReady && !currentChatId) {
      handleNewChat();
    }
  }, [selectedModel, isStorageReady, currentChatId]);

  const {
    handleEditMessage,
    handleKeyDown,
    handleRetryMessage,
    startResearchPlan,
    resumeResearchJob,
    editResearchPlan,
    cancelResearchPlan,
    handleSubmit,
    stopGeneration,
  } = useChatGeneration({
    input,
    messages,
    attachments,
    setInput,
    setAttachments,
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
    messagesRef,
    chatsRef,
    abortControllerRef,
    shouldAutoScrollRef,
    textareaRef,
    isNearChatBottom,
  });

  const isLandingChat = messages.length === 0;
  const activeResearchMessage = [...messages].reverse().find(message => message.researchPlan || message.researchActivity?.length);

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
      textareaRef={textareaRef}
      fileInputRef={fileInputRef}
      onInputChange={setInput}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      onFileSelect={handleFileSelect}
      onPreviewAttachment={setPreviewAttachment}
      onRemoveAttachment={removeAttachment}
      onToggleThinking={toggleThinkingForNextMessage}
      onToggleWebSearch={toggleWebSearchForNextMessage}
      onToggleDeepResearch={toggleDeepResearchForNextMessage}
      onSelectModel={selectModelForNextMessage}
      onSelectStyle={selectStyleForNextMessage}
      onStopGeneration={stopGeneration}
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
        chats={chats}
        currentChatId={currentChatId}
        isTyping={isTyping}
        isDarkMode={isDarkMode}
        activeMenuId={activeMenuId}
        onOpenChange={setIsSidebarOpen}
        onNewChat={handleNewChat}
        onSearchOpen={() => setIsSearchModalOpen(true)}
        onSelectChat={selectChat}
        onChatRowKeyDown={handleChatRowKeyDown}
        onActiveMenuChange={setActiveMenuId}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        onToggleStarChat={toggleStarChat}
        onRenameChat={renameChat}
        onDeleteChat={deleteChat}
      />

      {/* Main Content Area */}
      <div className="flex-1 relative flex flex-col min-w-0 h-full overflow-hidden">
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

        <LayoutGroup>
          <AnimatePresence mode="popLayout" initial={false}>
            {isLandingChat ? (
              <motion.main
                key="landing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex-1 overflow-y-auto px-3 sm:px-4"
              >
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
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
              <motion.div key="chat" className="contents">
                <ChatViewport
                  messages={messages}
                  isTyping={isTyping}
                  chatScrollRef={chatScrollRef}
                  messagesEndRef={messagesEndRef}
                  onScroll={handleChatScroll}
                  onEditMessage={handleEditMessage}
                  onRetryMessage={handleRetryMessage}
                  onStartResearchPlan={startResearchPlan}
                  onEditResearchPlan={editResearchPlan}
                  onCancelResearchPlan={cancelResearchPlan}
                  onStopResearchPlan={stopGeneration}
                  onOpenResearchActivity={() => setIsResearchActivityOpen(true)}
                  onPreviewAttachment={setPreviewAttachment}
                />
                {renderComposer("footer")}
              </motion.div>
            )}
          </AnimatePresence>
        </LayoutGroup>

      <RenameChatModal
        isOpen={Boolean(renameChatId)}
        title={renameTitle}
        inputRef={renameInputRef}
        onTitleChange={setRenameTitle}
        onClose={closeRenameDialog}
        onSubmit={submitRenameChat}
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

    </div>
  </div>
);
}
