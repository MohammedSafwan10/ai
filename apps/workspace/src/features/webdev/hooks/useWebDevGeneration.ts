import { useRef, type Dispatch, type SetStateAction } from "react";
import { getModelOption } from "../../../lib/models";
import { ensureAttachmentsHaveBase64, type Attachment } from "../../../lib/attachments";
import type { WebDevBuildPlanRecord, WebDevFileRecord, WebDevMessageRecord, WebDevProjectRecord } from "../../../lib/db";
import { buildWebDevSystemInstruction } from "../prompts/system";
import { streamWebDevResponse } from "../lib/provider";
import { applySearchReplacePatch } from "../lib/tools";
import {
  appendWebDevMessage,
  bulkUpsertWebDevFiles,
  deleteWebDevPath,
  renameWebDevPath,
  replaceWebDevProjectFiles,
  settleRunningWebDevActivities,
  updateWebDevMessage,
  updateWebDevProject,
  upsertWebDevFile,
} from "../lib/storage";
import type { WebDevFileDiff, WebDevFunctionResponse, WebDevProviderMessage, WebDevToolCall, WebDevToolDraft } from "../lib/types";
import { appendInternalInstruction, appendToolResults, messagesToProviderHistory, withToolCallId, type WebDevToolResultEntry } from "../runtime/providerMessages";
import { appendUserContextMessage, buildWebDevProjectContext } from "../runtime/contextCompiler";
import { estimateWebDevTokens } from "../runtime/tokenCounter";
import { getModelRuntimeLimits, getSafeWebDevMaxOutput } from "../runtime/modelLimits";
import { evaluateWebDevFinish } from "../runtime/completionGate";
import { createNoOutputNudge } from "../runtime/noToolPolicy";
import { extractDiagnosticsFromOutput, outlineWebDevFile, searchWebDevFiles } from "../runtime/inspection";
import { getSafeWebDevScriptError, runWebDevNpmScript } from "../runtime/webcontainer";

type WebDevActivityPatch = Partial<Pick<WebDevMessageRecord, "activityOperation" | "activityStatus" | "activityDetail" | "additions" | "deletions" | "beforeContent" | "afterContent">>;

type ToolExecutionResult = WebDevToolResultEntry;
type WebDevContentPart = NonNullable<WebDevMessageRecord["contentParts"]>[number];

interface UseWebDevGenerationOptions {
  project: WebDevProjectRecord | undefined;
  threadId?: string;
  files: WebDevFileRecord[];
  messages: WebDevMessageRecord[];
  selectedModel: string;
  isThinkingEnabled: boolean;
  setProjects: Dispatch<SetStateAction<WebDevProjectRecord[]>>;
  setFiles: Dispatch<SetStateAction<WebDevFileRecord[]>>;
  setMessages: Dispatch<SetStateAction<WebDevMessageRecord[]>>;
  setIsGenerating: Dispatch<SetStateAction<boolean>>;
  onPatchPreviewChange?: (diff: WebDevFileDiff | null) => void;
}

const getToolSummary = (call: WebDevToolCall | WebDevToolDraft) => {
  const args = call.arguments || {};
  if (call.name === "webdev_write_file") return `Updating ${args.path}`;
  if (call.name === "webdev_patch_file") return `Patching ${args.path}`;
  if (call.name === "webdev_delete_path") return `Deleting ${args.path}`;
  if (call.name === "webdev_rename_path") return `Renaming ${args.from} to ${args.to}`;
  if (call.name === "webdev_create_project") return `Creating ${(args.title as string) || "project"}`;
  if (call.name === "webdev_set_build_plan") return "Planning app architecture";
  if (call.name === "webdev_search_files") return "Searching project files";
  if (call.name === "webdev_file_outline") return `Outlining ${args.path}`;
  if (call.name === "webdev_get_diagnostics") return "Checking diagnostics";
  if (call.name === "webdev_run_command") return `Running npm run ${args.script}`;
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
  if (before === after) return { additions: 0, deletions: 0 };
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);

  const beforeCounts = new Map<string, number>();
  beforeLines.forEach(line => {
    beforeCounts.set(line, (beforeCounts.get(line) || 0) + 1);
  });

  let additions = 0;
  afterLines.forEach(line => {
    const count = beforeCounts.get(line) || 0;
    if (count > 0) {
      beforeCounts.set(line, count - 1);
      return;
    }
    additions += 1;
  });

  let deletions = 0;
  for (const count of beforeCounts.values()) {
    deletions += count;
  }

  return { additions, deletions };
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

const getReadableWebDevError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "Web Dev generation failed.");
  if (/gemini web dev request failed with 500|internal server error/i.test(message)) {
    return "The model provider stopped with a temporary server error. Completed file changes were preserved; send continue to resume from the current project state.";
  }
  if (/auth_unavailable|invalidated oauth token|no auth available/i.test(message)) {
    return "The selected model provider is not authenticated right now. Completed file changes were preserved; switch models or sign in again, then continue.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "The model stream was interrupted by a network error. Completed file changes were preserved; send continue to resume.";
  }
  return message;
};

const MUTATING_TOOL_NAMES = new Set([
  "webdev_write_file",
  "webdev_patch_file",
  "webdev_delete_path",
  "webdev_rename_path",
  "webdev_create_project",
]);

const STREAMING_DRAFT_TOOL_NAMES = new Set([
  "webdev_write_file",
  "webdev_patch_file",
]);

const hasSuccessfulMutation = (results: ToolExecutionResult[]) =>
  results.some(result => MUTATING_TOOL_NAMES.has(result.name) && result.response.success);

const hasSuccessfulVerification = (results: ToolExecutionResult[]) =>
  results.some(result =>
    result.response.success &&
    (result.name === "webdev_get_diagnostics" || (result.name === "webdev_run_command" && ["build", "lint", "test", "typecheck"].includes(String(result.arguments.script || ""))))
  );

const chooseDiagnosticsScript = (files: WebDevFileRecord[]) =>
  ["build", "lint", "typecheck", "test"].find(script => !getSafeWebDevScriptError(files, script)) || "build";

const MAX_WEBDEV_AGENT_ITERATIONS = 80;
const MAX_WEBDEV_AGENT_RUN_MS = 45 * 60 * 1000;

const getActivityOperationForTool = (name: string): WebDevMessageRecord["activityOperation"] => {
  if (name === "webdev_write_file") return "updated";
  if (name === "webdev_patch_file") return "patched";
  if (name === "webdev_delete_path") return "deleted";
  if (name === "webdev_rename_path") return "renamed";
  if (name === "webdev_create_project") return "created_project";
  if (name === "webdev_set_build_plan") return "outlined";
  if (name === "webdev_search_files") return "searched";
  if (name === "webdev_file_outline") return "outlined";
  if (name === "webdev_get_diagnostics") return "checked";
  if (name === "webdev_run_command") return "command";
  return undefined;
};

const getActivityKeyForTool = (call: Pick<WebDevToolCall, "name" | "arguments">) => {
  const args = call.arguments || {};
  if (call.name === "webdev_write_file" && typeof args.path === "string") return `write:${args.path}`;
  if (call.name === "webdev_patch_file" && typeof args.path === "string") return `webdev_patch_file:${args.path}::`;
  if (call.name === "webdev_delete_path") return `webdev_delete_path:${args.path || ""}:`;
  if (call.name === "webdev_rename_path") return `webdev_rename_path:${args.from || ""}:${args.to || ""}`;
  if (call.name === "webdev_search_files") return `webdev_search_files:${args.query || ""}:${args.includePattern || ""}`;
  if (call.name === "webdev_file_outline") return `webdev_file_outline:${args.path || ""}:`;
  if (call.name === "webdev_get_diagnostics") return "webdev_get_diagnostics::";
  if (call.name === "webdev_run_command") return `webdev_run_command:${args.script || ""}:`;
  if (call.name === "webdev_create_project") return "webdev_create_project:::";
  if (call.name === "webdev_set_build_plan") return "webdev_set_build_plan:::";
  return `${call.name}:${args.path || args.from || args.script || ""}:${args.to || ""}`;
};

const getActivityPathForTool = (call: Pick<WebDevToolCall, "name" | "arguments">) => {
  const args = call.arguments || {};
  if (typeof args.path === "string") return args.path;
  if (typeof args.from === "string") return args.from;
  return undefined;
};

const isLikelyCompleteWebDevPath = (path?: string) =>
  Boolean(path && !/[{}\n\r]/.test(path) && /(^|\/)[^/]+\.[^/]+$/.test(path));

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
  threadId,
  files,
  messages,
  selectedModel,
  isThinkingEnabled,
  setProjects,
  setFiles,
  setMessages,
  setIsGenerating,
  onPatchPreviewChange,
}: UseWebDevGenerationOptions) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamedPathActivityRef = useRef<Set<string>>(new Set());
  const activityByKeyRef = useRef<Map<string, WebDevMessageRecord>>(new Map());
  const pendingActivityByKeyRef = useRef<Map<string, Promise<WebDevMessageRecord>>>(new Map());
  const inlineActivityKeysRef = useRef<Set<string>>(new Set());
  const thoughtFlushTimerRef = useRef<number | null>(null);
  const baselineFilesRef = useRef<Map<string, string>>(new Map());
  const buildPlanRef = useRef<WebDevBuildPlanRecord | undefined>(project?.buildPlan);
  const projectIdRef = useRef<string | undefined>(project?.id);
  const filesRef = useRef(files);
  const messagesRef = useRef(messages);
  const patchPreviewPathRef = useRef<string | null>(null);
  const patchPreviewContentRef = useRef<Map<string, string>>(new Map());
  const patchPreviewUpdatedAtRef = useRef<Map<string, number>>(new Map());
  if (projectIdRef.current !== project?.id) {
    projectIdRef.current = project?.id;
    activityByKeyRef.current = new Map();
    pendingActivityByKeyRef.current = new Map();
    inlineActivityKeysRef.current = new Set();
    streamedPathActivityRef.current = new Set();
    patchPreviewPathRef.current = null;
    patchPreviewContentRef.current.clear();
    patchPreviewUpdatedAtRef.current.clear();
  }
  buildPlanRef.current = project?.buildPlan;
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

  const clearOtherStreamingFiles = async (projectId: string, activePath?: string) => {
    const streamingFiles = filesRef.current.filter(file => file.projectId === projectId && file.status === "streaming" && file.path !== activePath);
    if (streamingFiles.length === 0) return;
    const nextFiles = filesRef.current.map(file =>
      streamingFiles.some(streaming => streaming.id === file.id)
        ? { ...file, status: "ready" as const, updatedAt: Date.now() }
        : file
    );
    setFileRef(nextFiles);
    setFiles(nextFiles);
    await Promise.allSettled(streamingFiles.map(file => upsertWebDevFile(projectId, {
      path: file.path,
      content: file.content,
      status: "ready",
      summary: file.summary,
    })));
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
    const createPromise = appendWebDevMessage(projectId, threadId, "activity", content, { activityType: "tool", filePath, activityStatus: "running", ...patch });
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
    const runningMessages = messagesRef.current.filter(message => message.projectId === project?.id && message.role === "activity" && message.activityStatus === "running");
    runningMessages.forEach(message => {
      const next = { ...message, activityStatus: status };
      upsertMessageRef(next);
      updates.push(updateWebDevMessage(message.id, { activityStatus: status }));
    });
    activityByKeyRef.current.forEach((message, key) => {
      if (message.activityStatus !== "running") return;
      const next = { ...message, activityStatus: status };
      activityByKeyRef.current.set(key, next);
      upsertMessageRef(next);
      updates.push(updateWebDevMessage(message.id, { activityStatus: status }));
    });
    if (updates.length > 0) await Promise.allSettled(updates);
  };

  const finalizeRunningActivitiesForPath = async (projectId: string, path: string, status: "done" | "error" = "done") => {
    await settlePendingActivities();
    const updates: Promise<void>[] = [];
    messagesRef.current
      .filter(message => message.projectId === projectId && message.role === "activity" && message.filePath === path && message.activityStatus === "running")
      .forEach(message => {
        const next = { ...message, activityStatus: status };
        upsertMessageRef(next);
        updates.push(updateWebDevMessage(message.id, { activityStatus: status }));
      });
    activityByKeyRef.current.forEach((message, key) => {
      if (message.filePath !== path || message.activityStatus !== "running") return;
      const next = { ...message, activityStatus: status };
      activityByKeyRef.current.set(key, next);
      upsertMessageRef(next);
      updates.push(updateWebDevMessage(message.id, { activityStatus: status }));
    });
    if (updates.length > 0) await Promise.allSettled(updates);
  };

  const showToolDraftActivity = async (
    projectId: string,
    draft: WebDevToolDraft | WebDevToolCall,
    onActivity?: (message: WebDevMessageRecord, key: string) => void
  ) => {
    if (draft.name === "webdev_finish") return;
    const rawPath = getActivityPathForTool(draft);
    if (
      rawPath &&
      !isLikelyCompleteWebDevPath(rawPath) &&
      ["webdev_write_file", "webdev_patch_file", "webdev_file_outline"].includes(draft.name)
    ) {
      return;
    }
    const path = isLikelyCompleteWebDevPath(rawPath) ? rawPath : undefined;
    const key = getActivityKeyForTool(draft);
    const activity = await addActivity(projectId, getToolSummary(draft), path, key, {
      activityOperation: getActivityOperationForTool(draft.name),
      activityStatus: "running",
    });
    onActivity?.(activity, key);
    if (path) patchProject(projectId, { activeFilePath: path });
  };

  const applyDraft = async (
    projectId: string,
    draft: WebDevToolDraft,
    onActivity?: (message: WebDevMessageRecord, key: string) => void
  ) => {
    await showToolDraftActivity(projectId, draft, onActivity);
    if (draft.name === "webdev_patch_file") {
      const path = typeof draft.arguments.path === "string" ? draft.arguments.path : "";
      if (!isLikelyCompleteWebDevPath(path)) return;
      const current = filesRef.current.find(file => file.path === path && file.status !== "deleted");
      if (!current) return;
      const patched = applySearchReplacePatch(current.content, draft.arguments.patch);
      if (patched === null || patched === current.content) return;
      const nextContent = normalizeGeneratedContent(path, patched);
      const now = Date.now();
      const previousPreview = patchPreviewContentRef.current.get(path);
      const previousPreviewAt = patchPreviewUpdatedAtRef.current.get(path) || 0;
      if (previousPreview === nextContent || now - previousPreviewAt < 120) return;
      const delta = getLineDelta(current.content, nextContent);
      patchPreviewContentRef.current.set(path, nextContent);
      patchPreviewUpdatedAtRef.current.set(path, now);
      patchPreviewPathRef.current = path;
      patchProject(projectId, { activeFilePath: path });
      const activity = await addActivity(projectId, `Patching ${path}`, path, `webdev_patch_file:${path}::`, {
        activityOperation: "patched",
        activityStatus: "running",
        additions: delta.additions,
        deletions: delta.deletions,
        beforeContent: current.content,
        afterContent: nextContent,
      });
      onActivity?.(activity, `webdev_patch_file:${path}::`);
      onPatchPreviewChange?.({
        path,
        beforeContent: current.content,
        afterContent: nextContent,
        status: "previewing",
      });
      return;
    }
    if (draft.name !== "webdev_write_file") return;
    const path = typeof draft.arguments.path === "string" ? draft.arguments.path : "";
    const content = typeof draft.arguments.content === "string" ? draft.arguments.content : "";
    if (!isLikelyCompleteWebDevPath(path)) return;
    await clearOtherStreamingFiles(projectId, path);
    const beforeContent = baselineFilesRef.current.get(path) ?? filesRef.current.find(file => file.path === path && file.status !== "deleted")?.content ?? "";
    const nextContent = normalizeGeneratedContent(path, content);
    const delta = getLineDelta(beforeContent, nextContent);
    if (!streamedPathActivityRef.current.has(path)) {
      streamedPathActivityRef.current.add(path);
      patchProject(projectId, { activeFilePath: path });
    }
    const activity = await addActivity(projectId, `Writing ${path}`, path, `write:${path}`, {
      activityOperation: beforeContent ? "updated" : "created",
      activityStatus: "running",
      additions: delta.additions,
      deletions: delta.deletions,
      beforeContent,
      afterContent: nextContent,
    });
    onActivity?.(activity, `write:${path}`);
    const file = await upsertWebDevFile(projectId, { path, content: nextContent, status: "streaming", summary: "Streaming" });
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
    const message = await appendWebDevMessage(projectId, threadId, "tool", response.output || response.error || "", {
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
    const message = await appendWebDevMessage(projectId, threadId, "assistant", "", {
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

    if (call.name !== "webdev_finish" && !["webdev_set_build_plan", "webdev_search_files", "webdev_file_outline", "webdev_get_diagnostics", "webdev_run_command"].includes(call.name)) {
      const path = typeof args.path === "string" ? args.path : undefined;
      const key = getActivityKeyForTool(call);
      await addActivity(projectId, getToolSummary(call), path, key, { activityStatus: "running" });
    }

    if (call.name === "webdev_set_build_plan") {
      const now = Date.now();
      const buildPlan: WebDevBuildPlanRecord = {
        summary: typeof args.summary === "string" ? args.summary : "Planned app architecture.",
        routingRequired: Boolean(args.routingRequired),
        routingStrategy: ["browser-router", "hash-router", "state-screens", "none"].includes(String(args.routingStrategy))
          ? args.routingStrategy as WebDevBuildPlanRecord["routingStrategy"]
          : Boolean(args.routingRequired)
            ? "browser-router"
            : "none",
        componentStrategy: ["shadcn-local", "custom-css", "minimal"].includes(String(args.componentStrategy))
          ? args.componentStrategy as WebDevBuildPlanRecord["componentStrategy"]
          : Boolean(args.routingRequired)
            ? "shadcn-local"
            : "minimal",
        designDirection: typeof args.designDirection === "string" ? args.designDirection : "",
        primaryScreens: Array.isArray(args.primaryScreens) ? args.primaryScreens.filter((item): item is string => typeof item === "string") : [],
        qualityChecklist: Array.isArray(args.qualityChecklist) ? args.qualityChecklist.filter((item): item is string => typeof item === "string") : [],
        pages: Array.isArray(args.pages) ? args.pages.filter((item): item is string => typeof item === "string") : [],
        keyFiles: Array.isArray(args.keyFiles) ? args.keyFiles.filter((item): item is string => typeof item === "string") : [],
        verification: typeof args.verification === "string" ? args.verification : "Run diagnostics/build after implementation.",
        createdAt: buildPlanRef.current?.createdAt || now,
        updatedAt: now,
      };
      buildPlanRef.current = buildPlan;
      patchProject(projectId, { buildPlan });
      await updateWebDevProject(projectId, { buildPlan });
      await addActivity(projectId, buildPlan.routingRequired ? "Planned routed app structure" : "Planned single-screen app structure", undefined, "webdev_set_build_plan:::", {
        activityOperation: "outlined",
        activityStatus: "done",
        activityDetail: [
          buildPlan.summary,
          `Routing: ${buildPlan.routingRequired ? buildPlan.routingStrategy : "not required"}`,
          `Components: ${buildPlan.componentStrategy || "not specified"}`,
          buildPlan.designDirection ? `Design: ${buildPlan.designDirection}` : "",
          `Primary screens: ${buildPlan.primaryScreens?.join(", ") || "none"}`,
          `Pages/screens: ${buildPlan.pages?.join(", ") || "none"}`,
          `Key files: ${buildPlan.keyFiles?.join(", ") || "none"}`,
          buildPlan.qualityChecklist?.length ? `Quality: ${buildPlan.qualityChecklist.join(", ")}` : "",
        ].filter(Boolean).join("\n"),
      });
      return ok({
        output: buildPlan.routingRequired
          ? `Build plan recorded with ${buildPlan.routingStrategy}, ${buildPlan.componentStrategy}, and ${buildPlan.pages?.length || 0} planned pages.`
          : `Build plan recorded as a ${buildPlan.componentStrategy || "minimal"} single-screen app.`,
        data: { buildPlan: buildPlan as unknown as Record<string, unknown> },
        meta: {
          operation: "planned",
          routingRequired: buildPlan.routingRequired,
          routingStrategy: buildPlan.routingStrategy,
          componentStrategy: buildPlan.componentStrategy,
        },
      });
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
      const current = filesRef.current.find(item => item.path === path);
      const existed = baselineFilesRef.current.has(path) || Boolean(current && current.status !== "streaming");
      const before = baselineFilesRef.current.has(path) ? baselineFilesRef.current.get(path)! : current?.status === "streaming" ? "" : current?.content || "";
      const delta = existed ? getLineDelta(before, nextContent) : { additions: countLines(nextContent), deletions: 0 };
      const file = await upsertWebDevFile(projectId, {
        path,
        content: nextContent,
        status: "ready",
        summary: typeof args.summary === "string" ? args.summary : undefined,
      });
      await clearOtherStreamingFiles(projectId, file.path);
      upsertFileRef(file);
      setFiles(prev => {
        const exists = prev.some(item => item.id === file.id);
        return exists ? prev.map(item => item.id === file.id ? file : item) : [...prev, file].sort((a, b) => a.path.localeCompare(b.path));
      });
      changedPaths.add(file.path);
      await finalizeRunningActivitiesForPath(projectId, file.path, "done");
      await addActivity(projectId, `${existed ? "Edited" : "Created"} ${file.path}`, file.path, `write:${file.path}`, {
        activityOperation: existed ? "updated" : "created",
        activityStatus: "done",
        additions: delta.additions,
        deletions: delta.deletions,
        beforeContent: before,
        afterContent: nextContent,
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
        if (patchPreviewPathRef.current === path) {
          patchPreviewPathRef.current = null;
          patchPreviewContentRef.current.delete(path);
          patchPreviewUpdatedAtRef.current.delete(path);
          onPatchPreviewChange?.(null);
        }
        const before = current.content;
        const nextContent = normalizeGeneratedContent(path, patched);
        const delta = getLineDelta(before, nextContent);
        const file = await upsertWebDevFile(projectId, {
          path,
          content: nextContent,
          status: "ready",
          summary: typeof args.summary === "string" ? args.summary : undefined,
        });
        upsertFileRef(file);
        setFiles(prev => prev.map(item => item.id === file.id ? file : item));
        changedPaths.add(file.path);
        await finalizeRunningActivitiesForPath(projectId, file.path, "done");
        await addActivity(projectId, `Patched ${file.path}`, file.path, `webdev_patch_file:${file.path}::`, {
          activityOperation: "patched",
          activityStatus: "done",
          additions: delta.additions,
          deletions: delta.deletions,
          beforeContent: before,
          afterContent: nextContent,
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
        if (patchPreviewPathRef.current === path) {
          patchPreviewPathRef.current = null;
          patchPreviewContentRef.current.delete(path);
          patchPreviewUpdatedAtRef.current.delete(path);
          onPatchPreviewChange?.(null);
        }
        await addActivity(projectId, `Patch skipped because exact source text was not found in ${path}.`, path, `webdev_patch_file:${path}::`, {
          activityOperation: "skipped",
          activityStatus: "error",
        });
        return fail(`Patch skipped because the requested patch did not match ${path}. Use webdev_read_file or webdev_file_outline to inspect the current file, then retry with a smaller targeted patch or a deliberate write_file replacement if a full rewrite is truly needed.`, {
          operation: "skipped",
          path,
          recovery: "read_current_file_then_retry_smaller_patch",
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

    if (call.name === "webdev_search_files") {
      const query = String(args.query || "");
      const includePattern = typeof args.includePattern === "string" ? args.includePattern : undefined;
      const caseSensitive = Boolean(args.caseSensitive);
      const matches = searchWebDevFiles(filesRef.current, query, includePattern, caseSensitive);
      await addActivity(projectId, `Searched for ${query || "text"}`, undefined, `webdev_search_files:${query}:${includePattern || ""}`, {
        activityOperation: "searched",
        activityStatus: "done",
        activityDetail: matches.map(match => `${match.path}:${match.line} ${match.preview}`).join("\n"),
      });
      return ok({
        output: matches.length
          ? matches.map(match => `${match.path}:${match.line}: ${match.preview}`).join("\n")
          : `No matches found for "${query}".`,
        data: { matches },
        meta: { operation: "searched", matchCount: matches.length },
      });
    }

    if (call.name === "webdev_file_outline") {
      const path = String(args.path || "");
      const file = filesRef.current.find(item => item.path === path);
      if (!file) return fail(`File not found: ${path}`, { path });
      const outline = outlineWebDevFile(file);
      await addActivity(projectId, `Outlined ${path}`, path, `webdev_file_outline:${path}:`, {
        activityOperation: "outlined",
        activityStatus: "done",
        activityDetail: outline.symbols.map(symbol => `${symbol.line}: ${symbol.kind} ${symbol.name}`).join("\n"),
      });
      return ok({
        output: [
          `${outline.path} (${outline.lines} lines, ${outline.chars} chars)`,
          outline.imports.length ? `Imports:\n${outline.imports.join("\n")}` : "",
          outline.exports.length ? `Exports:\n${outline.exports.join("\n")}` : "",
          outline.symbols.length ? `Symbols:\n${outline.symbols.map(symbol => `${symbol.line}: ${symbol.kind} ${symbol.name}`).join("\n")}` : "No outline symbols found.",
        ].filter(Boolean).join("\n\n"),
        data: { outline },
        meta: { operation: "outlined", path, symbolCount: outline.symbols.length },
      });
    }

    if (call.name === "webdev_get_diagnostics" || call.name === "webdev_run_command") {
      const requestedScript = call.name === "webdev_get_diagnostics"
        ? chooseDiagnosticsScript(filesRef.current)
        : String(args.script || "");
      const activityKey = call.name === "webdev_get_diagnostics"
        ? getActivityKeyForTool(call)
        : `${call.name}:${requestedScript}:`;
      const scriptError = getSafeWebDevScriptError(filesRef.current, requestedScript);
      if (scriptError) {
        await addActivity(projectId, scriptError, undefined, activityKey, {
          activityOperation: call.name === "webdev_get_diagnostics" ? "checked" : "command",
          activityStatus: "error",
          activityDetail: scriptError,
        });
        return fail(scriptError, { operation: call.name === "webdev_get_diagnostics" ? "checked" : "command", script: requestedScript });
      }
      const lines: string[] = [];
      const onLine = (line: string) => {
        lines.push(line);
          void addActivity(projectId, getToolSummary({ ...call, arguments: { ...args, script: requestedScript } }), undefined, activityKey, {
            activityOperation: call.name === "webdev_get_diagnostics" ? "checked" : "command",
            activityStatus: "running",
            activityDetail: lines.slice(-80).join("\n"),
          });
      };
      const result = await runWebDevNpmScript({
        files: filesRef.current,
        script: requestedScript,
        args: call.name === "webdev_run_command" && Array.isArray(args.args) ? args.args.filter((value): value is string => typeof value === "string") : [],
        signal: abortControllerRef.current?.signal || new AbortController().signal,
        onLine,
        timeoutMs: call.name === "webdev_get_diagnostics" ? 140000 : 120000,
      });
      const diagnostics = extractDiagnosticsFromOutput(result.output);
      await addActivity(projectId, result.success ? `Checked with npm run ${requestedScript}` : `Check failed: npm run ${requestedScript}`, undefined, activityKey, {
        activityOperation: call.name === "webdev_get_diagnostics" ? "checked" : "command",
        activityStatus: result.success ? "done" : "error",
        activityDetail: result.output,
      });
      if (!result.success) {
        return fail(result.error || `npm run ${requestedScript} failed.`, {
          operation: call.name === "webdev_get_diagnostics" ? "checked" : "command",
          script: requestedScript,
          exitCode: result.exitCode,
          diagnostics,
        });
      }
      return ok({
        output: result.output || `npm run ${requestedScript} completed successfully.`,
        data: { script: requestedScript, diagnostics },
        meta: {
          operation: call.name === "webdev_get_diagnostics" ? "checked" : "command",
          script: requestedScript,
          exitCode: result.exitCode,
          diagnostics,
        },
      });
    }

    if (call.name === "webdev_finish") {
      const summary = typeof args.summary === "string" ? args.summary : "Done.";
      return ok({ output: summary, data: { summary } });
    }

    return fail(`Unknown Web Dev tool: ${call.name}`);
  };

  const applyWriteFileBatch = async (
    projectId: string,
    batch: Array<Required<Pick<WebDevToolCall, "id">> & WebDevToolCall>,
    changedPaths: Set<string>,
    iteration: number
  ): Promise<ToolExecutionResult[]> => {
    const beforeByPath = new Map(filesRef.current.map(file => [file.path, file.content]));
    const normalized = batch.map(call => {
      const args = call.arguments || {};
      const path = String(args.path || "");
      const content = normalizeGeneratedContent(path, String(args.content || ""));
      const existingFile = filesRef.current.find(file => file.path === path);
      const existed = baselineFilesRef.current.has(path) || Boolean(existingFile && existingFile.status !== "streaming");
      const before = baselineFilesRef.current.has(path)
        ? baselineFilesRef.current.get(path)!
        : existingFile?.status === "streaming"
          ? ""
          : beforeByPath.get(path) || "";
      const delta = existed ? getLineDelta(before, content) : { additions: countLines(content), deletions: 0 };
      return {
        call,
        path,
        content,
        before,
        existed,
        delta,
        summary: typeof args.summary === "string" ? args.summary : undefined,
      };
    }).filter(item => item.path);

    if (normalized.length === 0) return [];

    for (const item of normalized) {
      await persistAssistantToolCall(projectId, item.call, iteration);
    }

    const writtenPaths = new Set(normalized.map(item => item.path));
    await clearOtherStreamingFiles(projectId);
    const records = await bulkUpsertWebDevFiles(projectId, normalized.map(item => ({
      path: item.path,
      content: item.content,
      status: "ready",
      summary: item.summary,
    })));
    const recordByPath = new Map(records.map(record => [record.path, record]));
    const nextById = new Map(filesRef.current
      .filter(file => !writtenPaths.has(file.path))
      .map(file => [file.id, file]));
    records.forEach(record => nextById.set(record.id, record));
    const nextFiles = [...nextById.values()].sort((a, b) => a.path.localeCompare(b.path));
    setFileRef(nextFiles);
    setFiles(nextFiles);

    const results: ToolExecutionResult[] = [];
    for (const item of normalized) {
      const file = recordByPath.get(item.path);
      const response = asToolResponse({
        success: true,
        output: `${item.existed ? "Edited" : "Created"} ${file?.path || item.path}`,
        data: { path: file?.path || item.path },
        meta: {
          operation: item.existed ? "updated" : "created",
          path: file?.path || item.path,
          additions: item.delta.additions,
          deletions: item.delta.deletions,
          wasNew: !item.existed,
        },
      });
      if (file) changedPaths.add(file.path);
      if (file) await finalizeRunningActivitiesForPath(projectId, file.path, "done");
      await addActivity(projectId, `${item.existed ? "Edited" : "Created"} ${file?.path || item.path}`, file?.path || item.path, `write:${file?.path || item.path}`, {
        activityOperation: item.existed ? "updated" : "created",
        activityStatus: "done",
        additions: item.delta.additions,
        deletions: item.delta.deletions,
        beforeContent: item.before,
        afterContent: item.content,
      });
      await persistToolResult(projectId, item.call, response, iteration);
      results.push({ id: item.call.id, name: item.call.name, arguments: item.call.arguments, response });
    }

    const activePath = records.at(-1)?.path;
    if (activePath) patchProject(projectId, { activeFilePath: activePath });
    return results;
  };

  const executeToolCalls = async (
    projectId: string,
    calls: Array<Required<Pick<WebDevToolCall, "id">> & WebDevToolCall>,
    changedPaths: Set<string>,
    iteration: number,
    signal: AbortSignal
  ) => {
    const results: ToolExecutionResult[] = [];
    const flushWriteBatch = async (batch: Array<Required<Pick<WebDevToolCall, "id">> & WebDevToolCall>) => {
      if (batch.length === 0) return;
      const settled = await applyWriteFileBatch(projectId, batch, changedPaths, iteration);
      results.push(...settled);
    };

    let writeBatch: Array<Required<Pick<WebDevToolCall, "id">> & WebDevToolCall> = [];
    const writeBatchPaths = new Set<string>();

    for (const call of calls) {
      if (signal.aborted) break;
      const path = typeof call.arguments?.path === "string" ? call.arguments.path : "";
      const canBatchWrite = call.name === "webdev_write_file" && path && !writeBatchPaths.has(path);
      if (canBatchWrite) {
        writeBatch.push(call);
        writeBatchPaths.add(path);
        continue;
      }
      await flushWriteBatch(writeBatch);
      writeBatch = [];
      writeBatchPaths.clear();
      if (signal.aborted) break;
      await persistAssistantToolCall(projectId, call, iteration);
      results.push(await applyToolCall(projectId, call, changedPaths, iteration));
    }

    await flushWriteBatch(writeBatch);
    return results;
  };

  const sendWebDevMessage = async (prompt: string, attachments: Attachment[] = []) => {
    if (!project || !threadId || !prompt.trim()) return;
    const projectId = project.id;
    const provider = getModelOption(selectedModel)?.provider;
    const supportsThinking = getModelRuntimeLimits(selectedModel).supportsThinking;
    const abortController = new AbortController();
    const staleActivities = await settleRunningWebDevActivities(projectId, threadId, "done");
    if (staleActivities.length > 0) {
      staleActivities.forEach(message => upsertMessageRef(message));
    }
    abortControllerRef.current = abortController;
    setIsGenerating(true);
    streamedPathActivityRef.current = new Set();
    patchPreviewPathRef.current = null;
    patchPreviewContentRef.current.clear();
    patchPreviewUpdatedAtRef.current.clear();
    onPatchPreviewChange?.(null);
    activityByKeyRef.current = new Map();
    pendingActivityByKeyRef.current = new Map();
    inlineActivityKeysRef.current = new Set();
    const scopedFiles = filesRef.current.filter(file => file.projectId === projectId);
    const scopedMessages = messagesRef.current.filter(message => message.projectId === projectId && message.threadId === threadId);
    filesRef.current = scopedFiles;
    messagesRef.current = scopedMessages;
    setFiles(scopedFiles);
    setMessages(scopedMessages);
    baselineFilesRef.current = new Map(scopedFiles.map(file => [file.path, file.content]));
    const startedEmpty = baselineFilesRef.current.size === 0;
    patchProject(projectId, { status: "generating", selectedModel });
    await updateWebDevProject(projectId, { status: "generating", selectedModel });

    const userMessage = await appendWebDevMessage(projectId, threadId, "user", prompt.trim() || "Please use the attached files.", { attachments });
    const assistantMessage = await appendWebDevMessage(projectId, threadId, "assistant", "");
    const historyBeforeTurn = messagesRef.current.filter(message => message.projectId === projectId && message.threadId === threadId);
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
    const appendTextPart = (delta: string) => {
      if (!delta) return;
      assistantText += delta;
      const lastPart = assistantContentParts[assistantContentParts.length - 1];
      if (lastPart?.type === "text") {
        assistantContentParts = assistantContentParts.map((part, index) =>
          index === assistantContentParts.length - 1 && part.type === "text"
            ? { ...part, text: `${part.text}${delta}` }
            : part
        );
      } else {
        assistantContentParts = [
          ...assistantContentParts,
          {
            type: "text",
            text: delta,
            startedAt: Date.now(),
          },
        ];
      }
    };
    const removeTextTailFromParts = (tail: string) => {
      if (!tail) return;
      let remaining = tail.length;
      const next = [...assistantContentParts];
      for (let index = next.length - 1; index >= 0 && remaining > 0; index -= 1) {
        const part = next[index];
        if (part.type !== "text") continue;
        if (part.text.length <= remaining) {
          remaining -= part.text.length;
          next.splice(index, 1);
        } else {
          next[index] = { ...part, text: part.text.slice(0, -remaining).trimEnd() };
          remaining = 0;
        }
      }
      assistantContentParts = next;
    };
    const appendToolActivityPart = (activity: WebDevMessageRecord, key: string) => {
      if (inlineActivityKeysRef.current.has(key)) return;
      inlineActivityKeysRef.current.add(key);
      assistantContentParts = [
        ...assistantContentParts,
        {
          type: "tool",
          activityId: activity.id,
          activityKey: key,
          startedAt: activity.createdAt || Date.now(),
        },
      ];
      syncAssistantMessage();
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
        if (part.type !== "thinking") return part;
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
        index === activeThinkingPartIndex && part.type === "thinking"
          ? { ...part, active: false, endedAt: Date.now(), title: getThoughtTitle(part.text) }
          : part
      );
      activeThinkingPartIndex = null;
      syncAssistantMessage();
    };
    const hasAssistantLead = () =>
      assistantText.trim().length > 0 ||
      assistantContentParts.some(part => part.type === "thinking" && part.text.trim().length > 0);
    const appendFinalAssistantMessage = async (summary: string, shouldSplit: boolean, removeTail = "") => {
      const cleanSummary = summary.trim();
      if (!cleanSummary) return;

      if (!shouldSplit) {
        const merged = mergeFinalSummary(assistantText, cleanSummary);
        if (merged !== assistantText) appendTextPart(`${assistantText.trim() ? "\n\n" : ""}${cleanSummary}`);
        assistantText = merged;
        syncAssistantMessage({ content: assistantText, isThinking: false });
        return;
      }

      if (removeTail && assistantText.endsWith(removeTail)) {
        assistantText = assistantText.slice(0, -removeTail.length).trimEnd();
        removeTextTailFromParts(removeTail);
      }

      await settleDraftActivities();
      syncAssistantMessage({ content: assistantText, isThinking: false, hiddenFromChat: !hasAssistantLead() });
      const finalMessage = await appendWebDevMessage(projectId, threadId, "assistant", cleanSummary);
      appendMessagesRef([finalMessage]);
    };
    const draftActivityPromises = new Set<Promise<void>>();
    const trackDraftActivity = (promise: Promise<unknown>) => {
      const tracked = promise
        .catch(() => undefined)
        .then(() => undefined);
      draftActivityPromises.add(tracked);
      void tracked.finally(() => draftActivityPromises.delete(tracked));
    };
    const settleDraftActivities = async () => {
      if (draftActivityPromises.size > 0) {
        await Promise.allSettled([...draftActivityPromises]);
      }
      await settlePendingActivities();
    };

    try {
      const requestAttachments = attachments.length > 0 ? await ensureAttachmentsHaveBase64(attachments) : attachments;
      let providerMessages: WebDevProviderMessage[] = messagesToProviderHistory([
        ...historyBeforeTurn.filter(message => message.projectId === projectId),
        userMessage,
      ]);
      const context = buildWebDevProjectContext({
        projectTitle: project.title,
        userPrompt: prompt.trim(),
        files: filesRef.current.filter(file => file.projectId === projectId),
        attachments: requestAttachments,
        model: selectedModel,
        buildPlan: project.buildPlan,
      });
      providerMessages = appendUserContextMessage(providerMessages, context.text, requestAttachments);

      const runStartedAt = Date.now();
      let completed = false;
      const allToolResults: ToolExecutionResult[] = [];
      let verificationNudged = false;

      for (
        let iteration = 1;
        iteration <= MAX_WEBDEV_AGENT_ITERATIONS && !completed && Date.now() - runStartedAt < MAX_WEBDEV_AGENT_RUN_MS;
        iteration += 1
      ) {
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
          attachments: requestAttachments,
          reasoningEnabled: isThinkingEnabled && supportsThinking,
          signal: abortController.signal,
          onTextDelta: (delta) => {
            endActiveThinkingPart();
            appendTextPart(delta);
            iterationText += delta;
            syncAssistantMessage({ isThinking: false });
          },
          onThoughtDelta: (delta) => {
            appendThinkingDelta(delta);
          },
          onToolDelta: (draft) => {
            endActiveThinkingPart();
            if (!STREAMING_DRAFT_TOOL_NAMES.has(draft.name)) return;
            trackDraftActivity(applyDraft(projectId, draft, appendToolActivityPart));
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
        await settleDraftActivities();

        if (toolCalls.length === 0) {
          const hasFreshVisibleText = iterationText.trim().length > 0;
          if (hasFreshVisibleText) {
            if (allToolResults.length > 0) {
              const hasMutations = hasSuccessfulMutation(allToolResults);
              if (hasMutations && !hasSuccessfulVerification(allToolResults) && !verificationNudged) {
                verificationNudged = true;
                providerMessages = appendInternalInstruction(
                  providerMessages,
                  "Files changed, but no diagnostics/build check has confirmed the project yet. Run webdev_get_diagnostics or a safe webdev_run_command if possible, fix any issues, then provide the final summary. If no verification script exists, explain that in the final summary."
                );
                continue;
              }
              if (hasMutations) {
                const finishGate = evaluateWebDevFinish({ files: filesRef.current, startedEmpty, toolResults: allToolResults, buildPlan: buildPlanRef.current });
                if (!finishGate.accepted) {
                  providerMessages = appendInternalInstruction(
                    providerMessages,
                    finishGate.reason || "The project is not ready to finish. Continue with the next required tool step."
                  );
                  continue;
                }
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

        const results = await executeToolCalls(projectId, toolCalls, changedPaths, iteration, abortController.signal);
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

        const failedVerification = results.find(result =>
          !result.response.success &&
          (result.name === "webdev_get_diagnostics" || result.name === "webdev_run_command")
        );
        if (failedVerification && hasSuccessfulMutation(allToolResults)) {
          providerMessages = appendInternalInstruction(
            providerMessages,
            `Verification failed: ${failedVerification.response.error || failedVerification.response.output || "unknown failure"}. Use the diagnostic output to fix the project, then run diagnostics again before finishing.`
          );
          continue;
        }

        const finish = results.find(result => result.name === "webdev_finish" && result.response.success);
        if (finish) {
          const finishGate = evaluateWebDevFinish({ files: filesRef.current, startedEmpty, toolResults: allToolResults, buildPlan: buildPlanRef.current });
          if (hasSuccessfulMutation(allToolResults) && !hasSuccessfulVerification(allToolResults) && !verificationNudged) {
            verificationNudged = true;
            providerMessages = appendInternalInstruction(
              providerMessages,
              "Files changed, but no diagnostics/build check has confirmed the project yet. Run webdev_get_diagnostics or a safe webdev_run_command if possible, fix any issues, then finish."
            );
            continue;
          }
          if (!finishGate.accepted) {
            providerMessages = appendInternalInstruction(
              providerMessages,
              finishGate.reason || "The project is not ready to finish. Continue with the next required tool step."
            );
            continue;
          }
          const summary = String(finish.response.output || "Done.");
          await appendFinalAssistantMessage(summary, allToolResults.length > 0);
          completed = true;
          break;
        }
      }

      if (!completed) {
        const fallback = allToolResults.length > 0
          ? "The model used the full Web Dev run budget before it sent a final summary. Completed file changes are preserved; send continue and it will resume from the current project state."
          : "The model used the full Web Dev run budget before producing a usable response. Please try again.";
        assistantText = mergeFinalSummary(assistantText, fallback);
        syncAssistantMessage({ content: assistantText, isThinking: false });
      } else {
        syncAssistantMessage({ isThinking: false });
      }
      await settleDraftActivities();
      await finalizeRunningActivities("done");
      patchProject(projectId, { status: "idle" });
      await updateWebDevProject(projectId, { status: "idle" });
    } catch (error: any) {
      endActiveThinkingPart();
      if (assistantThought) flushThought();
      const isStopped = error?.name === "AbortError" || abortController.signal.aborted;
      const content = isStopped
        ? "Stopped. Any completed file changes are still here."
        : getReadableWebDevError(error);
      assistantText = content;
      syncAssistantMessage({ content, isThinking: false });
      await settleDraftActivities();
      await finalizeRunningActivities(isStopped ? "done" : "error");
      patchProject(projectId, { status: isStopped ? "idle" : "error", error: isStopped ? undefined : content });
      await updateWebDevProject(projectId, { status: isStopped ? "idle" : "error", error: isStopped ? undefined : content });
    } finally {
      await clearOtherStreamingFiles(projectId);
      if (thoughtFlushTimerRef.current !== null) {
        window.clearTimeout(thoughtFlushTimerRef.current);
        thoughtFlushTimerRef.current = null;
      }
      setIsGenerating(false);
      patchPreviewPathRef.current = null;
      patchPreviewContentRef.current.clear();
      patchPreviewUpdatedAtRef.current.clear();
      onPatchPreviewChange?.(null);
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
