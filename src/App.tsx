import { useState, useRef, useEffect } from "react";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { Plus, Moon, Sun, Square, ChevronDown, PanelLeft, MessageCircle, Trash2, MoreHorizontal, Pencil, Star, Brain, Paperclip, Camera, FolderPlus, Blocks, Workflow, Globe, Feather, Search } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ChatMessage } from "./components/ChatMessage";
import { getModelOption, getModelLabel, getReasoningModeLabel, isCliproxyModel, isGeminiModel, modelOptions } from "./lib/models";
import { streamCliproxyResponse } from "./lib/cliproxy/responses";
import {
  createChat,
  createId,
  deleteChatFromDb,
  loadChats,
  migrateLocalStorageChats,
  normalizeMessage,
  replaceChatMessages,
  updateChatMeta,
  type AttachmentRecord,
  type ChatMessageRecord,
  type ChatRecord,
} from "./lib/db";

export type Attachment = AttachmentRecord;
type Message = ChatMessageRecord;
type Chat = ChatRecord;

// Initialize the API only once outside the component
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const SETTINGS_STORAGE_KEY = "privora-ui-settings";
const DEFAULT_MODEL_ID = "gemini-3.1-flash-lite-preview";
const MAX_ATTACHMENTS = 15;
const CLIPROXY_MAX_ATTACHMENT_PAYLOAD_BYTES = 50 * 1024 * 1024;
const GEMINI_MAX_INLINE_PAYLOAD_BYTES = 20 * 1024 * 1024;
const CLIPROXY_VISION_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const CLIPROXY_FILE_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/csv",
  "text/tsv",
  "application/json",
  "text/html",
  "text/css",
  "text/javascript",
  "application/javascript",
  "application/typescript",
  "text/x-typescript",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/rtf",
  "text/rtf",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const CLIPROXY_FILE_EXTENSIONS = new Set([
  "pdf", "txt", "md", "markdown", "json", "html", "htm", "xml", "csv", "tsv",
  "doc", "docx", "rtf", "odt", "ppt", "pptx", "xls", "xlsx",
  "js", "jsx", "ts", "tsx", "py", "java", "cs", "cpp", "c", "css", "sql",
  "log", "yml", "yaml", "toml", "ini", "sh", "bat", "ps1", "dart", "go", "rs",
]);
const GEMINI_ATTACHMENT_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/html",
  "text/xml",
  "application/xml",
  "application/json",
  "text/csv",
  "application/csv",
]);
const GEMINI_ATTACHMENT_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "webp", "heic", "heif", "pdf", "txt", "md", "markdown",
  "html", "htm", "xml", "json", "csv", "tsv", "js", "jsx", "ts", "tsx", "py",
  "java", "cs", "cpp", "c", "css", "sql", "log", "yml", "yaml", "toml", "ini",
  "sh", "bat", "ps1", "dart", "go", "rs",
]);
const GEMINI_ATTACHMENT_ACCEPT =
  "image/*,application/pdf,text/plain,text/markdown,text/csv,application/json,.md,.csv,.json,.ts,.tsx,.js,.jsx,.py,.java,.cs,.cpp,.c,.html,.css";
const CLIPROXY_ATTACHMENT_ACCEPT =
  ".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.md,.markdown,.json,.html,.htm,.xml,.csv,.tsv,.doc,.docx,.rtf,.odt,.ppt,.pptx,.xls,.xlsx,.js,.jsx,.ts,.tsx,.py,.java,.cs,.cpp,.c,.css,.sql,.log,.yml,.yaml,.toml,.ini,.sh,.bat,.ps1,.dart,.go,.rs";

interface UiSettings {
  selectedModel: string;
  isThinkingEnabled: boolean;
  isWebSearchEnabled: boolean;
  isDarkMode: boolean;
}

const defaultUiSettings: UiSettings = {
  selectedModel: DEFAULT_MODEL_ID,
  isThinkingEnabled: false,
  isWebSearchEnabled: false,
  isDarkMode: false,
};

const loadUiSettings = (): UiSettings => {
  try {
    const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!rawSettings) return defaultUiSettings;

    const parsedSettings = JSON.parse(rawSettings) as Partial<UiSettings>;
    const selectedModel = modelOptions.some(option => option.id === parsedSettings.selectedModel)
      ? parsedSettings.selectedModel!
      : DEFAULT_MODEL_ID;

    return {
      selectedModel,
      isThinkingEnabled: Boolean(parsedSettings.isThinkingEnabled),
      isWebSearchEnabled: Boolean(parsedSettings.isWebSearchEnabled),
      isDarkMode: Boolean(parsedSettings.isDarkMode),
    };
  } catch {
    return defaultUiSettings;
  }
};

const saveUiSettings = (settings: UiSettings) => {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
};

const SYSTEM_INSTRUCTION = `You are Privora, an incredibly engaging, empathetic, and human-like conversational partner. 
Crucial Rules:
1. DO NOT sound like a typical AI or virtual assistant. (e.g., skip phrases like "How can I help you today?", "As an AI...", "I understand...").
2. Use natural phrasing, occasional mild conversational fillers (like "hmm," "well," "to be honest"), and contractions. 
3. Show warmth, humor, and curiosity. React emotionally to what the user says.
4. Have opinions, preferences, and a distinct personality. Express your thoughts genuinely.
5. Keep answers concise, snappy, and conversational unless a deeper dive is explicitly requested. Do not write essays.
6. Don't constantly ask follow-up questions at the end of every single message unless it makes natural conversational sense.
7. Treat this like texting a good, articulate friend.
8. Smartly and naturally use emojis in your responses to convey emotion and tone, just like a real person would.
9. Vision & File Capabilities: You fully support multi-modal inputs. You can seamlessly process multiple images, PDFs, and text files simultaneously in a single prompt. Analyze attached images to identify objects, read text, describe scenes, or interpret data contextually. Speak naturally about what you "see" or "read" in the files provided by the user.
10. Markdown & Math Formatting: Use clean GitHub-flavored Markdown. For math, use valid LaTeX only: inline math as \\(...\\) and display math as \\[...\\]. Do not mix raw $ delimiters into normal sentences. Keep equations on their own lines when they are long. For cases/piecewise expressions, use \\begin{cases} ... \\end{cases} inside display math. For code, always use fenced code blocks with a language name.`;

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
  const [isThinkingEnabled, setIsThinkingEnabled] = useState(initialUiSettingsRef.current.isThinkingEnabled);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(initialUiSettingsRef.current.isWebSearchEnabled);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const selectedModelOption = getModelOption(selectedModel);
  const selectedModelLabel = getModelLabel(selectedModel);
  const selectedReasoningModeLabel = getReasoningModeLabel(selectedModelOption?.provider, isThinkingEnabled ? "thinking" : "instant");
  const selectedModelIsGemini = isGeminiModel(selectedModel);
  const selectedModelIsCliproxy = isCliproxyModel(selectedModel);
  const chatScrollRef = useRef<HTMLElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const chatsRef = useRef<Chat[]>([]);
  const messagesRef = useRef<Message[]>([]);
  const currentChatIdRef = useRef<string | null>(null);
  const isTypingRef = useRef(false);
  const selectedModelRef = useRef(selectedModel);
  const isThinkingEnabledRef = useRef(isThinkingEnabled);
  const isWebSearchEnabledRef = useRef(isWebSearchEnabled);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    currentChatIdRef.current = currentChatId;
  }, [currentChatId]);

  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);

  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  useEffect(() => {
    isThinkingEnabledRef.current = isThinkingEnabled;
  }, [isThinkingEnabled]);

  useEffect(() => {
    isWebSearchEnabledRef.current = isWebSearchEnabled;
  }, [isWebSearchEnabled]);

  useEffect(() => {
    saveUiSettings({
      selectedModel,
      isThinkingEnabled,
      isWebSearchEnabled,
      isDarkMode,
    });
  }, [selectedModel, isThinkingEnabled, isWebSearchEnabled, isDarkMode]);

  const getAttachmentSize = (attachment: Attachment) => {
    if (typeof attachment.size === "number") return attachment.size;
    return Math.ceil((attachment.base64.length * 3) / 4);
  };

  const getAttachmentTotalSize = (items: Attachment[]) =>
    items.reduce((total, attachment) => total + getAttachmentSize(attachment), 0);

  const getAttachmentExtension = (name: string) => name.split(".").pop()?.toLowerCase() || "";

  const isCliproxySupportedAttachment = (attachment: Pick<Attachment, "mimeType" | "name">) =>
    CLIPROXY_VISION_MIME_TYPES.has(attachment.mimeType) ||
    CLIPROXY_FILE_MIME_TYPES.has(attachment.mimeType) ||
    CLIPROXY_FILE_EXTENSIONS.has(getAttachmentExtension(attachment.name));

  const isGeminiSupportedAttachment = (attachment: Pick<Attachment, "mimeType" | "name">) =>
    attachment.mimeType.startsWith("image/") ||
    GEMINI_ATTACHMENT_MIME_TYPES.has(attachment.mimeType) ||
    GEMINI_ATTACHMENT_EXTENSIONS.has(getAttachmentExtension(attachment.name));

  const validateCliproxyAttachments = (items: Attachment[]) => {
    const unsupported = items.find(attachment => !isCliproxySupportedAttachment(attachment));
    if (unsupported) {
      return `GPT-5.5 through CLIProxy supports images and common document/text/code files. Remove "${unsupported.name}" or switch to Gemini for this file type.`;
    }

    if (getAttachmentTotalSize(items) > CLIPROXY_MAX_ATTACHMENT_PAYLOAD_BYTES) {
      return "GPT file input is limited to 50 MB total per request in this app. Remove or compress one file.";
    }

    return null;
  };

  const validateGeminiAttachments = (items: Attachment[]) => {
    const unsupported = items.find(attachment => !isGeminiSupportedAttachment(attachment));
    if (unsupported) {
      return `Gemini supports images, PDFs, and common text/code files here. Remove "${unsupported.name}" or convert it to PDF/text first.`;
    }

    if (getAttachmentTotalSize(items) > GEMINI_MAX_INLINE_PAYLOAD_BYTES) {
      return "Gemini inline uploads are kept under 20 MB in this app. Use smaller files for now.";
    }

    return null;
  };

  const readFileAsAttachment = (file: File) =>
    new Promise<Attachment>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result !== "string") {
          reject(new Error(`Could not read ${file.name}.`));
          return;
        }

        resolve({
          url: URL.createObjectURL(file),
          base64: result.split(",")[1] || "",
          mimeType: file.type || "application/octet-stream",
          name: file.name,
          size: file.size,
        });
      };
      reader.readAsDataURL(file);
    });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      alert(`You can attach up to ${MAX_ATTACHMENTS} files at once.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const selectedProvider = getModelOption(selectedModelRef.current)?.provider;
    const newAttachments: Attachment[] = [];
    for (let i = 0; i < files.length; i++) {
       const file = files[i];

       if (selectedProvider === "cliproxy" && !isCliproxySupportedAttachment({ mimeType: file.type, name: file.name })) {
          alert(`GPT-5.5 supports images plus common PDF/text/code/Office files here. "${file.name}" is not supported.`);
          continue;
       }

       if (selectedProvider === "gemini" && !isGeminiSupportedAttachment({ mimeType: file.type, name: file.name })) {
          alert(`Gemini supports images, PDFs, and common text/code files here. "${file.name}" is not supported.`);
          continue;
       }

       if (selectedProvider === "gemini" && getAttachmentTotalSize([...attachments, ...newAttachments]) + file.size > GEMINI_MAX_INLINE_PAYLOAD_BYTES) {
          alert(`Gemini inline uploads are kept under 20 MB in this app. "${file.name}" would go over the limit.`);
          continue;
       }

       try {
          newAttachments.push(await readFileAsAttachment(file));
       } catch (error) {
          alert(error instanceof Error ? error.message : `Could not read ${file.name}.`);
       }
    }

    if (selectedProvider === "cliproxy") {
      const validationError = validateCliproxyAttachments([...attachments, ...newAttachments]);
      if (validationError) {
        newAttachments.forEach(attachment => URL.revokeObjectURL(attachment.url));
        alert(validationError);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    if (selectedProvider === "gemini") {
      const validationError = validateGeminiAttachments([...attachments, ...newAttachments]);
      if (validationError) {
        newAttachments.forEach(attachment => URL.revokeObjectURL(attachment.url));
        alert(validationError);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    setAttachments(prev => [...prev, ...newAttachments]);
    if (fileInputRef.current) {
       fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
       const newArr = [...prev];
       URL.revokeObjectURL(newArr[index].url);
       newArr.splice(index, 1);
       return newArr;
    });
  };

  // Local persistence is handled by IndexedDB. localStorage is only read once for legacy migration.
  useEffect(() => {
    let isMounted = true;

    const initializeStorage = async () => {
      try {
        await migrateLocalStorageChats();
        const storedChats = await loadChats();

        if (!isMounted) return;

        setChats(storedChats);
        if (storedChats.length > 0) {
          setCurrentChatId(storedChats[0].id);
          setMessages(storedChats[0].messages);
        }
      } catch (error) {
        console.error("Failed to load local chat database", error);
      } finally {
        if (isMounted) {
          setIsStorageReady(true);
        }
      }
    };

    initializeStorage();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [input]);
  
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);
  
  // We keep a reference to the chat session to maintain history automatically through the SDK.
  const chatSessionRef = useRef<any>(null);

  const selectModelForNextMessage = (modelId: string) => {
    selectedModelRef.current = modelId;
    setSelectedModel(modelId);
    setIsModelDropdownOpen(false);
  };

  const toggleThinkingForNextMessage = () => {
    const nextValue = !isThinkingEnabledRef.current;
    isThinkingEnabledRef.current = nextValue;
    setIsThinkingEnabled(nextValue);
  };

  const toggleWebSearchForNextMessage = () => {
    const nextValue = !isWebSearchEnabledRef.current;
    isWebSearchEnabledRef.current = nextValue;
    setIsWebSearchEnabled(nextValue);
  };

  useEffect(() => {
    // Initialize chat session on mount
    if (getModelOption(selectedModelRef.current)?.provider === "gemini") {
      chatSessionRef.current = ai.chats.create({
        model: selectedModelRef.current,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION + (isWebSearchEnabledRef.current ? "\n\n10. Web Search is ENABLED. You have access to real-time information via the googleSearch tool. When you are confused, lack recent info, or need to verify facts, USE THE WEB SEARCH feature transparently to provide accurate and up-to-date answers. Do not guess. Do not give wrong information." : ""),
          temperature: 0.85, // Slightly higher for more creative/human-like tangents
          ...(isWebSearchEnabledRef.current ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });
    }
  }, []);

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
    if (getModelOption(selectedModelRef.current)?.provider === "gemini") {
      chatSessionRef.current = ai.chats.create({
        model: selectedModelRef.current,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION + (isWebSearchEnabledRef.current ? "\n\n10. Web Search is ENABLED. You have access to real-time information via the googleSearch tool. When you are confused, lack recent info, or need to verify facts, USE THE WEB SEARCH feature transparently to provide accurate and up-to-date answers. Do not guess. Do not give wrong information." : ""),
          temperature: 0.85,
          ...(isWebSearchEnabledRef.current ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });
    } else {
      chatSessionRef.current = null;
    }
  };

  const selectChat = (id: string) => {
    const chat = chats.find(c => c.id === id);
    if (chat) {
      setCurrentChatId(id);
      setMessages(chat.messages);
      // Re-initialize session with history
      if (getModelOption(selectedModelRef.current)?.provider === "gemini") {
        chatSessionRef.current = ai.chats.create({
          model: selectedModelRef.current,
          history: chat.messages.map(m => {
            const parts: any[] = [{ text: m.content }];
            if (m.attachments && m.attachments.length > 0) {
               m.attachments.forEach(att => {
                  parts.push({
                     inlineData: {
                        data: att.base64,
                        mimeType: att.mimeType
                     }
                  });
               });
            }
            return {
              role: m.role === "user" ? "user" : "model",
              parts
            };
          }),
          config: {
            systemInstruction: SYSTEM_INSTRUCTION + (isWebSearchEnabledRef.current ? "\n\n10. Web Search is ENABLED. You have access to real-time information via the googleSearch tool. When you are confused, lack recent info, or need to verify facts, USE THE WEB SEARCH feature transparently to provide accurate and up-to-date answers. Do not guess. Do not give wrong information." : ""),
            temperature: 0.85,
            ...(isWebSearchEnabledRef.current ? { tools: [{ googleSearch: {} }] } : {}),
          },
        });
      } else {
        chatSessionRef.current = null;
      }
    }
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const renameChat = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const chat = chats.find(c => c.id === id);
    if (!chat) return;
    const newTitle = prompt("Rename chat:", chat.title);
    if (newTitle && newTitle.trim()) {
      const title = newTitle.trim();
      setChats(prev => prev.map(c => c.id === id ? { ...c, title, updatedAt: Date.now() } : c));
      await updateChatMeta(id, { title });
    }
    setActiveMenuId(null);
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

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      // DO NOT set it to null here, otherwise it won't break the loop checking for aborted status
      setIsTyping(false);
    }
  };

  const syncChatMessages = async (
    chatId: string,
    nextMessages: Message[],
    metaPatch: Partial<Pick<Chat, "title" | "updatedAt" | "model">> = {}
  ) => {
    setChats(prevChats =>
      prevChats.map(chat =>
        chat.id === chatId
          ? {
              ...chat,
              ...metaPatch,
              messages: nextMessages,
              updatedAt: metaPatch.updatedAt || Date.now(),
            }
          : chat
      )
    );
    await replaceChatMessages(chatId, nextMessages, { ...metaPatch, updatedAt: metaPatch.updatedAt || Date.now() });
  };

  const syncCurrentChatMessages = async (
    nextMessages: Message[],
    metaPatch: Partial<Pick<Chat, "title" | "updatedAt" | "model">> = {}
  ) => {
    const chatId = currentChatIdRef.current;
    if (!chatId) return;
    await syncChatMessages(chatId, nextMessages, metaPatch);
  };

  const updateLastModelMessage = (patch: Partial<Message>) => {
    setMessages((prev) => {
      const newMessages = [...prev];
      const lastMsg = { ...newMessages[newMessages.length - 1] };
      if (lastMsg.role === "model") {
        newMessages[newMessages.length - 1] = { ...lastMsg, ...patch };
      }
      return newMessages;
    });
  };

  const sendMessage = async (text: string, currentHistory: Message[], customAttachments?: Attachment[]) => {
    const chatId = currentChatIdRef.current;
    if (!chatId) return;

    const currentAttachments = customAttachments || attachments;
    if (!text && currentAttachments.length === 0) return;
    const requestModel = selectedModelRef.current;
    const requestProvider = getModelOption(requestModel)?.provider;
    const requestIsCliproxy = requestProvider === "cliproxy";
    const requestThinkingEnabled = isThinkingEnabledRef.current;
    const requestWebSearchEnabled = isWebSearchEnabledRef.current;

    if (requestIsCliproxy) {
      const validationError = validateCliproxyAttachments(currentAttachments);
      if (validationError) {
        alert(validationError);
        return;
      }
    }

    if (requestProvider === "gemini") {
      const validationError = validateGeminiAttachments(currentAttachments);
      if (validationError) {
        alert(validationError);
        return;
      }
    }

    setInput("");
    setAttachments([]);
    setIsTyping(true);
    shouldAutoScrollRef.current = isNearChatBottom();
    
    abortControllerRef.current = new AbortController();

    // Add user message to UI immediately
    const userMessage = normalizeMessage(
      { role: "user", content: text, attachments: currentAttachments.length > 0 ? currentAttachments : undefined },
      chatId
    );
    const newHistory = [...currentHistory, userMessage];
    const pendingModelMessage = normalizeMessage(
      { role: "model", content: "", isThinking: requestThinkingEnabled },
      chatId,
      Date.now() + 1
    );
    const pendingMessages: Message[] = [...newHistory, pendingModelMessage];
    setMessages(pendingMessages);
    await syncChatMessages(chatId, pendingMessages);

    if (requestIsCliproxy) {
      let currentText = "";
      let currentThought = "";

      try {
        await streamCliproxyResponse({
          model: requestModel,
          instructions:
            SYSTEM_INSTRUCTION +
            (requestWebSearchEnabled
              ? "\n\n10. Web Search is ENABLED through the OpenAI Responses web search tool when the proxy/provider supports it. Use it for recent or verifiable facts, and say when search is unavailable instead of guessing."
              : ""),
          history: newHistory,
          reasoningEffort: requestThinkingEnabled ? "medium" : "none",
          webSearchEnabled: requestWebSearchEnabled,
          signal: abortControllerRef.current.signal,
          onTextDelta: (delta) => {
            currentText += delta;
            updateLastModelMessage({ content: currentText });
          },
          onThoughtDelta: (delta) => {
            currentThought += delta;
            updateLastModelMessage({ thought: currentThought, isThinking: true });
          },
          onWebSearch: ({ status, queries }) => {
            const existingQueries = messagesRef.current[messagesRef.current.length - 1]?.webSearchQueries;
            updateLastModelMessage({ webSearchStatus: status, webSearchQueries: queries || existingQueries });
          },
        });

        updateLastModelMessage({ isThinking: false });

        const currentChat = chatsRef.current.find(c => c.id === chatId);
        const title =
          currentChat?.title === "New Conversation"
            ? text.slice(0, 30) + (text.length > 30 ? "..." : "")
            : currentChat?.title;
        const finalMessages: Message[] = [
          ...newHistory,
          {
            ...pendingModelMessage,
            content: currentText,
            thought: currentThought,
            isThinking: false,
            webSearchStatus: messagesRef.current[messagesRef.current.length - 1]?.webSearchStatus,
            webSearchQueries: messagesRef.current[messagesRef.current.length - 1]?.webSearchQueries,
          },
        ];
        setMessages(finalMessages);
        await syncChatMessages(chatId, finalMessages, title ? { title } : {});
      } catch (error: any) {
        if (error?.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
          console.log("Generation stopped by user");
        } else {
          console.error("Error generating CLIProxy response:", error);
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMsg = { ...newMessages[newMessages.length - 1] };
            if (lastMsg.role === "model" && !lastMsg.content) {
                 lastMsg.content = "I could not reach CLIProxy at the moment. Make sure `cliproxy` is running on http://127.0.0.1:8317.";
                 lastMsg.isThinking = false;
                 newMessages[newMessages.length - 1] = lastMsg;
            }
            return newMessages;
          });
        }
      } finally {
        setIsTyping(false);
        abortControllerRef.current = null;
      }

      return;
    }

    // Always recreate session to ensure latest model, history, and thinking config
    chatSessionRef.current = ai.chats.create({
      model: requestModel,
      history: currentHistory.map(m => {
        const parts: any[] = [{ text: m.content }];
        if (m.attachments && m.attachments.length > 0) {
           m.attachments.forEach(att => {
              parts.push({
                 inlineData: {
                    data: att.base64,
                    mimeType: att.mimeType
                 }
              });
           });
        }
        return {
          role: m.role === "user" ? "user" : "model",
          parts
        };
      }),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION + (requestWebSearchEnabled ? "\n\n10. Web Search is ENABLED. You have access to real-time information via the googleSearch tool. When you are confused, lack recent info, or need to verify facts, USE THE WEB SEARCH feature transparently to provide accurate and up-to-date answers. Do not guess. Do not give wrong information." : ""),
        temperature: 0.85,
        ...(requestThinkingEnabled ? {
          thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM, includeThoughts: true }
        } : {}),
        ...(requestWebSearchEnabled ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });

    try {
      const geminiContents = newHistory.map((message) => {
        const contentParts: any[] = [];

        if (message.content) {
          contentParts.push({ text: message.content });
        }

        message.attachments?.forEach((att) => {
          contentParts.push({
            inlineData: {
              data: att.base64,
              mimeType: att.mimeType,
            },
          });
        });

        return {
          role: message.role === "user" ? "user" : "model",
          parts: contentParts.length > 0 ? contentParts : [{ text: "" }],
        };
      });

      const responseStream = await ai.models.generateContentStream({
        model: requestModel,
        contents: geminiContents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION + (requestWebSearchEnabled ? "\n\n10. Web Search is ENABLED. You have access to real-time information via the googleSearch tool. When you are confused, lack recent info, or need to verify facts, USE THE WEB SEARCH feature transparently to provide accurate and up-to-date answers. Do not guess. Do not give wrong information." : ""),
          temperature: 0.85,
          ...(requestThinkingEnabled ? {
            thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM, includeThoughts: true }
          } : {}),
          ...(requestWebSearchEnabled ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });
      let currentText = "";
      let currentThought = "";
      let currentWebSearchStatus: Message["webSearchStatus"] = requestWebSearchEnabled ? "searching" : undefined;
      let currentWebSearchQueries: string[] | undefined;

      if (currentWebSearchStatus) {
        updateLastModelMessage({ webSearchStatus: currentWebSearchStatus });
      }
      
      for await (const chunk of responseStream) {
        if (abortControllerRef.current?.signal.aborted) {
           break;
        }
        
        const parts = chunk.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.thought && part.text) {
             currentThought += part.text;
          } else if (!part.thought && part.text) {
             currentText += part.text;
          }
        }
        // Fallback if parts iteration missed it
        if (parts.length === 0 && chunk.text) {
          currentText += chunk.text;
        }

        const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
        if (groundingMetadata) {
          const queries = [
            ...(groundingMetadata.webSearchQueries || []),
            ...(groundingMetadata.imageSearchQueries || []),
            ...(groundingMetadata.retrievalQueries || []),
          ];
          currentWebSearchStatus = "searched";
          currentWebSearchQueries = queries.length > 0 ? queries : currentWebSearchQueries;
        }

        let displayText = currentText;
        let displayThought = currentThought;

        // Fallback for models that emit raw <thought> tags
        const thoughtRegex = /<thought>([\s\S]*?)(?:<\/thought>|$)/g;
        let match;
        while ((match = thoughtRegex.exec(displayText)) !== null) {
          displayThought += (displayThought ? "\n" : "") + match[1].trim();
        }
        
        // Remove the thought blocks from the displayed text
        displayText = displayText.replace(/<thought>([\s\S]*?)(?:<\/thought>|$)/g, "").trim();

        if (displayText || displayThought) {
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastMsg = {...newMessages[newMessages.length - 1]};
            if (lastMsg.role === "model") {
              lastMsg.content = displayText;
              lastMsg.thought = displayThought || lastMsg.thought;
              lastMsg.isThinking = Boolean(displayThought);
              lastMsg.webSearchStatus = currentWebSearchStatus;
              lastMsg.webSearchQueries = currentWebSearchQueries;
              newMessages[newMessages.length - 1] = lastMsg;
            }
            return newMessages;
          });
        }
      }
      
      // End of stream, finalize thinking state
      const finalWebSearchStatus = currentWebSearchStatus === "searched" ? "searched" : undefined;
      updateLastModelMessage({
        isThinking: false,
        webSearchStatus: finalWebSearchStatus,
        webSearchQueries: finalWebSearchStatus ? currentWebSearchQueries : undefined,
      });

      const currentChat = chatsRef.current.find(c => c.id === chatId);
      const finalMessages: Message[] = [
        ...newHistory,
        {
          ...pendingModelMessage,
          content: currentText,
          thought: currentThought,
          isThinking: false,
          webSearchStatus: finalWebSearchStatus,
          webSearchQueries: finalWebSearchStatus ? currentWebSearchQueries : undefined,
        },
      ];
      const fallbackTitle =
        currentChat?.title === "New Conversation"
          ? text.slice(0, 30) + (text.length > 30 ? "..." : "")
          : currentChat?.title;

      setMessages(finalMessages);
      await syncChatMessages(chatId, finalMessages, fallbackTitle ? { title: fallbackTitle } : {});

      // Fetch AI auto-title for new conversation in the background
      const isFirstMessage = currentChat?.title === "New Conversation";
      if (isFirstMessage) {
        // Auto-generate title
        ai.models.generateContent({
          model: "gemini-3.1-flash-lite-preview",
          contents: `Summarize this conversation into a short, punchy title (max 5 words). Return ONLY the title text, no quotes, no extra formatting.\n\nConversation:\n${newHistory.map(m => m.role + ": " + m.content).join("\n")}\nmodel: ${currentText}`
        }).then(resp => {
           const generatedTitle = resp.text?.replace(/["']/g, "").trim();
           if (generatedTitle) {
              setChats(prevChats => prevChats.map(c =>
                 c.id === chatId ? { ...c, title: generatedTitle, updatedAt: Date.now() } : c
              ));
              updateChatMeta(chatId, { title: generatedTitle }).catch(err => console.error("Failed to save generated title:", err));
           }
        }).catch(err => console.error("Failed to generate title:", err));
      }

    } catch (error: any) {
      if (error?.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        console.log("Generation stopped by user");
      } else {
        console.error("Error generating response:", error);
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastMsg = { ...newMessages[newMessages.length - 1] };
          if (lastMsg.role === "model" && !lastMsg.content) {
               lastMsg.content = "Whoops, lost my train of thought for a second there. (Error connecting)";
               lastMsg.isThinking = false;
               newMessages[newMessages.length - 1] = lastMsg;
          }
          return newMessages;
        });
      }
    } finally {
      setIsTyping(false);
      abortControllerRef.current = null;
    }
  };

  const handleEditMessage = async (messageId: string) => {
    if (isTypingRef.current) return;
    const currentMessages = messagesRef.current;
    const idx = currentMessages.findIndex(message => message.id === messageId);
    if (idx < 0) return;
    const msg = currentMessages[idx];
    if (msg.role !== "user") return;
    const trimmedMessages = currentMessages.slice(0, idx);
    
    setInput(msg.content);
    setAttachments(msg.attachments || []);
    setMessages(trimmedMessages);
    await syncCurrentChatMessages(trimmedMessages);
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(msg.content.length, msg.content.length);
    }, 0);
  };

  const handleRetryMessage = async (messageId: string) => {
    if (isTypingRef.current) return;
    const currentMessages = messagesRef.current;
    const idx = currentMessages.findIndex(message => message.id === messageId);
    if (idx < 0) return;
    const msg = currentMessages[idx];
    if (msg.role === "user") {
      const previousMessages = currentMessages.slice(0, idx);
      await syncCurrentChatMessages(previousMessages);
      await sendMessage(msg.content, previousMessages, msg.attachments);
    } else if (msg.role === "model") {
      const prevMsg = currentMessages[idx - 1];
      if (prevMsg && prevMsg.role === "user") {
        const previousMessages = currentMessages.slice(0, idx - 1);
        await syncCurrentChatMessages(previousMessages);
        await sendMessage(prevMsg.content, previousMessages, prevMsg.attachments);
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text && attachments.length === 0) return;
    if (isTyping) return;

    sendMessage(text, messages);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="relative h-[100dvh] w-full flex font-sans bg-[var(--privora-bg)] text-[var(--privora-text)] overflow-hidden transition-colors duration-500">
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

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ 
          width: isSidebarOpen ? 280 : 48,
          x: 0
        }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed md:relative h-full z-50 bg-[var(--privora-surface)] border-r border-[var(--privora-border)] flex flex-col overflow-visible shadow-2xl md:shadow-none transition-colors duration-500"
      >
        {!isSidebarOpen ? (
          <div className="w-12 h-full flex flex-col items-center py-2 bg-[var(--privora-surface)]">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] transition-colors"
              title="Open sidebar"
            >
              <PanelLeft className="w-[18px] h-[18px]" />
            </button>

            <div className="mt-4 flex flex-col items-center gap-2">
              <button
                onClick={() => !isTyping && handleNewChat()}
                disabled={isTyping}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="New chat"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsSearchModalOpen(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] transition-colors"
                title="Search chats"
              >
                <Search className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] transition-colors"
                title="Chats"
              >
                <MessageCircle className="w-4 h-4" />
              </button>
              {chats.some(chat => chat.isStarred) && (
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] transition-colors"
                  title="Starred chats"
                >
                  <Star className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="mt-auto flex flex-col items-center gap-2">
              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] transition-colors"
                title={isDarkMode ? "Light mode" : "Dark mode"}
              >
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : (
        <div className="w-[280px] h-full flex flex-col overflow-hidden">
          <div className="p-4 pl-5">
             <div className="flex items-center justify-between mb-4">
                <span className="font-display font-semibold text-[19px] tracking-tight text-[var(--privora-text)]">Privora</span>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-1.5 rounded-md text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] transition-colors"
                  title="Close sidebar"
                >
                  <PanelLeft className="w-[18px] h-[18px]" />
                </button>
             </div>

             <div className="flex flex-col gap-1 w-full mt-2">
               <button
                 onClick={() => !isTyping && handleNewChat()}
                 disabled={isTyping}
                 className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-[var(--privora-text)]/5 transition-colors text-sm font-medium text-[var(--privora-text)] text-left disabled:opacity-50 disabled:cursor-not-allowed group"
               >
                 <div className="w-7 h-7 rounded-full bg-[var(--privora-text)]/5 flex items-center justify-center group-hover:bg-[var(--privora-text)]/10 transition-colors shrink-0">
                    <Plus className="w-4 h-4" />
                 </div>
                 New chat
               </button>

               <button
                 onClick={() => setIsSearchModalOpen(true)}
                 className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-[var(--privora-text)]/5 transition-colors text-[14px] text-[var(--privora-text)] text-left group"
               >
                 <div className="w-7 h-7 flex items-center justify-center shrink-0">
                    <Search className="w-[18px] h-[18px] text-[var(--privora-text)]/80" />
                 </div>
                 Search
               </button>
             </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar pl-4">
            {/* Starred Chats */}
            {chats.filter(c => c.isStarred).length > 0 && (
              <div className="mb-4">
                <div className="px-3 pb-2 pt-2 text-xs font-medium text-[var(--privora-muted)]">Starred</div>
                {chats.filter(c => c.isStarred).map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => !isTyping && selectChat(chat.id)}
                    className={`relative group flex items-center justify-between p-2 rounded-lg transition-all ${
                      isTyping ? "cursor-not-allowed" : "cursor-pointer"
                    } ${
                      currentChatId === chat.id 
                        ? "bg-[var(--privora-text)]/10 text-[var(--privora-text)] font-medium" 
                        : "hover:bg-[var(--privora-text)]/5 text-[var(--privora-text)]/70 hover:text-[var(--privora-text)]"
                    } ${isTyping && currentChatId !== chat.id ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden ml-1 w-full">
                      <span className="text-sm truncate w-full pr-6">{chat.title}</span>
                    </div>
                    {!isTyping && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === chat.id ? null : chat.id);
                        }}
                        className={`absolute right-2 opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-[var(--privora-text)]/10 transition-opacity ${
                          currentChatId === chat.id ? "text-[var(--privora-text)]" : "text-[var(--privora-muted)]"
                        } ${activeMenuId === chat.id ? 'opacity-100 bg-[var(--privora-text)]/10 text-[var(--privora-text)]' : ''}`}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    )}
                    <AnimatePresence>
                      {activeMenuId === chat.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); }} 
                          />
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute right-2 top-8 z-50 w-40 rounded-xl bg-[var(--privora-surface)] border border-[var(--privora-border)] shadow-xl overflow-hidden py-1"
                          >
                            <button
                              onClick={(e) => toggleStarChat(e, chat.id)}
                              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[var(--privora-text)] hover:bg-[var(--privora-text)]/5 transition-colors"
                            >
                              <Star className="w-4 h-4" />
                              Unstar
                            </button>
                            <button
                              onClick={(e) => renameChat(e, chat.id)}
                              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[var(--privora-text)] hover:bg-[var(--privora-text)]/5 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                              Rename
                            </button>
                            <button
                              onClick={(e) => deleteChat(e, chat.id)}
                              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}

            {/* Recent Chats */}
            {chats.filter(c => !c.isStarred).length > 0 && (
              <div>
                <div className="px-3 pb-2 pt-2 text-xs font-medium text-[var(--privora-muted)]">Recents</div>
                {chats.filter(c => !c.isStarred).map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => !isTyping && selectChat(chat.id)}
                    className={`relative group flex items-center justify-between p-2 rounded-lg transition-all ${
                      isTyping ? "cursor-not-allowed" : "cursor-pointer"
                    } ${
                      currentChatId === chat.id 
                        ? "bg-[var(--privora-text)]/10 text-[var(--privora-text)] font-medium" 
                        : "hover:bg-[var(--privora-text)]/5 text-[var(--privora-text)]/70 hover:text-[var(--privora-text)]"
                    } ${isTyping && currentChatId !== chat.id ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden ml-1 w-full">
                      <span className="text-sm truncate w-full pr-6">{chat.title}</span>
                    </div>
                    {!isTyping && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === chat.id ? null : chat.id);
                        }}
                        className={`absolute right-2 opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-[var(--privora-text)]/10 transition-opacity ${
                          currentChatId === chat.id ? "text-[var(--privora-text)]" : "text-[var(--privora-muted)]"
                        } ${activeMenuId === chat.id ? 'opacity-100 bg-[var(--privora-text)]/10 text-[var(--privora-text)]' : ''}`}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    )}
                    <AnimatePresence>
                      {activeMenuId === chat.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); }} 
                          />
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute right-2 top-8 z-50 w-40 rounded-xl bg-[var(--privora-surface)] border border-[var(--privora-border)] shadow-xl overflow-hidden py-1"
                          >
                            <button
                              onClick={(e) => toggleStarChat(e, chat.id)}
                              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[var(--privora-text)] hover:bg-[var(--privora-text)]/5 transition-colors"
                            >
                              <Star className="w-4 h-4" />
                              Star
                            </button>
                            <button
                              onClick={(e) => renameChat(e, chat.id)}
                              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[var(--privora-text)] hover:bg-[var(--privora-text)]/5 transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                              Rename
                            </button>
                            <button
                              onClick={(e) => deleteChat(e, chat.id)}
                              className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-[var(--privora-border)] mt-4">
             <button 
               onClick={() => setIsDarkMode(!isDarkMode)}
               className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[var(--privora-text)]/5 transition-colors text-sm text-[var(--privora-muted)] hover:text-[var(--privora-text)]"
             >
             {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
               {isDarkMode ? "Light Mode" : "Dark Mode"}
             </button>
          </div>
        </div>
        )}
      </motion.aside>

      {/* Main Content Area */}
      <div className="flex-1 relative flex flex-col min-w-0 h-full overflow-hidden">
        {/* Chat Area */}
        <main ref={chatScrollRef} onScroll={handleChatScroll} className="flex-1 overflow-y-auto">
          <div className="max-w-[46rem] mx-auto flex flex-col justify-end min-h-full pb-6 pt-20">
            {messages.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0, y: 5 }} 
                animate={{ opacity: 1, y: 0 }}
                className="w-full mx-auto px-4 md:px-6 mb-6 mt-[20vh]"
              >
                <div className="flex flex-col items-start w-full text-[var(--privora-text)]">
                  <div className="prose max-w-none text-inherit prose-p:m-0 prose-p:leading-[1.75] prose-p:font-display prose-p:text-[1.1rem]">
                    <p>Hey! How's it going? What can I help you with today?</p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="flex flex-col w-full">
                {messages.map((msg, idx) => (
                  <ChatMessage 
                    key={msg.id}
                    role={msg.role} 
                    content={msg.content} 
                    thought={msg.thought}
                    isThinking={msg.isThinking}
                    webSearchStatus={msg.webSearchStatus}
                    webSearchQueries={msg.webSearchQueries}
                    isTyping={isTyping && idx === messages.length - 1}
                    messageIndex={idx}
                    messageCount={messages.length}
                    onEdit={() => handleEditMessage(msg.id)}
                    onRetry={() => handleRetryMessage(msg.id)}
                    attachments={msg.attachments}
                    onPreviewAttachment={setPreviewAttachment}
                  />
                ))}
              </div>
            )}
            <div ref={messagesEndRef} className="h-2" />
          </div>
        </main>

      {/* Input Area */}
      <footer className="shrink-0 w-full px-4 pb-4 md:pb-6 pt-4 bg-[var(--privora-bg)] transition-colors duration-500 border-t border-[var(--privora-border)]/50">
        <div className="max-w-[46rem] mx-auto relative">
          <form 
            onSubmit={handleSubmit}
            className="flex flex-col bg-[var(--privora-surface)] rounded-[24px] border border-[var(--privora-border)] shadow-[var(--privora-shadow)] focus-within:border-[var(--privora-muted)] focus-within:shadow-xl transition-all"
          >
            {attachments.length > 0 && (
               <div className="flex gap-2 px-4 pt-4 pb-2 w-full overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: 'none' }}>
                 {attachments.map((att, i) => (
                   <div key={i} className="shrink-0 relative group rounded-xl border border-[var(--privora-border)]/80 overflow-hidden bg-[var(--privora-bg)] shadow-sm">
                     <div 
                       className="cursor-pointer"
                       onClick={() => setPreviewAttachment(att)}
                     >
                       {att.mimeType.startsWith("image/") ? (
                          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-black/5">
                            <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                          </div>
                       ) : (
                          <div className="w-14 h-14 sm:w-16 sm:h-16 flex flex-col items-center justify-center p-2 text-center bg-[var(--privora-text)]/5">
                             <span className="text-[10px] font-medium text-[var(--privora-text)] truncate w-full">{att.name.split('.').pop()?.toUpperCase() || 'FILE'}</span>
                          </div>
                       )}
                     </div>
                     <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeAttachment(i); }}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
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
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="How can I help you today?"
              className="w-full max-h-48 min-h-[56px] text-[15px] bg-transparent text-[var(--privora-text)] placeholder-[var(--privora-muted)] px-4 pt-4 outline-none resize-none leading-relaxed transition-colors duration-500 overflow-y-auto"
              rows={1}
            />
            <div className="flex items-center justify-between px-3 py-3">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
                  className={`p-2 rounded-full transition-colors flex items-center justify-center ${isAddMenuOpen ? "bg-[var(--privora-text)]/10 text-[var(--privora-text)]" : "bg-[var(--privora-text)]/5 text-[var(--privora-text)] hover:bg-[var(--privora-text)]/10"}`}
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
                        className="absolute bottom-[calc(100%+0.5rem)] left-0 w-64 flex flex-col bg-[var(--privora-bg)] rounded-xl border border-[var(--privora-border)] shadow-xl z-50 overflow-hidden py-1.5"
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
                          onClick={toggleWebSearchForNextMessage}
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
                          onClick={() => setIsAddMenuOpen(false)}
                          className="w-full text-left px-3 py-2 flex items-center justify-between text-[14px] font-sans hover:bg-[var(--privora-surface)] transition-colors text-[var(--privora-text)]"
                        >
                          <div className="flex items-center gap-3">
                             <Feather className="w-4 h-4 opacity-70" />
                             <span className="font-medium leading-none">Use style</span>
                          </div>
                          <ChevronDown className="w-3 h-3 opacity-50 -rotate-90" />
                        </button>
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
                onChange={handleFileSelect} 
                className="hidden" 
              />
              <div className="flex items-center gap-1.5 relative">
                 <button
                   type="button"
                   onClick={toggleThinkingForNextMessage}
                   className={`px-2 py-1.5 flex items-center gap-1.5 text-[13px] font-sans rounded-md transition-colors ${
                     isThinkingEnabled
                       ? "bg-[var(--privora-text)] text-[var(--privora-bg)]"
                       : "text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]"
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
                 
                 <button
                   type="button"
                   onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                   className="text-[var(--privora-muted)] text-[13px] px-2 py-1.5 flex items-center gap-1.5 font-sans cursor-pointer hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] rounded-md transition-colors"
                   title="Select AI Model"
                 >
                   {selectedModelLabel}
                   <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                 </button>
                 
                 <AnimatePresence>
                   {isModelDropdownOpen && (
                     <>
                       <div 
                         className="fixed inset-0 z-40" 
                         onClick={() => setIsModelDropdownOpen(false)}
                       />
                       <motion.div 
                         initial={{ opacity: 0, y: 10, scale: 0.95 }}
                         animate={{ opacity: 1, y: 0, scale: 1 }}
                         exit={{ opacity: 0, y: 10, scale: 0.95 }}
                         transition={{ duration: 0.15 }}
                         className="absolute bottom-full left-0 mb-2 w-64 flex flex-col bg-[var(--privora-bg)] rounded-xl border border-[var(--privora-border)] shadow-xl z-50 overflow-hidden"
                       >
                         {modelOptions.map((option) => {
                           const isActive = selectedModel === option.id;

                           return (
                             <button
                               key={`${option.provider}-${option.label}`}
                               type="button"
                               onClick={() => {
                                 selectModelForNextMessage(option.id);
                               }}
                               className={`text-left px-4 py-3 font-sans hover:bg-[var(--privora-surface)] transition-colors ${
                                 isActive ? "text-[var(--privora-accent)] font-medium bg-[var(--privora-text)]/5" : "text-[var(--privora-text)]"
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


                 <AnimatePresence mode="popLayout">
                   {isTyping ? (
                     <motion.button
                       key="stop"
                       initial={{ scale: 0.5, opacity: 0 }}
                       animate={{ scale: 1, opacity: 1 }}
                       exit={{ scale: 0.5, opacity: 0 }}
                       type="button"
                       onClick={stopGeneration}
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
          <div className="text-center mt-2 flex items-center justify-center gap-4">
             <p className="text-[11px] text-[var(--privora-muted)] opacity-70 transition-colors">
               Privora is AI and can make mistakes. Please double-check responses.
             </p>
          </div>
        </div>
      </footer>

      {/* Search Modal */}
      <AnimatePresence>
        {isSearchModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm"
              onClick={() => setIsSearchModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed top-[15vh] left-1/2 -translate-x-1/2 w-full max-w-2xl z-[101] p-4 font-sans"
            >
              <div className="bg-[var(--privora-surface)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh] border border-[var(--privora-border)]">
                <div className="flex items-center px-4 py-3 border-b border-[var(--privora-border)] gap-3 shrink-0">
                  <Search className="w-5 h-5 text-[var(--privora-muted)]" />
                  <input
                    type="text"
                    placeholder="Search chats and projects"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="flex-1 bg-transparent border-none outline-none text-[15px] text-[var(--privora-text)] placeholder-[var(--privora-muted)]"
                  />
                  <button 
                    onClick={() => setIsSearchModalOpen(false)}
                    className="p-1 rounded-md text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 transition-colors hidden sm:block"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-2 py-2">
                  {chats
                    .filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(chat => (
                      <button
                        key={chat.id}
                        onClick={() => { selectChat(chat.id); setIsSearchModalOpen(false); }}
                        className="w-full flex justify-between items-center px-3 py-2.5 hover:bg-[var(--privora-text)]/5 rounded-xl transition-colors text-left group"
                      >
                        <div className="flex items-center gap-3 w-full pr-4 overflow-hidden text-[14px]">
                          <MessageCircle className="w-4 h-4 text-[var(--privora-muted)] shrink-0" />
                          <span className="truncate text-[var(--privora-text)]">{chat.title}</span>
                        </div>
                        <span className="text-xs text-[var(--privora-muted)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                           Enter
                        </span>
                      </button>
                    ))}
                  {chats.filter(c => c.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                     <div className="py-8 text-center text-sm text-[var(--privora-muted)]">No chats found.</div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {previewAttachment && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={() => setPreviewAttachment(null)}
          >
            <button 
              className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              onClick={() => setPreviewAttachment(null)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative max-w-5xl max-h-[85vh] w-full flex flex-col items-center gap-4"
              onClick={e => e.stopPropagation()}
            >
              {previewAttachment.mimeType.startsWith("image/") ? (
                <img 
                  src={previewAttachment.url} 
                  alt={previewAttachment.name} 
                  className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-48 h-48 sm:w-64 sm:h-64 flex flex-col items-center justify-center gap-4 bg-[var(--privora-surface)] rounded-2xl shadow-2xl border border-[var(--privora-border)] p-6 text-center">
                  <div className="text-[var(--privora-text)] opacity-70">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                  </div>
                  <span className="font-medium text-[var(--privora-text)] break-all line-clamp-3">{previewAttachment.name}</span>
                  <a 
                    href={previewAttachment.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="px-4 py-2 mt-2 bg-[var(--privora-accent)] text-[var(--privora-accent-fg)] rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                    download={previewAttachment.name}
                  >
                    Download File
                  </a>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  </div>
);
}
