import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent, type Dispatch, type FormEvent, type KeyboardEvent, type SetStateAction } from "react";
import { BookOpen, Brain, Check, ChevronLeft, ChevronRight, MessageCircle, Pencil, Plus, Search, Settings2, Sparkles, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { ChatComposer } from "../../chat/components/ChatComposer";
import { ChatMessage } from "../../chat/components/ChatMessage";
import { useToast } from "../../ui/ToastProvider";
import {
  CLIPROXY_ATTACHMENT_ACCEPT,
  GEMINI_ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS,
  OPENROUTER_ATTACHMENT_ACCEPT,
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
} from "../../../lib/attachments";
import { getModelOption } from "../../../lib/models";
import type { ImageSettings } from "../../../lib/settings";
import type { ResponseStyleId } from "../../../lib/prompt";
import type {
  CharacterCategory,
  CharacterMemoryRecord,
  CharacterMessageRecord,
  CharacterRecord,
  CharacterSessionRecord,
  UserPersonaRecord,
} from "../../../lib/db";
import { characterCategories, characterCategoryDescriptions } from "../lib/defaults";
import {
  createCharacter,
  createCharacterMemory,
  createCharacterSession,
  deleteCharacter,
  deleteCharacterMemory,
  deleteCharacterSession,
  loadCharacterMemories,
  loadCharacterMessages,
  loadUserPersonas,
  replaceCharacterMessages,
  updateCharacter,
  updateCharacterMemory,
  updateCharacterSession,
} from "../lib/storage";
import { useCharacterGeneration } from "../hooks/useCharacterGeneration";

interface CharacterWorkspaceProps {
  characters: CharacterRecord[];
  sessions: CharacterSessionRecord[];
  currentSessionId: string | null;
  setCharacters: Dispatch<SetStateAction<CharacterRecord[]>>;
  setSessions: Dispatch<SetStateAction<CharacterSessionRecord[]>>;
  setCurrentSessionId: (sessionId: string | null) => void;
  selectedModel: string;
  selectedStyle: ResponseStyleId;
  isThinkingEnabled: boolean;
  isWebSearchEnabled: boolean;
  isDeepResearchEnabled: boolean;
  imageSettings: ImageSettings;
  onSelectModel: (modelId: string) => void;
  onSelectStyle: (styleId: ResponseStyleId) => void;
  onToggleThinking: () => void;
  onToggleWebSearch: () => void;
  onToggleDeepResearch: () => void;
  onImageSettingsChange: (settings: ImageSettings) => void;
  onPreviewAttachment: (attachment: Attachment) => void;
}

type CharacterDraft = Pick<CharacterRecord,
  "name" | "avatar" | "color" | "tagline" | "category" | "greeting" | "personality" | "speakingStyle" | "boundaries" | "exampleDialogue" | "visibility"
>;

const emptyDraft = (): CharacterDraft => ({
  name: "",
  avatar: "",
  color: "#8f6df8",
  tagline: "",
  category: "Originals",
  greeting: "",
  personality: "",
  speakingStyle: "",
  boundaries: "Stay fictional. Do not claim to be a real person or professional replacement.",
  exampleDialogue: "",
  visibility: "private",
});

const draftFromCharacter = (character: CharacterRecord): CharacterDraft => ({
  name: character.name,
  avatar: character.avatar,
  color: character.color,
  tagline: character.tagline,
  category: character.category,
  greeting: character.greeting,
  personality: character.personality,
  speakingStyle: character.speakingStyle,
  boundaries: character.boundaries,
  exampleDialogue: character.exampleDialogue,
  visibility: character.visibility,
});

const initialsFor = (name: string) =>
  name
    .split(/\s+/)
    .map(part => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "AI";

const normalizeCharacterName = (name: string) => name.trim().toLowerCase();

const getScreenCaptureFile = async () => {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("screen-capture-unsupported");
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "browser", frameRate: 1 } as MediaTrackConstraints, audio: false });
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
    await new Promise(resolve => requestAnimationFrame(resolve));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("screen-capture-canvas-failed");
    context.drawImage(video, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(next => next ? resolve(next) : reject(new Error("screen-capture-encode-failed")), "image/png");
    });
    return new File([blob], `privora-character-screenshot-${Date.now()}.png`, { type: "image/png" });
  } finally {
    stream.getTracks().forEach(track => track.stop());
  }
};

function CharacterAvatar({ character, size = "md" }: { character: Pick<CharacterRecord, "name" | "avatar" | "color">; size?: "sm" | "md" | "lg" }) {
  const className = size === "lg" ? "h-16 w-16 text-xl" : size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm";
  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-2xl font-semibold text-white shadow-sm`}
      style={{ background: `linear-gradient(135deg, ${character.color}, color-mix(in srgb, ${character.color} 62%, #111827))` }}
    >
      {character.avatar || initialsFor(character.name)}
    </div>
  );
}

function CharacterRail({
  category,
  description,
  items,
  onViewAll,
  renderCard,
}: {
  category: string;
  description?: string;
  items: CharacterRecord[];
  onViewAll?: () => void;
  renderCard: (character: CharacterRecord, compact?: boolean) => React.ReactNode;
}) {
  const railRef = useRef<HTMLDivElement>(null);

  const scrollRail = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({
      left: direction * Math.max(320, rail.clientWidth * 0.82),
      behavior: "smooth",
    });
  };

  return (
    <section className="group/rail min-w-0">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl font-medium text-[var(--privora-text)]">{category}</h3>
          {description && <p className="mt-0.5 line-clamp-1 text-sm text-[var(--privora-muted)]">{description}</p>}
        </div>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="hidden shrink-0 rounded-full px-3 py-1.5 text-sm text-[var(--privora-muted)] transition hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] sm:inline-flex"
          >
            View all
          </button>
        )}
      </div>

      <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
        <button
          type="button"
          onClick={() => scrollRail(-1)}
          className="absolute left-3 top-1/2 z-10 hidden h-12 w-10 -translate-y-1/2 items-center justify-center rounded-r-2xl bg-[var(--privora-bg)]/88 text-[var(--privora-text)] opacity-0 shadow-lg backdrop-blur transition hover:bg-[var(--privora-surface)] group-hover/rail:opacity-100 md:flex"
          title="Scroll left"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={() => scrollRail(1)}
          className="absolute right-3 top-1/2 z-10 hidden h-12 w-10 -translate-y-1/2 items-center justify-center rounded-l-2xl bg-[var(--privora-bg)]/88 text-[var(--privora-text)] opacity-0 shadow-lg backdrop-blur transition hover:bg-[var(--privora-surface)] group-hover/rail:opacity-100 md:flex"
          title="Scroll right"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] hidden w-16 bg-gradient-to-r from-[var(--privora-bg)] to-transparent md:block" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] hidden w-16 bg-gradient-to-l from-[var(--privora-bg)] to-transparent md:block" />

        <div
          ref={railRef}
          className="flex snap-x gap-3 overflow-x-auto px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-6 lg:px-8"
        >
          {items.map(character => (
            <div key={character.id} className="snap-start">
              {renderCard(character, true)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PrivoraSelect<T extends string>({
  value,
  options,
  onChange,
  className = "",
  buttonClassName = "",
}: {
  value: T;
  options: Array<{ value: T; label: string; meta?: string | number }>;
  onChange: (value: T) => void;
  className?: string;
  buttonClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === value) || options[0];

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(open => !open)}
        className={`inline-flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--privora-border)] bg-[var(--privora-bg)] px-3 py-2.5 text-left text-sm text-[var(--privora-text)] outline-none transition hover:border-[var(--privora-text)]/35 focus:border-[var(--privora-accent)] ${buttonClassName}`}
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronRight className={`h-4 w-4 shrink-0 text-[var(--privora-muted)] transition ${isOpen ? "rotate-90" : ""}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute left-0 top-[calc(100%+6px)] z-40 max-h-72 w-full min-w-52 overflow-y-auto rounded-2xl border border-[var(--privora-border)] bg-[var(--privora-surface)] p-1.5 shadow-[var(--privora-shadow)]"
          >
            {options.map(option => {
              const isActive = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex h-9 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm transition ${isActive ? "bg-[var(--privora-text)] text-[var(--privora-bg)]" : "text-[var(--privora-text)] hover:bg-[var(--privora-text)]/6"}`}
                >
                  <span className="truncate">{option.label}</span>
                  {option.meta !== undefined && (
                    <span className={isActive ? "text-[var(--privora-bg)]/70" : "text-[var(--privora-muted)]"}>{option.meta}</span>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function CharacterWorkspace({
  characters,
  sessions,
  currentSessionId,
  setCharacters,
  setSessions,
  setCurrentSessionId,
  selectedModel,
  selectedStyle,
  isThinkingEnabled,
  isWebSearchEnabled,
  isDeepResearchEnabled,
  imageSettings,
  onSelectModel,
  onSelectStyle,
  onToggleThinking,
  onToggleWebSearch,
  onToggleDeepResearch,
  onImageSettingsChange,
  onPreviewAttachment,
}: CharacterWorkspaceProps) {
  const { notify } = useToast();
  const [messages, setMessages] = useState<CharacterMessageRecord[]>([]);
  const [memories, setMemories] = useState<CharacterMemoryRecord[]>([]);
  const [personas, setPersonas] = useState<UserPersonaRecord[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CharacterCategory | "All">("All");
  const [query, setQuery] = useState("");
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<CharacterRecord | null>(null);
  const [draft, setDraft] = useState<CharacterDraft>(emptyDraft);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryType, setMemoryType] = useState<CharacterMemoryRecord["type"]>("fact");
  const [isMemoryPanelOpen, setIsMemoryPanelOpen] = useState(true);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentSession = sessions.find(session => session.id === currentSessionId);
  const currentCharacter = characters.find(character => character.id === currentSession?.characterId);
  const persona = personas.find(item => item.id === currentSession?.userPersonaId) || personas.find(item => item.isDefault);

  const { submit, stop, isGenerating } = useCharacterGeneration({
    character: currentCharacter,
    session: currentSession,
    persona,
    memories,
    messages,
    setMessages,
    setSessions,
    selectedModel,
    selectedStyle,
    isThinkingEnabled,
    isWebSearchEnabled,
  });

  useEffect(() => {
    loadUserPersonas().then(setPersonas).catch(error => {
      notify({ title: "Personas failed to load", description: String(error), variant: "error" });
    });
  }, [notify]);

  useEffect(() => {
    if (!currentSessionId || !currentCharacter) {
      setMessages([]);
      setMemories([]);
      return;
    }

    void Promise.all([
      loadCharacterMessages(currentSessionId),
      loadCharacterMemories(currentCharacter.id, currentSessionId),
    ]).then(([nextMessages, nextMemories]) => {
      setMessages(nextMessages);
      setMemories(nextMemories);
    }).catch(error => {
      notify({ title: "Character chat failed to load", description: String(error), variant: "error" });
    });
  }, [currentSessionId, currentCharacter?.id, notify]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const catalogCharacters = useMemo(() => {
    const seen = new Set<string>();
    return characters.filter(character => {
      const key = character.starterKey || normalizeCharacterName(character.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [characters]);

  const filteredCharacters = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalogCharacters.filter(character => {
      const categoryMatch = selectedCategory === "All" || character.category === selectedCategory;
      const queryMatch = !normalizedQuery || [
        character.name,
        character.tagline,
        character.category,
        character.personality,
        character.speakingStyle,
        character.boundaries,
        character.exampleDialogue,
        character.starterKey,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
      return categoryMatch && queryMatch;
    });
  }, [catalogCharacters, query, selectedCategory]);

  const featuredCharacters = useMemo(() => {
    const preferred = ["Sol Reed", "Atlas Quinn", "Mira Vale", "Tesla Forge", "Sun Tzu Desk", "Manga Lab", "Kyoto Guide"];
    return [...catalogCharacters]
      .filter(character => character.isStarred || preferred.includes(character.name))
      .sort((a, b) => {
        const aIndex = preferred.indexOf(a.name);
        const bIndex = preferred.indexOf(b.name);
        return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
      })
      .slice(0, 8);
  }, [catalogCharacters]);

  const recentSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 4)
      .map(session => ({
        session,
        character: characters.find(character => character.id === session.characterId),
      }))
      .filter((item): item is { session: CharacterSessionRecord; character: CharacterRecord } => Boolean(item.character));
  }, [characters, sessions]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<CharacterCategory | "All", number>([["All", catalogCharacters.length]]);
    for (const category of characterCategories) counts.set(category, 0);
    for (const character of catalogCharacters) {
      counts.set(character.category, (counts.get(character.category) || 0) + 1);
    }
    return counts;
  }, [catalogCharacters]);

  const visibleCategoryChips = useMemo(() => {
    const activeCategories = characterCategories
      .filter(category => (categoryCounts.get(category) || 0) > 0)
      .slice(0, 5);
    if (selectedCategory !== "All" && !activeCategories.includes(selectedCategory)) {
      return ["All", selectedCategory, ...activeCategories] as Array<CharacterCategory | "All">;
    }
    return ["All", ...activeCategories] as Array<CharacterCategory | "All">;
  }, [categoryCounts, selectedCategory]);

  const overflowCategories = useMemo(() => {
    return characterCategories.filter(category => !visibleCategoryChips.includes(category));
  }, [visibleCategoryChips]);

  const categoryMenuOptions = useMemo(() => {
    return ["All", ...characterCategories] as Array<CharacterCategory | "All">;
  }, []);

  const isBrowsingAllCharacters = selectedCategory === "All" && !query.trim();
  const characterRails = useMemo(() => {
    if (!isBrowsingAllCharacters) return [];
    const railOrder: Array<CharacterCategory | "Featured"> = [
      "Featured",
      "Historical Minds",
      "Travel Guides",
      "Creative Partners",
      "Cinema & Manga",
      "Story Worlds",
      "Mentors",
      "Games",
      "Productivity",
      "Wellness-lite",
    ];
    return railOrder
      .map(category => {
        const items = category === "Featured"
          ? featuredCharacters
          : catalogCharacters.filter(character => character.category === category).slice(0, 12);
        return { category, items };
      })
      .filter(rail => rail.items.length > 0);
  }, [catalogCharacters, featuredCharacters, isBrowsingAllCharacters]);

  useEffect(() => {
    const closeMenu = () => setIsCategoryMenuOpen(false);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const addFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      notify({ title: "Too many attachments", description: `You can attach up to ${MAX_ATTACHMENTS} files.`, variant: "error" });
      return;
    }

    const provider = getModelOption(selectedModel)?.provider;
    const issues: string[] = [];
    const next: Attachment[] = [];

    for (const file of files) {
      if (provider === "openrouter") {
        issues.push(`OpenRouter models are text-only here. "${file.name}" was skipped.`);
        continue;
      }
      const attachmentMeta = { name: file.name, mimeType: file.type || "application/octet-stream" };
      if (provider === "cliproxy" && !isCliproxySupportedAttachment(attachmentMeta)) {
        issues.push(`"${file.name}" is not supported by GPT/CLIProxy.`);
        continue;
      }
      if (provider !== "cliproxy" && !isGeminiSupportedAttachment(attachmentMeta)) {
        issues.push(`"${file.name}" is not supported by Gemini.`);
        continue;
      }
      next.push(await readFileAsAttachment(file));
    }

    if (next.length > 0) {
      const total = getAttachmentTotalSize([...attachments, ...next]);
      const validation = provider === "cliproxy"
        ? validateCliproxyAttachments([...attachments, ...next])
        : provider === "openrouter"
          ? validateOpenRouterAttachments([...attachments, ...next])
          : validateGeminiAttachments([...attachments, ...next]);
      if (validation) {
        next.forEach(attachment => revokeAttachmentUrl(attachment));
        notify({ title: "Attachment limit", description: validation || `Attached files are too large (${total} bytes).`, variant: "error" });
      } else {
        setAttachments(prev => [...prev, ...next]);
      }
    }

    if (issues.length > 0) {
      notify({ title: "Some files were skipped", description: issues.slice(0, 2).join(" "), variant: "error" });
    }
  };

  const startSession = async (character: CharacterRecord) => {
    const { session, messages: greeting } = await createCharacterSession({
      character,
      model: selectedModel,
      userPersonaId: persona?.id,
    });
    setSessions(prev => [session, ...prev]);
    setCurrentSessionId(session.id);
    setMessages(greeting);
  };

  const openStudio = (character?: CharacterRecord) => {
    setEditingCharacter(character || null);
    setDraft(character ? draftFromCharacter(character) : emptyDraft());
    setIsStudioOpen(true);
  };

  const saveCharacter = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.greeting.trim()) {
      notify({ title: "Character needs a name and greeting", variant: "error" });
      return;
    }
    const payload = { ...draft, avatar: draft.avatar.trim() || initialsFor(draft.name) };
    if (editingCharacter) {
      await updateCharacter(editingCharacter.id, payload);
      setCharacters(prev => prev.map(character => character.id === editingCharacter.id ? { ...character, ...payload, updatedAt: Date.now() } : character));
    } else {
      const created = await createCharacter(payload);
      setCharacters(prev => [created, ...prev]);
    }
    setIsStudioOpen(false);
  };

  const removeCharacter = async (character: CharacterRecord) => {
    await deleteCharacter(character.id);
    setCharacters(prev => prev.filter(item => item.id !== character.id));
    setSessions(prev => prev.filter(session => session.characterId !== character.id));
    if (currentSession?.characterId === character.id) setCurrentSessionId(null);
  };

  const submitMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!input.trim() || isGenerating) return;
    const outgoingAttachments = attachments;
    setInput("");
    setAttachments([]);
    await submit(input, outgoingAttachments);
  };

  const editMessage = async (messageId: string) => {
    if (isGenerating || !currentSession) return;
    const index = messages.findIndex(message => message.id === messageId);
    const message = messages[index];
    if (!message || message.role !== "user") return;
    const nextMessages = messages.slice(0, index);
    setInput(message.content);
    setAttachments((message.attachments || []) as Attachment[]);
    setMessages(nextMessages);
    await replaceCharacterMessages(currentSession.id, nextMessages, { updatedAt: Date.now() });
    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(message.content.length, message.content.length);
    }, 0);
  };

  const retryMessage = async (messageId: string) => {
    if (isGenerating || !currentSession) return;
    const index = messages.findIndex(message => message.id === messageId);
    const message = messages[index];
    if (!message) return;

    if (message.role === "user") {
      const previousMessages = messages.slice(0, index);
      setMessages(previousMessages);
      await replaceCharacterMessages(currentSession.id, previousMessages, { updatedAt: Date.now() });
      await submit(message.content, message.attachments || [], previousMessages);
      return;
    }

    const previousUser = messages[index - 1];
    if (previousUser?.role !== "user") return;
    const previousMessages = messages.slice(0, index - 1);
    setMessages(previousMessages);
    await replaceCharacterMessages(currentSession.id, previousMessages, { updatedAt: Date.now() });
    await submit(previousUser.content, previousUser.attachments || [], previousMessages);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files || []);
    if (files.length > 0) void addFiles(files);
  };

  const addMemory = async () => {
    if (!currentCharacter || !memoryDraft.trim()) return;
    const memory = await createCharacterMemory({
      characterId: currentCharacter.id,
      sessionId: currentSession?.id,
      type: memoryType,
      content: memoryDraft.trim(),
      pinned: true,
    });
    setMemories(prev => [memory, ...prev]);
    setMemoryDraft("");
  };

  const toggleMemoryEnabled = async () => {
    if (!currentSession) return;
    const memoryEnabled = currentSession.memoryEnabled === false;
    await updateCharacterSession(currentSession.id, { memoryEnabled });
    setSessions(prev => prev.map(session => session.id === currentSession.id ? { ...session, memoryEnabled } : session));
  };

  const renderCharacterCard = (character: CharacterRecord, compact = false) => (
    <motion.article
      key={character.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${compact ? "w-[17rem] shrink-0" : ""} group rounded-3xl border border-[var(--privora-border)] bg-[var(--privora-surface)]/82 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[var(--privora-shadow)]`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CharacterAvatar character={character} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-medium text-[var(--privora-text)]">{character.name}</h2>
            <p className="truncate text-sm text-[var(--privora-muted)]">{character.category}</p>
          </div>
        </div>
        <button onClick={() => openStudio(character)} className="rounded-full p-2 text-[var(--privora-muted)] opacity-100 transition hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] sm:opacity-0 sm:group-hover:opacity-100" title="Edit character">
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
      <p className={`${compact ? "overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]" : "min-h-14"} text-sm leading-6 text-[var(--privora-text)]/78`}>{character.tagline}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button onClick={() => void startSession(character)} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--privora-user-bubble)] px-3 text-sm font-medium text-[var(--privora-text)] transition hover:bg-[var(--privora-text)]/10">
          <MessageCircle className="h-4 w-4" /> Start chat
        </button>
        <button onClick={() => void removeCharacter(character)} className="rounded-full p-2 text-[var(--privora-muted)] transition hover:bg-red-500/10 hover:text-red-500" title="Delete character">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </motion.article>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-[var(--privora-bg)]">
      <main
        ref={scrollRef}
        className={`flex min-w-0 flex-1 flex-col ${currentSession && currentCharacter ? "overflow-hidden" : "overflow-y-auto"}`}
      >
        {!currentSession || !currentCharacter ? (
          <section className="flex w-full flex-1 flex-col">
            <div className="relative mb-6 overflow-hidden border-b border-[var(--privora-border)]/55">
              <img
                src="/images/characters-library-bg.png"
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-cover opacity-62"
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--privora-bg)_0%,color-mix(in_srgb,var(--privora-bg)_88%,transparent)_34%,color-mix(in_srgb,var(--privora-bg)_60%,transparent)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--privora-bg)] to-transparent" />
              <div className="relative mx-auto flex min-h-[320px] w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
                <div className="flex max-w-4xl flex-col justify-between gap-8">
                  <div>
                    <p className="mb-3 text-sm font-medium text-[var(--privora-muted)]">Characters</p>
                    <h1 className="font-display text-4xl font-medium tracking-tight text-[var(--privora-text)] sm:text-5xl">
                      A calmer universe of people, mentors, and worlds.
                    </h1>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--privora-text)]/75">
                      Choose a starter, continue a recent session, or shape a new character with memory, boundaries, and a voice that feels intentional.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => openStudio()} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--privora-text)] px-5 text-sm font-medium text-[var(--privora-bg)] transition hover:opacity-90">
                      <Plus className="h-4 w-4" /> Create character
                    </button>
                    <span className="rounded-full border border-[var(--privora-border)] bg-[var(--privora-surface)]/72 px-4 py-2 text-sm text-[var(--privora-muted)] backdrop-blur">
                      {catalogCharacters.length} private starters ready
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mx-auto w-full max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
            <div className="mb-6 rounded-[24px] border border-[var(--privora-border)] bg-[var(--privora-surface)]/72 p-3 shadow-sm backdrop-blur">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <label className="relative block min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--privora-muted)]" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search characters..."
                      className="h-11 w-full rounded-2xl border border-[var(--privora-border)] bg-[var(--privora-bg)]/72 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--privora-accent)]"
                    />
                  </label>
                  {(query || selectedCategory !== "All") && (
                    <button onClick={() => { setQuery(""); setSelectedCategory("All"); }} className="hidden h-11 shrink-0 rounded-2xl border border-[var(--privora-border)] px-3 text-sm text-[var(--privora-muted)] transition hover:text-[var(--privora-text)] sm:block">
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 text-sm text-[var(--privora-muted)] lg:justify-end">
                  <span>
                    <span className="font-medium text-[var(--privora-text)]">{filteredCharacters.length}</span> of {catalogCharacters.length}
                    {selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}
                    {query.trim() ? ` matching "${query.trim()}"` : ""}
                  </span>
                  <button onClick={() => openStudio()} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--privora-text)] px-4 text-sm font-medium text-[var(--privora-bg)] transition hover:opacity-90">
                    <Plus className="h-4 w-4" /> Create
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {visibleCategoryChips.map(category => {
                  const isActive = selectedCategory === category;
                  return (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-sm transition ${isActive ? "border-[var(--privora-text)] bg-[var(--privora-text)] text-[var(--privora-bg)]" : "border-[var(--privora-border)] bg-transparent text-[var(--privora-muted)] hover:border-[var(--privora-text)]/40 hover:text-[var(--privora-text)]"}`}
                    >
                      <span>{category}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${isActive ? "bg-[var(--privora-bg)]/18" : "bg-[var(--privora-text)]/6"}`}>
                        {categoryCounts.get(category) || 0}
                      </span>
                    </button>
                  );
                })}
                {overflowCategories.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setIsCategoryMenuOpen(open => !open);
                      }}
                      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition ${overflowCategories.includes(selectedCategory as CharacterCategory) ? "border-[var(--privora-text)] bg-[var(--privora-text)] text-[var(--privora-bg)]" : "border-[var(--privora-border)] bg-transparent text-[var(--privora-muted)] hover:border-[var(--privora-text)]/40 hover:text-[var(--privora-text)]"}`}
                    >
                      {overflowCategories.includes(selectedCategory as CharacterCategory) ? selectedCategory : "More"}
                      <ChevronRight className={`h-3.5 w-3.5 transition ${isCategoryMenuOpen ? "rotate-90" : ""}`} />
                    </button>
                    <AnimatePresence>
                      {isCategoryMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.98 }}
                          transition={{ duration: 0.14 }}
                          onClick={(event) => event.stopPropagation()}
                          className="absolute left-0 top-11 z-30 w-64 overflow-hidden rounded-2xl border border-[var(--privora-border)] bg-[var(--privora-surface)] p-1.5 shadow-[var(--privora-shadow)]"
                        >
                          {categoryMenuOptions.map(category => {
                            const isActive = selectedCategory === category;
                            return (
                              <button
                                key={category}
                                type="button"
                                onClick={() => {
                                  setSelectedCategory(category);
                                  setIsCategoryMenuOpen(false);
                                }}
                                className={`flex h-9 w-full items-center justify-between rounded-xl px-3 text-left text-sm transition ${isActive ? "bg-[var(--privora-text)] text-[var(--privora-bg)]" : "text-[var(--privora-text)] hover:bg-[var(--privora-text)]/6"}`}
                              >
                                <span>{category}</span>
                                <span className={isActive ? "text-[var(--privora-bg)]/70" : "text-[var(--privora-muted)]"}>{categoryCounts.get(category) || 0}</span>
                              </button>
                            );
                          })}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {recentSessions.length > 0 && (
                <div className="mt-3 border-t border-[var(--privora-border)]/60 pt-3">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <span className="flex h-10 items-center px-1 text-xs font-medium uppercase tracking-[0.14em] text-[var(--privora-muted)] sm:col-span-2 lg:col-span-3">Continue</span>
                    {recentSessions.map(({ session, character }) => (
                      <button key={session.id} onClick={() => setCurrentSessionId(session.id)} className="inline-flex h-11 min-w-0 items-center gap-2 rounded-2xl border border-[var(--privora-border)] bg-[var(--privora-bg)]/45 px-2.5 text-left transition hover:border-[var(--privora-text)]/30 hover:bg-[var(--privora-text)]/5">
                        <CharacterAvatar character={character} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-[var(--privora-text)]">{session.title}</span>
                          <span className="block truncate text-xs text-[var(--privora-muted)]">
                            {session.title.trim().toLowerCase() === character.name.trim().toLowerCase() ? character.category : character.name}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-medium text-[var(--privora-text)]">Character library</h2>
                <p className="mt-1 text-sm text-[var(--privora-muted)]">
                  {filteredCharacters.length === 0
                    ? "No matches yet."
                    : `${filteredCharacters.length} ${filteredCharacters.length === 1 ? "match" : "matches"}${selectedCategory !== "All" ? ` in ${selectedCategory}` : ""}`}
                </p>
              </div>
            </div>

            {filteredCharacters.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[var(--privora-border)] bg-[var(--privora-surface)]/55 p-8 text-center">
                <p className="font-display text-2xl font-medium text-[var(--privora-text)]">No character found</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--privora-muted)]">Try a different search, switch categories, or create the exact character you want.</p>
                <button onClick={() => openStudio()} className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--privora-text)] px-4 text-sm font-medium text-[var(--privora-bg)]">
                  <Plus className="h-4 w-4" /> Create character
                </button>
              </div>
            ) : isBrowsingAllCharacters ? (
              <div className="space-y-8">
                {characterRails.map(rail => (
                  <CharacterRail
                    key={rail.category}
                    category={rail.category}
                    description={rail.category === "Featured" ? "A few useful places to begin." : characterCategoryDescriptions[rail.category as CharacterCategory]}
                    items={rail.items}
                    onViewAll={rail.category !== "Featured" ? () => setSelectedCategory(rail.category as CharacterCategory) : undefined}
                    renderCard={renderCharacterCard}
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {filteredCharacters.map(character => renderCharacterCard(character))}
              </div>
            )}
            </div>
          </section>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <header className="z-10 shrink-0 bg-[var(--privora-bg)]/90 px-4 py-3 backdrop-blur-xl sm:px-5">
              <div className="mx-auto flex max-w-[46rem] items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <CharacterAvatar character={currentCharacter} />
                  <div className="min-w-0">
                    <h1 className="truncate font-display text-lg font-medium text-[var(--privora-text)]">{currentCharacter.name}</h1>
                    <p className="truncate text-xs text-[var(--privora-muted)]">{currentCharacter.category} · {currentCharacter.tagline}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={toggleMemoryEnabled} className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${currentSession.memoryEnabled === false ? "border-[var(--privora-border)] text-[var(--privora-muted)]" : "border-[var(--privora-accent)]/40 bg-[var(--privora-accent)]/10 text-[var(--privora-accent)]"}`}>
                    <Brain className="h-3.5 w-3.5" /> Memory
                  </button>
                  <button onClick={() => openStudio(currentCharacter)} className="rounded-full p-2 text-[var(--privora-muted)] transition hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]" title="Edit character">
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto flex min-h-full w-full max-w-[46rem] flex-col justify-end px-3 pb-4 pt-4 sm:px-4 sm:pb-6 sm:pt-6">
                {messages.map((message, index) => (
                  <ChatMessage
                    key={message.id}
                    id={message.id}
                    role={message.role}
                    content={message.content}
                    thought={message.thought}
                    isThinking={Boolean(message.thought?.trim()) && message.isThinking}
                    isTyping={isGenerating && index === messages.length - 1}
                    attachments={message.attachments}
                    onPreviewAttachment={onPreviewAttachment}
                    messageIndex={index}
                    messageCount={messages.length}
                    onEdit={() => void editMessage(message.id)}
                    onRetry={() => void retryMessage(message.id)}
                    hideActions={isGenerating && index === messages.length - 1}
                  />
                ))}
                <div ref={endRef} className="h-2" />
              </div>
            </div>

            <ChatComposer
              input={input}
              attachments={attachments}
              isTyping={isGenerating}
              selectedModel={selectedModel}
              selectedStyle={selectedStyle}
              isThinkingEnabled={isThinkingEnabled}
              isWebSearchEnabled={isWebSearchEnabled}
              isDeepResearchEnabled={isDeepResearchEnabled}
              isDebateModeEnabled={false}
              isClashModeEnabled={false}
              isAgentModeEnabled={false}
              composerMode="chat"
              debateSettings={{}}
              clashSettings={{}}
              imageSettings={imageSettings}
              textareaRef={textareaRef}
              fileInputRef={fileInputRef}
              onInputChange={setInput}
              onSubmit={submitMessage}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFileSelect={(event: ChangeEvent<HTMLInputElement>) => {
                if (event.target.files) void addFiles(event.target.files);
                event.target.value = "";
              }}
              onTakeScreenshot={() => void getScreenCaptureFile().then(file => addFiles([file])).catch(() => notify({ title: "Screenshot failed", description: "Your browser blocked screen capture.", variant: "error" }))}
              onPreviewAttachment={onPreviewAttachment}
              onRemoveAttachment={(index) => {
                setAttachments(prev => {
                  const next = [...prev];
                  const [removed] = next.splice(index, 1);
                  if (removed) revokeAttachmentUrl(removed);
                  return next;
                });
              }}
              onToggleThinking={onToggleThinking}
              onToggleWebSearch={onToggleWebSearch}
              onToggleDeepResearch={onToggleDeepResearch}
              onToggleDebateMode={() => undefined}
              onToggleClashMode={() => undefined}
              onToggleAgentMode={() => undefined}
              onSelectComposerMode={() => undefined}
              onDebateSettingsChange={() => undefined}
              onClashSettingsChange={() => undefined}
              onImageSettingsChange={onImageSettingsChange}
              onSelectModel={onSelectModel}
              onSelectStyle={onSelectStyle}
              onStopGeneration={stop}
              showTopBorder={false}
            />
          </section>
        )}
      </main>

      {currentSession && currentCharacter && (
        isMemoryPanelOpen ? (
          <aside className="hidden w-80 shrink-0 border-l border-[var(--privora-border)] bg-[var(--privora-surface)]/70 p-4 xl:flex xl:flex-col">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-medium text-[var(--privora-text)]">Memory & lore</h2>
              <button
                type="button"
                onClick={() => setIsMemoryPanelOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--privora-muted)] transition hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]"
                title="Collapse memory"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <PrivoraSelect
                value={memoryType}
                onChange={(value) => setMemoryType(value as CharacterMemoryRecord["type"])}
                options={[
                  { value: "fact", label: "Fact" },
                  { value: "preference", label: "Preference" },
                  { value: "relationship", label: "Relationship" },
                  { value: "lore", label: "Lore" },
                ]}
                buttonClassName="h-9 py-0"
              />
              <textarea value={memoryDraft} onChange={(event) => setMemoryDraft(event.target.value)} placeholder="Add a memory this character may use..." className="min-h-20 w-full resize-none rounded-xl border border-[var(--privora-border)] bg-[var(--privora-bg)] p-3 text-sm outline-none focus:border-[var(--privora-accent)]" />
              <button onClick={addMemory} className="h-9 w-full rounded-full bg-[var(--privora-text)] text-sm font-medium text-[var(--privora-bg)]">Add memory</button>
            </div>
            <div className="mt-5 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {memories.length === 0 ? (
                <p className="text-sm text-[var(--privora-muted)]">No saved memory yet.</p>
              ) : memories.map(memory => (
                <div key={memory.id} className="rounded-xl border border-[var(--privora-border)] bg-[var(--privora-bg)] p-3 text-sm">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-[var(--privora-muted)]">{memory.type}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => void updateCharacterMemory(memory.id, { pinned: !memory.pinned }).then(() => setMemories(prev => prev.map(item => item.id === memory.id ? { ...item, pinned: !item.pinned } : item)))} className="text-xs text-[var(--privora-muted)] hover:text-[var(--privora-text)]">
                        {memory.pinned ? "Pinned" : "Pin"}
                      </button>
                      <button onClick={() => void deleteCharacterMemory(memory.id).then(() => setMemories(prev => prev.filter(item => item.id !== memory.id)))} className="text-xs text-red-500">Delete</button>
                    </div>
                  </div>
                  <p className="leading-5 text-[var(--privora-text)]/85">{memory.content}</p>
                </div>
              ))}
            </div>
          </aside>
        ) : (
          <aside className="hidden w-12 shrink-0 border-l border-[var(--privora-border)] bg-[var(--privora-surface)]/50 py-3 xl:flex xl:flex-col xl:items-center">
            <button
              type="button"
              onClick={() => setIsMemoryPanelOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--privora-muted)] transition hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]"
              title="Open memory"
            >
              <BookOpen className="h-4 w-4" />
            </button>
            <ChevronLeft className="mt-1 h-3.5 w-3.5 text-[var(--privora-muted)]/70" />
          </aside>
        )
      )}

      <AnimatePresence>
        {isStudioOpen && (
          <motion.div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/25 p-3 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.form onSubmit={saveCharacter} initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} className="grid max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-[var(--privora-border)] bg-[var(--privora-surface)] shadow-2xl lg:grid-cols-[1.15fr_0.85fr]">
              <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--privora-muted)]">Character Studio</p>
                    <h2 className="font-display text-2xl font-medium text-[var(--privora-text)]">{editingCharacter ? "Edit character" : "Create character"}</h2>
                  </div>
                  <button type="button" onClick={() => setIsStudioOpen(false)} className="rounded-full p-2 text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={draft.name} onChange={(event) => setDraft(prev => ({ ...prev, name: event.target.value, avatar: prev.avatar || initialsFor(event.target.value) }))} placeholder="Name" className="rounded-xl border border-[var(--privora-border)] bg-[var(--privora-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--privora-accent)]" />
                  <input value={draft.avatar} onChange={(event) => setDraft(prev => ({ ...prev, avatar: event.target.value.slice(0, 2).toUpperCase() }))} placeholder="Avatar initials" className="rounded-xl border border-[var(--privora-border)] bg-[var(--privora-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--privora-accent)]" />
                  <PrivoraSelect
                    value={draft.category}
                    onChange={(category) => setDraft(prev => ({ ...prev, category }))}
                    options={characterCategories.map(category => ({ value: category, label: category }))}
                  />
                  <input type="color" value={draft.color} onChange={(event) => setDraft(prev => ({ ...prev, color: event.target.value }))} className="h-11 rounded-xl border border-[var(--privora-border)] bg-[var(--privora-bg)] px-2 py-1" />
                </div>
                <input value={draft.tagline} onChange={(event) => setDraft(prev => ({ ...prev, tagline: event.target.value }))} placeholder="Short tagline" className="mt-3 w-full rounded-xl border border-[var(--privora-border)] bg-[var(--privora-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--privora-accent)]" />
                {([
                  ["greeting", "Greeting"],
                  ["personality", "Personality"],
                  ["speakingStyle", "Speaking style"],
                  ["boundaries", "Boundaries"],
                  ["exampleDialogue", "Example dialogue"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="mt-3 block">
                    <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--privora-muted)]">{label}</span>
                    <textarea value={draft[key]} onChange={(event) => setDraft(prev => ({ ...prev, [key]: event.target.value }))} className="min-h-20 w-full resize-y rounded-xl border border-[var(--privora-border)] bg-[var(--privora-bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--privora-accent)]" />
                  </label>
                ))}
                <div className="mt-5 flex justify-end gap-2">
                  {editingCharacter && (
                    <button type="button" onClick={() => void removeCharacter(editingCharacter).then(() => setIsStudioOpen(false))} className="rounded-full px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10">Delete</button>
                  )}
                  <button type="submit" className="rounded-full bg-[var(--privora-text)] px-5 py-2 text-sm font-medium text-[var(--privora-bg)]">Save character</button>
                </div>
              </div>
              <div className="hidden border-l border-[var(--privora-border)] bg-[var(--privora-bg)] p-6 lg:block">
                <div className="mb-4 flex items-center gap-3">
                  <CharacterAvatar character={{ name: draft.name || "New Character", avatar: draft.avatar || initialsFor(draft.name), color: draft.color }} size="lg" />
                  <div>
                    <h3 className="font-display text-xl font-medium">{draft.name || "New Character"}</h3>
                    <p className="text-sm text-[var(--privora-muted)]">{draft.category}</p>
                  </div>
                </div>
                <p className="mb-4 text-sm leading-6 text-[var(--privora-text)]/75">{draft.tagline || characterCategoryDescriptions[draft.category]}</p>
                <div className="rounded-2xl border border-[var(--privora-border)] bg-[var(--privora-surface)] p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--privora-muted)]">
                    <Sparkles className="h-4 w-4" /> Opening message
                  </div>
                  <p className="text-sm leading-6">{draft.greeting || "Write a greeting that immediately sets the character's voice and scene."}</p>
                </div>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
