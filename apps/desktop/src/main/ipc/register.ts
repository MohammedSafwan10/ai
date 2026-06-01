import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { z } from "zod";
import type { DesktopStore } from "../db/store";
import type { AgentService } from "../agent/service";
import { searchContextMentions } from "../agent/contextMentions";
import { TurnUndoCoordinator } from "../agent/turnUndoCoordinator";
import { resolveExistingWorkspacePath } from "../security/pathSandbox";
import { listWorkspaceDirectory, readWorkspaceFile } from "../workspace/files";
import { listWorkspaceOpenTargets, openWorkspaceTarget } from "../workspace/openTargets";
import { channels } from "./channels";
import type {
  ApprovalDecisionInput,
  DesktopEvent,
  RequestUserInputResponseInput,
  SaveSettingsInput,
  SearchContextMentionsInput,
  StartTurnInput,
  WorkspaceOpenTarget,
} from "../../shared/types";

export interface IpcState {
  activeThreadId: string | null;
  activeWorkspaceId: string | null;
}

export const registerIpc = (store: DesktopStore, runtime: AgentService, state: IpcState) => {
  const undoCoordinator = new TurnUndoCoordinator(store, (threadId) => {
    const run = runtime.getActiveRun(threadId);
    return Boolean(run && !["completed", "stopped", "stalled", "failed", "idle"].includes(run.status));
  });
  const emit = (event: DesktopEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(channels.event, event));
  };

  const threadsForWorkspace = (workspaceId: string | null) =>
    store.listThreads().filter((thread) => thread.workspaceId === workspaceId);

  const hasBlockingRun = (threadId: string) => {
    const run = runtime.listActiveRuns().find((candidate) => candidate.threadId === threadId);
    return Boolean(run && !["completed", "stopped", "stalled", "failed", "idle"].includes(run.status));
  };

  const ensureThread = () => {
    const threads = threadsForWorkspace(state.activeWorkspaceId);
    if (state.activeThreadId && threads.some((thread) => thread.id === state.activeThreadId)) return state.activeThreadId;
    const thread = threads[0] || store.createThread(state.activeWorkspaceId);
    state.activeThreadId = thread.id;
    return thread.id;
  };

  const handle = (
    channel: string,
    schema: z.ZodType<unknown>,
    handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown,
  ) => {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      const parsed = schema.parse(args);
      return handler(event, ...(parsed as unknown[]));
    });
  };

  handle(channels.getSnapshot, z.tuple([]), () => {
    ensureThread();
    const snapshot = store.snapshot(state.activeThreadId, state.activeWorkspaceId);
    snapshot.activeRun = state.activeThreadId ? runtime.getActiveRun(state.activeThreadId) : null;
    snapshot.activeRuns = runtime.listActiveRuns();
    return snapshot;
  });

  handle(channels.createThread, z.tuple([optionalNullableId.optional()]), (_event, workspaceId?: string | null) => {
    if (workspaceId && !store.getWorkspace(workspaceId)) throw new Error("Workspace not found.");
    const thread = store.createThread(workspaceId ?? state.activeWorkspaceId ?? null);
    state.activeThreadId = thread.id;
    return thread;
  });

  handle(channels.renameThread, z.tuple([idSchema, z.string().max(200)]), (_event, threadId: string, title: string) => {
    return store.updateThreadTitle(threadId, title);
  });

  handle(channels.toggleThreadStar, z.tuple([idSchema]), (_event, threadId: string) => {
    return store.toggleThreadStar(threadId);
  });

  handle(channels.deleteThread, z.tuple([idSchema]), (_event, threadId: string) => {
    if (hasBlockingRun(threadId)) throw new Error("Stop this chat before deleting it.");
    const deletedThread = store.getThread(threadId);
    store.deleteThread(threadId);
    if (state.activeThreadId === threadId) {
      const workspaceId = deletedThread?.workspaceId ?? state.activeWorkspaceId;
      state.activeWorkspaceId = workspaceId;
      const nextThread = threadsForWorkspace(workspaceId)[0] || store.createThread(workspaceId);
      state.activeThreadId = nextThread.id;
    }
  });

  handle(channels.setActiveThread, z.tuple([idSchema]), (_event, threadId: string) => {
    if (!store.getThread(threadId)) throw new Error("Thread not found.");
    state.activeThreadId = threadId;
    state.activeWorkspaceId = store.getThread(threadId)?.workspaceId ?? state.activeWorkspaceId;
  });

  handle(channels.selectWorkspace, z.tuple([]), async () => {
    const result = await dialog.showOpenDialog({
      title: "Select a project workspace",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const workspace = store.upsertWorkspace(result.filePaths[0]);
    state.activeWorkspaceId = workspace.id;
    const currentThread = state.activeThreadId ? store.getThread(state.activeThreadId) : null;
    if (!currentThread || currentThread.workspaceId !== workspace.id) {
      state.activeThreadId = threadsForWorkspace(workspace.id)[0]?.id ?? store.createThread(workspace.id).id;
    }
    return workspace;
  });

  handle(channels.removeWorkspace, z.tuple([idSchema]), (_event, workspaceId: string) => {
    const workspace = store.getWorkspace(workspaceId);
    if (!workspace) throw new Error("Workspace not found.");
    const workspaceThreadIds = new Set(threadsForWorkspace(workspaceId).map((thread) => thread.id));
    const hasActiveRun = runtime.listActiveRuns().some((run) => workspaceThreadIds.has(run.threadId));
    if (hasActiveRun) throw new Error("Stop running chats in this project before removing it.");

    const removed = store.removeWorkspace(workspaceId);
    if (state.activeWorkspaceId === workspaceId || (state.activeThreadId && workspaceThreadIds.has(state.activeThreadId))) {
      const nextWorkspace = store.listWorkspaces()[0] || null;
      state.activeWorkspaceId = nextWorkspace?.id ?? null;
      state.activeThreadId = threadsForWorkspace(state.activeWorkspaceId)[0]?.id ?? store.createThread(state.activeWorkspaceId).id;
    }
    return removed;
  });

  handle(channels.startTurn, z.tuple([startTurnInputSchema]), async (_event, input: StartTurnInput) => {
    await runtime.startTurn(input);
  });

  handle(channels.continueRun, z.tuple([idSchema]), async (_event, threadId: string) => {
    await runtime.continueRun(threadId);
  });

  handle(channels.stopTurn, z.tuple([idSchema]), (_event, threadId: string) => {
    runtime.stopTurn(threadId);
  });

  handle(channels.answerRequestUserInput, z.tuple([requestUserInputResponseSchema]), async (_event, input: RequestUserInputResponseInput) => {
    await runtime.answerRequestUserInput(input);
  });

  handle(channels.decideApproval, z.tuple([approvalDecisionInputSchema]), async (_event, input: ApprovalDecisionInput) => {
    await runtime.decideApproval(input);
  });

  handle(channels.prepareTurnUndo, z.tuple([messageIdInputSchema]), (_event, input: { messageId: string }) => {
    const undo = undoCoordinator.prepare(input.messageId);
    if (undo) emit({ type: "turn_undo_updated", undo });
    return undo;
  });

  handle(channels.undoTurnChanges, z.tuple([messageIdInputSchema]), async (_event, input: { messageId: string }) => {
    const undoing = undoCoordinator.prepare(input.messageId);
    if (undoing) emit({ type: "turn_undo_updated", undo: { ...undoing, status: "undoing", updatedAt: Date.now() } });
    const undo = await undoCoordinator.undo(input.messageId);
    if (undo) emit({ type: "turn_undo_updated", undo });
    return undo;
  });

  handle(channels.searchContextMentions, z.tuple([searchContextMentionsInputSchema]), async (_event, input: SearchContextMentionsInput) => {
    return searchContextMentions(store, input.threadId, input.query);
  });

  handle(channels.listWorkspaceDirectory, z.tuple([workspacePathObjectInputSchema]), async (_event, input: { path: string }) => {
    const workspace = store.getWorkspace(state.activeWorkspaceId);
    if (!workspace) throw new Error("Choose a workspace first.");
    return listWorkspaceDirectory(workspace.path, input.path);
  });

  handle(channels.readWorkspaceFile, z.tuple([workspacePathObjectInputSchema]), async (_event, input: { path: string }) => {
    const workspace = store.getWorkspace(state.activeWorkspaceId);
    if (!workspace) throw new Error("Choose a workspace first.");
    return readWorkspaceFile(workspace.path, input.path);
  });

  handle(channels.saveSettings, z.tuple([saveSettingsInputSchema]), (_event, input: SaveSettingsInput) => {
    return store.saveSettings(input);
  });

  handle(channels.openPath, z.tuple([workspacePathInputSchema]), (_event, targetPath: string) => {
    const workspace = store.getWorkspace(state.activeWorkspaceId);
    if (!workspace) throw new Error("Choose a workspace first.");
    const target = resolveExistingWorkspacePath(workspace.path, targetPath);
    return shell.openPath(target.absolutePath);
  });

  handle(channels.openExternalUrl, z.tuple([externalUrlSchema]), (_event, url: string) => {
    return shell.openExternal(url);
  });

  handle(channels.listWorkspaceOpenTargets, z.tuple([]), async () => {
    return listWorkspaceOpenTargets();
  });

  handle(channels.openWorkspaceTarget, z.tuple([workspaceOpenTargetSchema]), async (_event, target: WorkspaceOpenTarget) => {
    const workspace = store.getWorkspace(state.activeWorkspaceId);
    if (!workspace) throw new Error("Choose a workspace first.");
    await openWorkspaceTarget(target, workspace.path);
  });
};

const idSchema = z.string().trim().min(1).max(200);
const optionalNullableId = z.string().trim().min(1).max(200).nullable();
const workspacePathInputSchema = z.string().trim().min(1).max(2000);
const workspacePathObjectInputSchema = z.object({ path: z.string().trim().min(0).max(2000) });
const workspaceOpenTargetSchema = z.string().trim().min(1).max(2000);
const externalUrlSchema = z.string().trim().max(4096).refine((value) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}, "Only valid http and https URLs can be opened externally.");

const attachmentSchema = z.object({
  id: idSchema,
  name: z.string().max(260),
  mimeType: z.string().max(120),
  size: z.number().nonnegative().max(20_000_000),
  base64: z.string().max(30_000_000),
  createdAt: z.number(),
});

const contextMentionSchema = z.object({
  id: idSchema,
  type: z.enum(["file", "folder", "terminal"]),
  label: z.string().max(500),
  path: z.string().max(2000).optional(),
  createdAt: z.number(),
});

const startTurnInputSchema = z.object({
  threadId: idSchema,
  prompt: z.string().max(1_000_000),
  attachments: z.array(attachmentSchema).max(12).optional(),
  contextMentions: z.array(contextMentionSchema).max(24).optional(),
});

const approvalDecisionSchema = z.object({
  callId: idSchema,
  approved: z.boolean(),
  scope: z.enum(["once", "this_thread", "this_workspace", "command_prefix"]).optional(),
});

const approvalDecisionInputSchema = z.object({
  threadId: idSchema,
  callId: idSchema.optional(),
  approved: z.boolean().optional(),
  scope: z.enum(["once", "this_thread", "this_workspace", "command_prefix"]).optional(),
  decisions: z.array(approvalDecisionSchema).max(100).optional(),
}).refine((input) => Boolean(input.decisions?.length) || (Boolean(input.callId) && typeof input.approved === "boolean"), {
  message: "Approval decision must include callId/approved or decisions.",
});

const messageIdInputSchema = z.object({
  messageId: idSchema,
});

const searchContextMentionsInputSchema = z.object({
  threadId: idSchema,
  query: z.string().max(500),
});

const saveSettingsInputSchema = z.object({
  model: z.string().max(160).optional(),
  reasoningEffort: z.enum(["none", "low", "medium", "high", "extra_high"]).optional(),
  permissionMode: z.enum(["ask_risky", "yolo"]).optional(),
  collaborationMode: z.enum(["default", "plan"]).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  cliproxyBaseUrl: z.string().max(500).optional(),
  openRouterApiKey: z.string().max(10_000).optional(),
  geminiApiKey: z.string().max(10_000).optional(),
});

const requestUserInputAnswerSchema = z.object({
  answers: z.array(z.string().max(4000)).max(4),
});

const requestUserInputResponseSchema = z.object({
  threadId: idSchema,
  callId: idSchema,
  answers: z.record(z.string().max(120), requestUserInputAnswerSchema),
});
