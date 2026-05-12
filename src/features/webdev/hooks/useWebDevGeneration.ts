import { useRef, type Dispatch, type SetStateAction } from "react";
import { getModelOption } from "../../../lib/models";
import type { Attachment } from "../../../lib/attachments";
import type { WebDevFileRecord, WebDevMessageRecord, WebDevProjectRecord } from "../../../lib/db";
import { buildWebDevSystemInstruction } from "../prompts/system";
import { streamWebDevResponse } from "../lib/provider";
import { applySearchReplacePatch } from "../lib/tools";
import {
  appendWebDevMessage,
  deleteWebDevPath,
  renameWebDevPath,
  replaceWebDevProjectFiles,
  updateWebDevMessage,
  updateWebDevProject,
  upsertWebDevFile,
} from "../lib/storage";
import type { WebDevFunctionResponse, WebDevProviderMessage, WebDevToolCall, WebDevToolDraft } from "../lib/types";
import { appendInternalInstruction, appendToolResults, messagesToProviderHistory, withToolCallId, type WebDevToolResultEntry } from "../runtime/providerMessages";
import { appendUserContextMessage, buildWebDevProjectContext } from "../runtime/contextCompiler";
import { estimateWebDevTokens } from "../runtime/tokenCounter";
import { getModelRuntimeLimits, getSafeWebDevMaxOutput } from "../runtime/modelLimits";
import { evaluateWebDevFinish } from "../runtime/completionGate";
import { createNoOutputNudge } from "../runtime/noToolPolicy";

type WebDevActivityPatch = Partial<Pick<WebDevMessageRecord, "activityOperation" | "activityStatus" | "additions" | "deletions">>;

type ToolExecutionResult = WebDevToolResultEntry;
type WebDevContentPart = NonNullable<WebDevMessageRecord["contentParts"]>[number];

interface UseWebDevGenerationOptions {
  project: WebDevProjectRecord | undefined;
  files: WebDevFileRecord[];
  messages: WebDevMessageRecord[];
  selectedModel: string;
  isThinkingEnabled: boolean;
  setProjects: Dispatch<SetStateAction<WebDevProjectRecord[]>>;
  setFiles: Dispatch<SetStateAction<WebDevFileRecord[]>>;
  setMessages: Dispatch<SetStateAction<WebDevMessageRecord[]>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
}

const getToolSummary = (call: WebDevToolCall | WebDevToolDraft) => {
  const args = call.arguments || {};
  if (call.name === "webdev_write_file") return `Updating ${args.path}`;
  if (call.name === "webdev_patch_file") return `Patching ${args.path}`;
  if (call.name === "webdev_delete_path") return `Deleting ${args.path}`;
  if (call.name === "webdev_rename_path") return `Renaming ${args.from} to ${args.to}`;
  if (call.name === "webdev_create_project") return `Creating ${(args.title as string) || "project"}`;
  if (call.name === "webdev_finish") return String(args.summary || "Done.");
  return "Working on the project";
};

const countLines = (value: string) => value ? value.split(/\r?\n/).length : 0;

const normalizeGeneratedContent = (path: string, content: string) => {
  if (/\.json$/i.test(path)) {
    try {
      return `${JSON.stringify(JSON.parse(content), null, 2)}\n`;
    } catch {
      return content.endsWith("\n") ? content : `${content}\n`;
    }
  }
  return content.endsWith("\n") ? content : `${content}\n`;
};

const getLineDelta = (before = "", after = "") => {
  if (!before && !after) return { additions: 0, deletions: 0 };
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const commonPrefixLength = (() => {
    let index = 0;
    while (index < beforeLines.length && index < afterLines.length && beforeLines[index] === afterLines[index]) index += 1;
    return index;
  })();
  let beforeEnd = beforeLines.length - 1;
  let afterEnd = afterLines.length - 1;
  while (beforeEnd >= commonPrefixLength && afterEnd >= commonPrefixLength && beforeLines[beforeEnd] === afterLines[afterEnd]) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }
  return {
    additions: Math.max(0, afterEnd - commonPrefixLength + 1),
    deletions: Math.max(0, beforeEnd - commonPrefixLength + 1),
  };
};

const asToolResponse = (response: WebDevFunctionResponse): WebDevFunctionResponse => response;

const mergeFinalSummary = (existing: string, summary: string) => {
  const cleanExisting = existing.trim();
  const cleanSummary = summary.trim();
  if (!cleanSummary) return cleanExisting;
  if (!cleanExisting) return cleanSummary;
  if (cleanExisting.includes(cleanSummary)) return cleanExisting;
  return `${cleanExisting}\n\n${cleanSummary}`;
};

const summarizeToolResults = (results: ToolExecutionResult[]) => {
  const changed = results.filter(result =>
    result.response.success &&
    ["webdev_write_file", "webdev_patch_file", "webdev_delete_path", "webdev_rename_path", "webdev_create_project"].includes(result.name)
  );
  if (changed.length === 0) return "The run paused before making confirmed file changes.";
  const paths = changed
    .map(result => String(result.response.meta?.path || result.response.data?.path || ""))
    .filter(Boolean);
  const preview = paths.slice(0, 6).join(", ");
  const extra = paths.length > 6 ? ` and ${paths.length - 6} more` : "";
  return `The run paused after ${changed.length} confirmed file ${changed.length === 1 ? "change" : "changes"}${preview ? `: ${preview}${extra}` : ""}.`;
};

const MUTATING_TOOL_NAMES = new Set([
  "webdev_write_file",
  "webdev_patch_file",
  "webdev_delete_path",
  "webdev_rename_path",
  "webdev_create_project",
]);

const hasSuccessfulMutation = (results: ToolExecutionResult[]) =>
  results.some(result => MUTATING_TOOL_NAMES.has(result.name) && result.response.success);

const getThoughtTitle = (text: string) => {
  const firstLine = text.split(/\r?\n/).map(line => line.trim()).find(Boolean) || "";
  const cleaned = firstLine.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
  if (!cleaned || cleaned.length > 72) return "Thought process";
  return cleaned;
};

const getToolCallSignature = (call: WebDevToolCall) => {
  const args = call.arguments || {};
  return `${call.name}:${JSON.stringify(args)}`;
};

export function useWebDevGeneration({
  project,
  files,
  messages,
  selectedModel,
  isThinkingEnabled,
  setProjects,
  setFiles,
  setMessages,
  setIsGenerating,
}: UseWebDevGenerationOptions) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamedPathActivityRef = useRef<Set<string>>(new Set());
  const activityByKeyRef = useRef<Map<string, WebDevMessageRecord>>(new Map());
  const pendingActivityByKeyRef = useRef<Map<string, Promise<WebDevMessageRecord>>>(new Map());
  const thoughtFlushTimerRef = useRef<number | null>(null);
  const baselineFilesRef = useRef<Map<string, string>>(new Map());
  const filesRef = useRef(files);
  const messagesRef = useRef(messages);
  filesRef.current = files;
  messagesRef.current = messages;

  const patchProject = (projectId: string, patch: Partial<WebDevProjectRecord>) => {
    setProjects(prev => prev.map(item => item.id === projectId ? { ...item, ...patch, updatedAt: Date.now() } : item));
  };

  const setFileRef = (nextFiles: WebDevFileRecord[]) => {
    filesRef.current = nextFiles;
  };

  const upsertFileRef = (file: WebDevFileRecord) => {
    const exists = filesRef.current.some(item => item.id === file.id);
    const next = (exists ? filesRef.current.map(item => item.id === file.id ? file : item) : [...filesRef.current, file])
      .sort((a, b) => a.path.localeCompare(b.path));
    setFileRef(next);
    return next;
  };

  const upsertMessageRef = (message: WebDevMessageRecord) => {
    const exists = messagesRef.current.some(item => item.id === message.id);
    const next = exists ? messagesRef.current.map(item => item.id === message.id ? message : item) : [...messagesRef.current, message];
    messagesRef.current = next;
    setMessages(() => next);
  };

  const appendMessagesRef = (nextMessages: WebDevMessageRecord[]) => {
    const seen = new Set(messagesRef.current.map(message => message.id));
    const next = [...messagesRef.current];
    nextMessages.forEach(message => {
      if (seen.has(message.id)) return;
      seen.add(message.id);
      next.push(message);
    });
    messagesRef.current = next;
    setMessages(() => next);
    return next;
  };

  const addActivity = async (projectId: string, content: string, filePath?: string, key = `${content}:${filePath || ""}`, patch: WebDevActivityPatch = {}) => {
    const existing = activityByKeyRef.current.get(key);
    if (existing) {
      const next = { ...existing, content, filePath, ...patch };
      activityByKeyRef.current.set(key, next);
      upsertMessageRef(next);
      void updateWebDevMessage(existing.id, { content, filePath, ...patch });
      return next;
    }
    const pending = pendingActivityByKeyRef.current.get(key);
    if (pending) {
      const created = await pending;
      const next = { ...created, content, filePath, ...patch };
      activityByKeyRef.current.set(key, next);
      upsertMessageRef(next);
      void updateWebDevMessage(created.id, { content, filePath, ...patch });
      return next;
    }
    const createPromise = appendWebDevMessage(projectId, "activity", content, { activityType: "tool", filePath, activityStatus: "running", ...patch });
    pendingActivityByKeyRef.current.set(key, createPromise);
    const message = await createPromise;
    pendingActivityByKeyRef.current.delete(key);
    if (activityByKeyRef.current.has(key)) return activityByKeyRef.current.get(key)!;
    activityByKeyRef.current.set(key, message);
    appendMessagesRef([message]);
    return message;
  };

  const settlePendingActivities = async () => {
    const pending = [...pendingActivityByKeyRef.current.values()];
    if (pending.length > 0) await Promise.allSettled(pending);
  };

  const finalizeRunningActivities = async (status: "done" | "error" = "done") => {
    await settlePendingActivities();
    const updates: Promise<void>[] = [];
    activityByKeyRef.current.forEach((message, key) => {
      if (message.activityStatus !== "running") return;
      const next = { ...message, activityStatus: status };
      activityByKeyRef.current.set(key, next);
      upsertMessageRef(next);
      updates.push(updateWebDevMessage(message.id, { activityStatus: status }));
    });
    if (updates.length > 0) await Promise.allSettled(updates);
  };

  const applyDraft = async (projectId: string, draft: WebDevToolDraft) => {
    if (draft.name !== "webdev_write_file") return;
    const path = typeof draft.arguments.path === "string" ? draft.arguments.path : "";
    const content = typeof draft.arguments.content === "string" ? draft.arguments.content : "";
    if (!path) return;
    if (!streamedPathActivityRef.current.has(path)) {
      streamedPathActivityRef.current.add(path);
      void addActivity(projectId, `Writing ${path}`, path, `write:${path}`, { activityOperation: "updated", activityStatus: "running" });
      patchProject(projectId, { activeFilePath: path });
    }
    const file = await upsertWebDevFile(projectId, { path, content, status: "streaming", summary: "Streaming" });
    upsertFileRef(file);
    setFiles(prev => {
      const exists = prev.some(item => item.id === file.id);
      return exists ? prev.map(item => item.id === file.id ? file : item) : [...prev, file].sort((a, b) => a.path.localeCompare(b.path));
    });
  };

  const persistToolResult = async (
    projectId: string,
    call: Required<Pick<WebDevToolCall, "id">> & WebDevToolCall,
    response: WebDevFunctionResponse,
    iteration: number
  ) => {
    const message = await appendWebDevMessage(projectId, "tool", response.output || response.error || "", {
      hiddenFromChat: true,
      toolCallId: call.id,
      toolName: call.name,
      toolArguments: call.arguments,
      toolResult: response as unknown as Record<string, unknown>,
      toolStatus: response.success ? "completed" : "failed",
      iteration,
    });
    upsertMessageRef(message);
  };

  const persistAssistantToolCall = async (
    projectId: string,
    call: Required<Pick<WebDevToolCall, "id">> & WebDevToolCall,
    iteration: number
  ) => {
    const message = await appendWebDevMessage(projectId, "assistant", "", {
      hiddenFromChat: true,
      toolCallId: call.id,
      toolName: call.name,
      toolArguments: call.arguments,
      toolStatus: "running",
      iteration,
    });
    upsertMessageRef(message);
  };

  const applyToolCall = async (
    projectId: string,
    rawCall: WebDevToolCall,
    changedPaths: Set<string>,
    iteration: number
  ): Promise<ToolExecutionResult> => {
    const call = withToolCallId(rawCall);
    const args = call.arguments || {};
    const fail = async (error: string, meta: Record<string, unknown> = {}) => {
      const response = asToolResponse({ success: false, error, meta });
      await persistToolResult(projectId, call, response, iteration);
      return { id: call.id, name: call.name, arguments: call.arguments, response };
    };
    const ok = async (response: Omit<WebDevFunctionResponse, "success">) => {
      const next = asToolResponse({ success: true, ...response });
      await persistToolResult(projectId, call, next, iteration);
      return { id: call.id, name: call.name, arguments: call.arguments, response: next };
    };

    if (call.name !== "webdev_finish") {
      const path = typeof args.path === "string" ? args.path : undefined;
      const key = call.name === "webdev_write_file" && path ? `write:${path}` : `${call.name}:${path || args.from || ""}:${args.to || ""}`;
      await addActivity(projectId, getToolSummary(call), path, key, { activityStatus: "running" });
    }

    if (call.name === "webdev_create_project") {
      const title = typeof args.title === "string" ? args.title : "Web app";
      const nextFiles = Array.isArray(args.files)
        ? args.files
            .map((file: any) => ({
              path: typeof file.path === "string" ? file.path : "",
              content: typeof file.content === "string" ? file.content : "",
            }))
            .filter(file => file.path)
        : [];
      await updateWebDevProject(projectId, { title, status: "generating" });
      const records = await replaceWebDevProjectFiles(projectId, nextFiles);
      setFileRef(records);
      setProjects(prev => prev.map(item => item.id === projectId ? { ...item, title, status: "generating", updatedAt: Date.now() } : item));
      setFiles(records);
      records.forEach(file => changedPaths.add(file.path));
      await addActivity(projectId, `Created ${records.length} files`, undefined, "webdev_create_project:::", {
        activityOperation: "created_project",
        activityStatus: "done",
        additions: records.reduce((total, file) => total + countLines(file.content), 0),
        deletions: 0,
      });
      return ok({
        output: `Created project "${title}" with ${records.length} file${records.length === 1 ? "" : "s"}.`,
        data: { title, files: records.map(file => file.path) },
        meta: { operation: "created_project", fileCount: records.length },
      });
    }

    if (call.name === "webdev_write_file") {
      const path = String(args.path || "");
      const nextContent = normalizeGeneratedContent(path, String(args.content || ""));
      const before = baselineFilesRef.current.get(path) || "";
      const existed = baselineFilesRef.current.has(path);
      const delta = existed ? getLineDelta(before, nextContent) : { additions: countLines(nextContent), deletions: 0 };
      const file = await upsertWebDevFile(projectId, {
        path,
        content: nextContent,
        status: "ready",
        summary: typeof args.summary === "string" ? args.summary : undefined,
      });
      upsertFileRef(file);
      setFiles(prev => {
        const exists = prev.some(item => item.id === file.id);
        return exists ? prev.map(item => item.id === file.id ? file : item) : [...prev, file].sort((a, b) => a.path.localeCompare(b.path));
      });
      changedPaths.add(file.path);
      await addActivity(projectId, `${existed ? "Edited" : "Created"} ${file.path}`, file.path, `write:${file.path}`, {
        activityOperation: existed ? "updated" : "created",
        activityStatus: "done",
        additions: delta.additions,
        deletions: delta.deletions,
      });
      patchProject(projectId, { activeFilePath: file.path });
      return ok({
        output: `${existed ? "Edited" : "Created"} ${file.path}`,
        data: { path: file.path },
        meta: {
          operation: existed ? "updated" : "created",
          path: file.path,
          additions: delta.additions,
          deletions: delta.deletions,
          wasNew: !existed,
        },
      });
    }

    if (call.name === "webdev_patch_file") {
      const path = String(args.path || "");
      const current = filesRef.current.find(file => file.path === path);
      const patched = current ? applySearchReplacePatch(current.content, args.patch) : null;
      if (current && patched !== null) {
        const before = baselineFilesRef.current.get(path) || current.content;
        const delta = getLineDelta(before, patched);
        const nextContent = normalizeGeneratedContent(path, patched);
        const file = await upsertWebDevFile(projectId, {
          path,
          content: nextContent,
          status: "ready",
          summary: typeof args.summary === "string" ? args.summary : undefined,
        });
        upsertFileRef(file);
        setFiles(prev => prev.map(item => item.id === file.id ? file : item));
        changedPaths.add(file.path);
        await addActivity(projectId, `Patched ${file.path}`, file.path, `webdev_patch_file:${file.path}::`, {
          activityOperation: "patched",
          activityStatus: "done",
          additions: delta.additions,
          deletions: delta.deletions,
        });
        patchProject(projectId, { activeFilePath: file.path });
        return ok({
          output: `Patched ${file.path}`,
          data: { path: file.path },
          meta: {
            operation: "patched",
            path: file.path,
            additions: delta.additions,
            deletions: delta.deletions,
          },
        });
      } else {
        await addActivity(projectId, `Patch skipped because exact source text was not found in ${path}.`, path, `webdev_patch_file:${path}::`, {
          activityOperation: "skipped",
          activityStatus: "error",
        });
        return fail(`Patch skipped because exact source text was not found in ${path}.`, {
          operation: "skipped",
          path,
        });
      }
    }

    if (call.name === "webdev_delete_path") {
      const deleted = await deleteWebDevPath(projectId, String(args.path || ""));
      setFileRef(filesRef.current.filter(file => !deleted.some(target => target.id === file.id)));
      setFiles(prev => prev.filter(file => !deleted.some(target => target.id === file.id)));
      deleted.forEach(file => changedPaths.add(file.path));
      await addActivity(projectId, `Deleted ${deleted.length} ${deleted.length === 1 ? "file" : "files"}`, String(args.path || ""), `webdev_delete_path:${args.path || ""}:`, {
        activityOperation: "deleted",
        activityStatus: "done",
        additions: 0,
        deletions: deleted.reduce((total, file) => total + countLines(file.content), 0),
      });
      return ok({
        output: `Deleted ${deleted.length} ${deleted.length === 1 ? "file" : "files"}.`,
        data: { path: String(args.path || ""), files: deleted.map(file => file.path) },
        meta: {
          operation: "deleted",
          path: String(args.path || ""),
          fileCount: deleted.length,
          deletions: deleted.reduce((total, file) => total + countLines(file.content), 0),
        },
      });
    }

    if (call.name === "webdev_rename_path") {
      const fromPath = String(args.from || "");
      const renamed = await renameWebDevPath(projectId, String(args.from || ""), String(args.to || ""));
      setFileRef([
        ...filesRef.current.filter(file => file.path !== fromPath && !file.path.startsWith(`${fromPath}/`)),
        ...renamed,
      ].sort((a, b) => a.path.localeCompare(b.path)));
      setFiles(prev => {
        return [
          ...prev.filter(file => file.path !== fromPath && !file.path.startsWith(`${fromPath}/`)),
          ...renamed,
        ].sort((a, b) => a.path.localeCompare(b.path));
      });
      renamed.forEach(file => changedPaths.add(file.path));
      await addActivity(projectId, `Renamed ${fromPath} to ${args.to || ""}`, renamed[0]?.path || fromPath, `webdev_rename_path:${fromPath}:${args.to || ""}`, {
        activityOperation: "renamed",
        activityStatus: "done",
      });
      return ok({
        output: `Renamed ${fromPath} to ${args.to || ""}.`,
        data: { from: fromPath, to: String(args.to || ""), files: renamed.map(file => file.path) },
        meta: { operation: "renamed", from: fromPath, to: String(args.to || ""), fileCount: renamed.length },
      });
    }

    if (call.name === "webdev_list_files") {
      const activeFiles = filesRef.current.filter(file => file.status !== "deleted");
      return ok({
        output: activeFiles.length
          ? activeFiles.map(file => `${file.path} (${countLines(file.content)} lines, ${file.status})`).join("\n")
          : "No files exist yet.",
        data: {
          files: activeFiles.map(file => ({
            path: file.path,
            status: file.status,
            lines: countLines(file.content),
            chars: file.content.length,
          })),
        },
      });
    }

    if (call.name === "webdev_read_file") {
      const path = String(args.path || "");
      const file = filesRef.current.find(item => item.path === path);
      if (!file) return fail(`File not found: ${path}`, { path });
      return ok({
        output: `--- file: ${file.path}\n${file.content}`,
        data: { path: file.path, content: file.content },
        meta: { path: file.path, lines: countLines(file.content), chars: file.content.length },
      });
    }

    if (call.name === "webdev_finish") {
      const summary = typeof args.summary === "string" ? args.summary : "Done.";
      return ok({ output: summary, data: { summary } });
    }

    return fail(`Unknown Web Dev tool: ${call.name}`);
  };

  const sendWebDevMessage = async (prompt: string, attachments: Attachment[] = []) => {
    if (!project || !prompt.trim()) return;
    const projectId = project.id;
    const provider = getModelOption(selectedModel)?.provider;
    const supportsThinking = getModelRuntimeLimits(selectedModel).supportsThinking;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setIsGenerating(true);
    streamedPathActivityRef.current = new Set();
    activityByKeyRef.current = new Map();
    pendingActivityByKeyRef.current = new Map();
    baselineFilesRef.current = new Map(filesRef.current.map(file => [file.path, file.content]));
    const startedEmpty = baselineFilesRef.current.size === 0;
    patchProject(projectId, { status: "generating", selectedModel });
    await updateWebDevProject(projectId, { status: "generating", selectedModel });

    const userMessage = await appendWebDevMessage(projectId, "user", prompt.trim() || "Please use the attached files.", { attachments });
    const assistantMessage = await appendWebDevMessage(projectId, "assistant", "");
    const historyBeforeTurn = messagesRef.current.filter(message => message.projectId === projectId);
    appendMessagesRef([userMessage, assistantMessage]);

    let assistantText = "";
    let assistantThought = "";
    let assistantContentParts: WebDevContentPart[] = [];
    let activeThinkingPartIndex: number | null = null;
    const changedPaths = new Set<string>();
    const syncAssistantMessage = (patch: Partial<WebDevMessageRecord> = {}) => {
      const nextAssistant = {
        ...assistantMessage,
        content: assistantText,
        thought: assistantThought,
        isThinking: activeThinkingPartIndex !== null,
        contentParts: assistantContentParts,
        ...patch,
      };
      upsertMessageRef(nextAssistant);
      void updateWebDevMessage(assistantMessage.id, {
        content: nextAssistant.content,
        thought: nextAssistant.thought,
        isThinking: nextAssistant.isThinking,
        contentParts: nextAssistant.contentParts,
        ...patch,
      });
    };
    const flushThought = () => {
      if (thoughtFlushTimerRef.current !== null) {
        window.clearTimeout(thoughtFlushTimerRef.current);
        thoughtFlushTimerRef.current = null;
      }
      syncAssistantMessage();
    };
    const scheduleThoughtFlush = () => {
      if (thoughtFlushTimerRef.current !== null) return;
      thoughtFlushTimerRef.current = window.setTimeout(flushThought, 140);
    };
    const appendThinkingDelta = (delta: string) => {
      if (!delta) return;
      if (activeThinkingPartIndex === null) {
        assistantContentParts = [
          ...assistantContentParts,
          {
            type: "thinking",
            text: "",
            title: "Thinking",
            active: true,
            startedAt: Date.now(),
          },
        ];
        activeThinkingPartIndex = assistantContentParts.length - 1;
      }
      assistantThought += delta;
      assistantContentParts = assistantContentParts.map((part, index) => {
        if (index !== activeThinkingPartIndex) return part;
        const nextText = `${part.text}${delta}`;
        return {
          ...part,
          text: nextText,
          title: getThoughtTitle(nextText),
          active: true,
        };
      });
      scheduleThoughtFlush();
    };
    const endActiveThinkingPart = () => {
      if (activeThinkingPartIndex === null) return;
      assistantContentParts = assistantContentParts.map((part, index) =>
        index === activeThinkingPartIndex
          ? { ...part, active: false, endedAt: Date.now(), title: getThoughtTitle(part.text) }
          : part
      );
      activeThinkingPartIndex = null;
      syncAssistantMessage();
    };
    const appendFinalAssistantMessage = async (summary: string, shouldSplit: boolean, removeTail = "") => {
      const cleanSummary = summary.trim();
      if (!cleanSummary) return;

      if (!shouldSplit || assistantText.trim().length === 0) {
        assistantText = mergeFinalSummary(assistantText, cleanSummary);
        syncAssistantMessage({ content: assistantText, isThinking: false });
        return;
      }

      if (removeTail && assistantText.endsWith(removeTail)) {
        assistantText = assistantText.slice(0, -removeTail.length).trimEnd();
        syncAssistantMessage({ content: assistantText, isThinking: false });
      } else {
        syncAssistantMessage({ isThinking: false });
      }

      const finalMessage = await appendWebDevMessage(projectId, "assistant", cleanSummary);
      appendMessagesRef([finalMessage]);
    };

    try {
      let providerMessages: WebDevProviderMessage[] = messagesToProviderHistory([
        ...historyBeforeTurn,
        userMessage,
      ]);
      const context = buildWebDevProjectContext({
        projectTitle: project.title,
        userPrompt: prompt.trim(),
        files: filesRef.current,
        attachments,
        model: selectedModel,
      });
      providerMessages = appendUserContextMessage(providerMessages, context.text, attachments);

      const maxIterations = 8;
      let completed = false;
      let lastToolResults: ToolExecutionResult[] = [];
      const allToolResults: ToolExecutionResult[] = [];

      for (let iteration = 1; iteration <= maxIterations && !completed; iteration += 1) {
        const toolCalls: Array<Required<Pick<WebDevToolCall, "id">> & WebDevToolCall> = [];
        const seenToolCalls = new Set<string>();
        let iterationText = "";
        await streamWebDevResponse({
          provider,
          model: selectedModel,
          systemInstruction: buildWebDevSystemInstruction(),
          providerMessages,
          maxOutputTokens: getSafeWebDevMaxOutput(
            selectedModel,
            estimateWebDevTokens(JSON.stringify(providerMessages), "messages.json") + context.estimatedTokens
          ),
          files: filesRef.current,
          messages: messagesRef.current,
          attachments,
          reasoningEnabled: isThinkingEnabled && supportsThinking,
          signal: abortController.signal,
          onTextDelta: (delta) => {
            endActiveThinkingPart();
            assistantText += delta;
            iterationText += delta;
            syncAssistantMessage({ isThinking: false });
          },
          onThoughtDelta: (delta) => {
            appendThinkingDelta(delta);
          },
          onToolDelta: (draft) => {
            endActiveThinkingPart();
            void applyDraft(projectId, draft);
          },
          onToolCall: (call) => {
            endActiveThinkingPart();
            const normalized = withToolCallId(call);
            const signature = normalized.id || getToolCallSignature(normalized);
            const argsSignature = getToolCallSignature(normalized);
            if (seenToolCalls.has(signature) || seenToolCalls.has(argsSignature)) return;
            seenToolCalls.add(signature);
            seenToolCalls.add(argsSignature);
            toolCalls.push(normalized);
          },
        });

        endActiveThinkingPart();
        if (assistantThought) flushThought();

        if (toolCalls.length === 0) {
          const hasFreshVisibleText = iterationText.trim().length > 0;
          if (hasFreshVisibleText) {
            if (hasSuccessfulMutation(allToolResults)) {
              const finishGate = evaluateWebDevFinish({ files: filesRef.current, startedEmpty, toolResults: allToolResults });
              if (!finishGate.accepted) {
                providerMessages = appendInternalInstruction(
                  providerMessages,
                  finishGate.reason || "The project is not ready to finish. Continue with the next required tool step."
                );
                continue;
              }
              await appendFinalAssistantMessage(iterationText, true, iterationText);
            }
            completed = true;
            break;
          }

          const continuation = createNoOutputNudge(allToolResults.length > 0);
          providerMessages = appendInternalInstruction(providerMessages, continuation);
          continue;
        }

        providerMessages = [
          ...providerMessages,
          {
            role: "assistant",
            content: iterationText,
            parts: [
              ...(iterationText.trim() ? [{ type: "text" as const, text: iterationText }] : []),
              ...toolCalls.map(call => ({
                type: "function_call" as const,
                id: call.id,
                name: call.name,
                arguments: call.arguments,
                thoughtSignature: call.thoughtSignature,
              })),
            ],
          },
        ];

        const results: ToolExecutionResult[] = [];
        for (const call of toolCalls) {
          if (abortController.signal.aborted) break;
          await persistAssistantToolCall(projectId, call, iteration);
          const result = await applyToolCall(projectId, call, changedPaths, iteration);
          results.push(result);
        }
        lastToolResults = results;
        allToolResults.push(...results);
        providerMessages = appendToolResults(providerMessages, results);

        const failedEdit = results.find(result =>
          !result.response.success &&
          ["webdev_write_file", "webdev_patch_file", "webdev_delete_path", "webdev_rename_path", "webdev_create_project"].includes(result.name)
        );
        if (failedEdit) {
          providerMessages = appendInternalInstruction(
            providerMessages,
            `An edit tool failed: ${failedEdit.response.error || failedEdit.response.output || "unknown failure"}. Inspect the current file state and recover with a different tool strategy before finishing.`
          );
          continue;
        }

        const finish = results.find(result => result.name === "webdev_finish" && result.response.success);
        if (finish) {
          const finishGate = evaluateWebDevFinish({ files: filesRef.current, startedEmpty, toolResults: allToolResults });
          if (!finishGate.accepted) {
            providerMessages = appendInternalInstruction(
              providerMessages,
              finishGate.reason || "The project is not ready to finish. Continue with the next required tool step."
            );
            continue;
          }
          const summary = String(finish.response.output || "Done.");
          await appendFinalAssistantMessage(summary, hasSuccessfulMutation(allToolResults));
          completed = true;
          break;
        }
      }

      if (!completed) {
        const fallback = allToolResults.length > 0
          ? summarizeToolResults(allToolResults)
          : lastToolResults.length > 0
            ? "The run paused after tool work. Review the latest file changes and send another message to continue."
            : "I could not complete the Web Dev turn. Please try again.";
        assistantText = mergeFinalSummary(assistantText, fallback);
        syncAssistantMessage({ content: assistantText, isThinking: false });
      } else {
        syncAssistantMessage({ isThinking: false });
      }
      await finalizeRunningActivities("done");
      patchProject(projectId, { status: "idle" });
      await updateWebDevProject(projectId, { status: "idle" });
    } catch (error: any) {
      endActiveThinkingPart();
      if (assistantThought) flushThought();
      const isStopped = error?.name === "AbortError" || abortController.signal.aborted;
      const content = isStopped
        ? "Stopped. Any completed file changes are still here."
        : error instanceof Error ? error.message : "Web Dev generation failed.";
      assistantText = content;
      syncAssistantMessage({ content, isThinking: false });
      await finalizeRunningActivities(isStopped ? "done" : "error");
      patchProject(projectId, { status: isStopped ? "idle" : "error", error: isStopped ? undefined : content });
      await updateWebDevProject(projectId, { status: isStopped ? "idle" : "error", error: isStopped ? undefined : content });
    } finally {
      if (thoughtFlushTimerRef.current !== null) {
        window.clearTimeout(thoughtFlushTimerRef.current);
        thoughtFlushTimerRef.current = null;
      }
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const stopWebDevGeneration = () => {
    abortControllerRef.current?.abort();
  };

  return {
    sendWebDevMessage,
    stopWebDevGeneration,
  };
}
