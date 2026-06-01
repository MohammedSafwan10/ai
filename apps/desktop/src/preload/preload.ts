import { contextBridge, ipcRenderer } from "electron";
import type {
  ApprovalDecisionInput,
  DesktopEvent,
  PrivoraDesktopApi,
  SaveSettingsInput,
  StartTurnInput,
  PrepareTurnUndoInput,
  UndoTurnChangesInput,
  RequestUserInputResponseInput,
} from "../shared/types";
import { channels } from "../main/ipc/channels";

const api: PrivoraDesktopApi = {
  debugEnabled: typeof process !== "undefined" && process.env.PRIVORA_DEBUG === "1",
  getSnapshot: () => ipcRenderer.invoke(channels.getSnapshot),
  createThread: (workspaceId?: string | null) => ipcRenderer.invoke(channels.createThread, workspaceId),
  renameThread: (threadId: string, title: string) => ipcRenderer.invoke(channels.renameThread, threadId, title),
  toggleThreadStar: (threadId: string) => ipcRenderer.invoke(channels.toggleThreadStar, threadId),
  deleteThread: (threadId: string) => ipcRenderer.invoke(channels.deleteThread, threadId),
  selectWorkspace: () => ipcRenderer.invoke(channels.selectWorkspace),
  removeWorkspace: (workspaceId: string) => ipcRenderer.invoke(channels.removeWorkspace, workspaceId),
  setActiveThread: (threadId: string) => ipcRenderer.invoke(channels.setActiveThread, threadId),
  startTurn: (input: StartTurnInput) => ipcRenderer.invoke(channels.startTurn, input),
  continueRun: (threadId: string) => ipcRenderer.invoke(channels.continueRun, threadId),
  stopTurn: (threadId: string) => ipcRenderer.invoke(channels.stopTurn, threadId),
  answerRequestUserInput: (input: RequestUserInputResponseInput) => ipcRenderer.invoke(channels.answerRequestUserInput, input),
  decideApproval: (input: ApprovalDecisionInput) => ipcRenderer.invoke(channels.decideApproval, input),
  prepareTurnUndo: (input: PrepareTurnUndoInput) => ipcRenderer.invoke(channels.prepareTurnUndo, input),
  undoTurnChanges: (input: UndoTurnChangesInput) => ipcRenderer.invoke(channels.undoTurnChanges, input),
  searchContextMentions: (input) => ipcRenderer.invoke(channels.searchContextMentions, input),
  listWorkspaceDirectory: (input) => ipcRenderer.invoke(channels.listWorkspaceDirectory, input),
  readWorkspaceFile: (input) => ipcRenderer.invoke(channels.readWorkspaceFile, input),
  saveSettings: (input: SaveSettingsInput) => ipcRenderer.invoke(channels.saveSettings, input),
  openPath: (path: string) => ipcRenderer.invoke(channels.openPath, path),
  openExternalUrl: (url: string) => ipcRenderer.invoke(channels.openExternalUrl, url),
  listWorkspaceOpenTargets: () => ipcRenderer.invoke(channels.listWorkspaceOpenTargets),
  openWorkspaceTarget: (target) => ipcRenderer.invoke(channels.openWorkspaceTarget, target),
  onZoomChanged: (callback: (percent: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, percent: number) => callback(percent);
    ipcRenderer.on(channels.zoomChanged, listener);
    return () => ipcRenderer.off(channels.zoomChanged, listener);
  },
  onEvent: (callback: (event: DesktopEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: DesktopEvent) => callback(payload);
    ipcRenderer.on(channels.event, listener);
    return () => ipcRenderer.off(channels.event, listener);
  },
};

contextBridge.exposeInMainWorld("privoraDesktop", api);
