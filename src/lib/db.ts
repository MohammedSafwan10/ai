import Dexie, { type Table } from "dexie";
import { appLogger } from "./logger";

export interface AttachmentRecord {
  url: string;
  base64: string;
  mimeType: string;
  name: string;
  size?: number;
}

export type ResearchStatus = "queued" | "searching" | "reading" | "synthesizing" | "completed" | "stopped" | "failed";

export type ImageGenerationStatus = "queued" | "generating" | "completed" | "stopped" | "failed";
export type ImageGenerationItemStatus = "queued" | "generating" | "completed" | "stopped" | "failed";

export interface ImageGenerationOptionsRecord {
  imageModel?: string;
  sizePreset?: "square" | "square_2k" | "landscape" | "widescreen" | "widescreen_4k" | "portrait" | "story_4k" | "auto";
  aspectRatio?: "square" | "landscape" | "portrait";
  size: string;
  quality: "low" | "medium" | "high";
  count: 1 | 2 | 3 | 4;
  partialImages: 0 | 1;
  outputFormat: "png";
}

export interface ImageGenerationItemRecord {
  id: string;
  status: ImageGenerationItemStatus;
  partialImageBase64?: string;
  outputFormat?: string;
  attachmentName?: string;
  error?: string;
  completedAt?: number;
}

export interface ImageGenerationRecord {
  status: ImageGenerationStatus;
  mode: "generate" | "edit";
  prompt: string;
  model: string;
  options?: ImageGenerationOptionsRecord;
  items?: ImageGenerationItemRecord[];
  startedAt: number;
  completedAt?: number;
  error?: string;
  partialImageBase64?: string;
  outputFormat?: string;
}

export type ArtifactKind = "markdown" | "code" | "html" | "svg" | "mermaid" | "json" | "yaml" | "sql" | "text" | "table" | "prompt";
export type ArtifactStatus = "streaming" | "ready" | "failed";

export interface ArtifactReferenceRecord {
  artifactId: string;
  title: string;
  kind: ArtifactKind;
  status?: ArtifactStatus;
}

export interface ArtifactRecord {
  id: string;
  chatId: string;
  messageId?: string;
  kind: ArtifactKind;
  title: string;
  language?: string;
  content: string;
  status: ArtifactStatus;
  createdAt: number;
  updatedAt: number;
}

export type WebDevProjectStatus = "idle" | "generating" | "installing" | "running" | "error";
export type WebDevFileStatus = "ready" | "streaming" | "created" | "updated" | "deleted" | "error";
export type WebDevMessageRole = "user" | "assistant" | "activity" | "tool";

export interface WebDevProjectRecord {
  id: string;
  title: string;
  selectedModel?: string;
  isStarred?: boolean;
  activeFilePath?: string;
  packageHash?: string;
  status: WebDevProjectStatus;
  runtimeStatus?: string;
  previewUrl?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WebDevFileRecord {
  id: string;
  projectId: string;
  path: string;
  content: string;
  status: WebDevFileStatus;
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface WebDevMessageRecord {
  id: string;
  projectId: string;
  role: WebDevMessageRole;
  content: string;
  thought?: string;
  isThinking?: boolean;
  contentParts?: Array<{
    type: "thinking" | "text";
    text: string;
    title?: string;
    active?: boolean;
    startedAt?: number;
    endedAt?: number;
  }>;
  attachments?: AttachmentRecord[];
  toolCallId?: string;
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  toolStatus?: "running" | "completed" | "failed" | "cancelled";
  isSummary?: boolean;
  iteration?: number;
  hiddenFromChat?: boolean;
  activityType?: string;
  filePath?: string;
  activityOperation?: "created" | "updated" | "patched" | "deleted" | "renamed" | "created_project" | "skipped";
  activityStatus?: "running" | "done" | "error";
  additions?: number;
  deletions?: number;
  createdAt: number;
}

export interface ResearchSourceRecord {
  title?: string;
  url: string;
  provider?: string;
}

export type ResearchPlanStatus = "draft" | "editing" | "superseded" | "running" | "completed" | "cancelled";
export type ResearchPlanStepStatus = "pending" | "active" | "completed" | "skipped";

export interface ResearchPlanStepRecord {
  text: string;
  status: ResearchPlanStepStatus;
}

export interface ResearchActivityRecord {
  phase: string;
  title: string;
  detail?: string;
  source?: ResearchSourceRecord;
  timestamp: number;
}

export interface ResearchPlanRecord {
  title: string;
  steps: ResearchPlanStepRecord[];
  refinedPrompt: string;
  status: ResearchPlanStatus;
  progress?: number;
  currentActivity?: string;
  createdAt: number;
  updatedAt: number;
}

export type ResearchIntentStatus = "awaiting_clarification" | "ready" | "cancelled";

export interface PendingResearchIntentRecord {
  status: ResearchIntentStatus;
  originalGoal: string;
  clarificationQuestions?: string[];
  userAnswers?: string[];
  researchPlan?: string;
  refinedPrompt?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessageRecord {
  id: string;
  chatId: string;
  role: "user" | "model";
  content: string;
  thought?: string;
  isThinking?: boolean;
  webSearchStatus?: "searching" | "searched";
  webSearchQueries?: string[];
  researchStatus?: ResearchStatus;
  researchSources?: ResearchSourceRecord[];
  researchPreflight?: "clarifying";
  researchPlan?: ResearchPlanRecord;
  researchPlanReference?: {
    title: string;
    messageId?: string;
  };
  researchActivity?: ResearchActivityRecord[];
  researchJobId?: string;
  researchStartedAt?: number;
  researchCompletedAt?: number;
  researchTimeBudgetMs?: number;
  imageGeneration?: ImageGenerationRecord;
  artifact?: ArtifactReferenceRecord;
  attachments?: AttachmentRecord[];
  createdAt: number;
}

export interface ChatRecord {
  id: string;
  title: string;
  messages: ChatMessageRecord[];
  isStarred?: boolean;
  pendingResearchIntent?: PendingResearchIntentRecord;
  createdAt: number;
  updatedAt: number;
  model?: string;
}

type ChatRow = Omit<ChatRecord, "messages">;

class PrivoraDatabase extends Dexie {
  chats!: Table<ChatRow, string>;
  messages!: Table<ChatMessageRecord, string>;
  artifacts!: Table<ArtifactRecord, string>;
  webDevProjects!: Table<WebDevProjectRecord, string>;
  webDevFiles!: Table<WebDevFileRecord, string>;
  webDevMessages!: Table<WebDevMessageRecord, string>;

  constructor() {
    super("privora-local-db");
    this.version(1).stores({
      chats: "&id, updatedAt, isStarred",
      messages: "&id, chatId, createdAt",
    });
    this.version(2).stores({
      chats: "&id, updatedAt, isStarred",
      messages: "&id, chatId, createdAt",
      artifacts: "&id, chatId, messageId, updatedAt",
      artifactVersions: "&id, artifactId, version, createdAt",
    });
    this.version(3).stores({
      chats: "&id, updatedAt, isStarred",
      messages: "&id, chatId, createdAt",
      artifacts: "&id, chatId, messageId, updatedAt",
      artifactVersions: null,
    });
    this.version(4).stores({
      chats: "&id, updatedAt, isStarred",
      messages: "&id, chatId, createdAt",
      artifacts: "&id, chatId, messageId, updatedAt",
      webDevProjects: "&id, updatedAt, status",
      webDevFiles: "&id, projectId, path, updatedAt, [projectId+path]",
      webDevMessages: "&id, projectId, createdAt",
    });
  }
}

export const db = new PrivoraDatabase();

export const createId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

export const normalizeMessage = (
  message: Partial<ChatMessageRecord> & Pick<ChatMessageRecord, "role" | "content">,
  chatId: string,
  fallbackCreatedAt = Date.now()
): ChatMessageRecord => ({
  id: message.id || createId("msg"),
  chatId,
  role: message.role,
  content: message.content,
  thought: message.thought,
  isThinking: message.isThinking,
  webSearchStatus: message.webSearchStatus,
  webSearchQueries: message.webSearchQueries,
  researchStatus: message.researchStatus,
  researchSources: message.researchSources,
  researchPreflight: message.researchPreflight,
  researchPlan: message.researchPlan,
  researchPlanReference: message.researchPlanReference,
  researchActivity: message.researchActivity,
  researchJobId: message.researchJobId,
  researchStartedAt: message.researchStartedAt,
  researchCompletedAt: message.researchCompletedAt,
  researchTimeBudgetMs: message.researchTimeBudgetMs,
  imageGeneration: message.imageGeneration,
  artifact: message.artifact,
  attachments: message.attachments,
  createdAt: message.createdAt || fallbackCreatedAt,
});

export const loadChats = async (): Promise<ChatRecord[]> => {
  const chatRows = await db.chats.orderBy("updatedAt").reverse().toArray();
  const chats = await Promise.all(
    chatRows.map(async chat => {
      const messages = await db.messages.where("chatId").equals(chat.id).sortBy("createdAt");
      return { ...chat, messages };
    })
  );

  appLogger.debug("IndexedDB chats loaded", { chatCount: chats.length });
  return chats;
};

export const createChat = async (chat: ChatRecord) => {
  const { messages, ...chatRow } = chat;
  await db.transaction("rw", db.chats, db.messages, async () => {
    await db.chats.put(chatRow);
    if (messages.length > 0) {
      await db.messages.bulkPut(messages);
    }
  });
  appLogger.debug("IndexedDB chat created", { chatId: chat.id, messageCount: messages.length });
};

export const updateChatMeta = async (
  chatId: string,
  patch: Partial<Pick<ChatRecord, "title" | "isStarred" | "pendingResearchIntent" | "updatedAt" | "model">>
) => {
  await db.chats.update(chatId, {
    ...patch,
    updatedAt: patch.updatedAt || Date.now(),
  });
  appLogger.debug("IndexedDB chat metadata updated", {
    chatId,
    fields: Object.keys(patch),
  });
};

export const replaceChatMessages = async (
  chatId: string,
  messages: ChatMessageRecord[],
  metaPatch: Partial<Pick<ChatRecord, "title" | "pendingResearchIntent" | "updatedAt" | "model">> = {}
) => {
  await db.transaction("rw", db.chats, db.messages, async () => {
    await db.messages.where("chatId").equals(chatId).delete();
    if (messages.length > 0) {
      await db.messages.bulkPut(messages);
    }
    await db.chats.update(chatId, {
      ...metaPatch,
      updatedAt: metaPatch.updatedAt || Date.now(),
    });
  });
  appLogger.debug("IndexedDB chat messages replaced", {
    chatId,
    messageCount: messages.length,
    metaFields: Object.keys(metaPatch),
  });
};

export const deleteChatFromDb = async (chatId: string) => {
  await db.transaction("rw", db.chats, db.messages, db.artifacts, async () => {
    await db.messages.where("chatId").equals(chatId).delete();
    await db.artifacts.where("chatId").equals(chatId).delete();
    await db.chats.delete(chatId);
  });
  appLogger.info("IndexedDB chat deleted", { chatId });
};

export const loadArtifactsForChat = async (chatId: string) =>
  db.artifacts.where("chatId").equals(chatId).sortBy("updatedAt").then(items => items.reverse());

export const upsertArtifact = async (artifact: ArtifactRecord) => {
  await db.artifacts.put(artifact);
  appLogger.debug("IndexedDB artifact upserted", { artifactId: artifact.id, chatId: artifact.chatId });
};

export const migrateLocalStorageChats = async () => {
  const migrated = localStorage.getItem("privora-indexeddb-migrated");
  if (migrated) {
    appLogger.debug("Legacy localStorage migration skipped");
    return;
  }

  const rawChats = localStorage.getItem("privora-chats");
  if (!rawChats) {
    localStorage.setItem("privora-indexeddb-migrated", "true");
    appLogger.debug("Legacy localStorage migration skipped without source chats");
    return;
  }

  try {
    const existing = await db.chats.count();
    if (existing > 0) {
      localStorage.setItem("privora-indexeddb-migrated", "true");
      appLogger.debug("Legacy localStorage migration skipped with existing IndexedDB chats", {
        chatCount: existing,
      });
      return;
    }

    const parsedChats = JSON.parse(rawChats) as Array<{
      id?: string;
      title?: string;
      messages?: Array<Partial<ChatMessageRecord> & Pick<ChatMessageRecord, "role" | "content">>;
      isStarred?: boolean;
    }>;

    const now = Date.now();
    await db.transaction("rw", db.chats, db.messages, async () => {
      for (const [chatIndex, oldChat] of parsedChats.entries()) {
        const chatId = oldChat.id || createId("chat");
        const createdAt = now + chatIndex;
        const messages = (oldChat.messages || []).map((message, messageIndex) =>
          normalizeMessage(message, chatId, createdAt + messageIndex)
        );

        await db.chats.put({
          id: chatId,
          title: oldChat.title || "New Conversation",
          isStarred: oldChat.isStarred,
          createdAt,
          updatedAt: createdAt + messages.length,
        });

        if (messages.length > 0) {
          await db.messages.bulkPut(messages);
        }
      }
    });
    appLogger.info("Legacy localStorage chats migrated", { chatCount: parsedChats.length });
  } catch (error) {
    appLogger.error("Failed to migrate localStorage chats", { err: error });
  } finally {
    localStorage.setItem("privora-indexeddb-migrated", "true");
  }
};
