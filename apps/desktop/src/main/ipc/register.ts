import { BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import type { DesktopStore } from "../db/store";
import type { AgentService } from "../agent/service";
import { searchContextMentions } from "../agent/contextMentions";
import { TurnUndoCoordinator } from "../agent/turnUndoCoordinator";
import { channels } from "./channels";
import type {
  ApprovalDecisionInput,
  DesktopEvent,
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

  const ensureThread = () => {
    const threads = store.listThreads();
    if (state.activeThreadId && threads.some((thread) => thread.id === state.activeThreadId)) return state.activeThreadId;
    const thread = threads[0] || store.createThread(state.activeWorkspaceId);
    state.activeThreadId = thread.id;
    return thread.id;
  };

  ipcMain.handle(channels.getSnapshot, () => {
    ensureThread();
    const snapshot = store.snapshot(state.activeThreadId, state.activeWorkspaceId);
    snapshot.activeRun = state.activeThreadId ? runtime.getActiveRun(state.activeThreadId) : null;
    return snapshot;
  });

  ipcMain.handle(channels.createThread, (_event, workspaceId?: string | null) => {
    const thread = store.createThread(workspaceId ?? state.activeWorkspaceId ?? null);
    state.activeThreadId = thread.id;
    return thread;
  });

  ipcMain.handle(channels.renameThread, (_event, threadId: string, title: string) => {
    return store.updateThreadTitle(threadId, title);
  });

  ipcMain.handle(channels.toggleThreadStar, (_event, threadId: string) => {
    return store.toggleThreadStar(threadId);
  });

  ipcMain.handle(channels.deleteThread, (_event, threadId: string) => {
    store.deleteThread(threadId);
    if (state.activeThreadId === threadId) {
      const nextThread = store.listThreads()[0] || store.createThread(state.activeWorkspaceId);
      state.activeThreadId = nextThread.id;
      state.activeWorkspaceId = nextThread.workspaceId ?? state.activeWorkspaceId;
    }
  });

  ipcMain.handle(channels.setActiveThread, (_event, threadId: string) => {
    state.activeThreadId = threadId;
    state.activeWorkspaceId = store.getThread(threadId)?.workspaceId ?? state.activeWorkspaceId;
  });

  ipcMain.handle(channels.selectWorkspace, async () => {
    const result = await dialog.showOpenDialog({
      title: "Select a project workspace",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const workspace = store.upsertWorkspace(result.filePaths[0]);
    state.activeWorkspaceId = workspace.id;
    const currentThread = state.activeThreadId ? store.getThread(state.activeThreadId) : null;
    if (!currentThread || currentThread.workspaceId !== workspace.id) {
      state.activeThreadId = store.createThread(workspace.id).id;
    }
    return workspace;
  });

  ipcMain.handle(channels.startTurn, async (_event, input: StartTurnInput) => {
    await runtime.startTurn(input);
  });

  ipcMain.handle(channels.continueRun, async (_event, threadId: string) => {
    await runtime.continueRun(threadId);
  });

  ipcMain.handle(channels.stopTurn, (_event, threadId: string) => {
    runtime.stopTurn(threadId);
  });

  ipcMain.handle(channels.decideApproval, async (_event, input: ApprovalDecisionInput) => {
    await runtime.decideApproval(input);
  });

  ipcMain.handle(channels.prepareTurnUndo, (_event, input: { messageId: string }) => {
    const undo = undoCoordinator.prepare(input.messageId);
    if (undo) emit({ type: "turn_undo_updated", undo });
    return undo;
  });

  ipcMain.handle(channels.undoTurnChanges, async (_event, input: { messageId: string }) => {
    const undoing = undoCoordinator.prepare(input.messageId);
    if (undoing) emit({ type: "turn_undo_updated", undo: { ...undoing, status: "undoing", updatedAt: Date.now() } });
    const undo = await undoCoordinator.undo(input.messageId);
    if (undo) emit({ type: "turn_undo_updated", undo });
    return undo;
  });

  ipcMain.handle(channels.searchContextMentions, async (_event, input: SearchContextMentionsInput) => {
    return searchContextMentions(store, input.threadId, input.query);
  });

  ipcMain.handle(channels.saveSettings, (_event, input: SaveSettingsInput) => {
    return store.saveSettings(input);
  });

  ipcMain.handle(channels.openPath, (_event, targetPath: string) => {
    if (path.isAbsolute(targetPath)) return shell.openPath(targetPath);
    const workspace = store.getWorkspace(state.activeWorkspaceId);
    return shell.openPath(workspace ? path.resolve(workspace.path, targetPath) : targetPath);
  });

  ipcMain.handle(channels.openWorkspaceTarget, async (_event, target: WorkspaceOpenTarget) => {
    const workspace = store.getWorkspace(state.activeWorkspaceId);
    if (!workspace) throw new Error("Choose a workspace first.");
    await openWorkspaceTarget(target, workspace.path);
  });
};

const openWorkspaceTarget = async (target: WorkspaceOpenTarget, workspacePath: string) => {
  if (target === "file_explorer") {
    await shell.openPath(workspacePath);
    return;
  }

  if (target === "vscode") {
    spawnDetached("cmd.exe", ["/c", "start", "", "code", workspacePath]);
    return;
  }

  if (target === "terminal") {
    spawnDetached("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Start-Process",
      "powershell.exe",
      "-ArgumentList",
      "-NoExit",
      "-WorkingDirectory",
      workspacePath,
    ]);
    return;
  }

  if (target === "git_bash") {
    const gitBash = path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "git-bash.exe");
    spawnDetached("cmd.exe", ["/c", "start", "", gitBash, `--cd=${workspacePath}`]);
  }
};

const spawnDetached = (command: string, args: string[]) => {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
};
