import { contextBridge, ipcRenderer } from "electron";
import type {
  ApprovalDecisionInput,
  DesktopEvent,
  PrivoraDesktopApi,
  SaveSettingsInput,
  StartTurnInput,
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
  setActiveThread: (threadId: string) => ipcRenderer.invoke(channels.setActiveThread, threadId),
  startTurn: (input: StartTurnInput) => ipcRenderer.invoke(channels.startTurn, input),
  continueRun: (threadId: string) => ipcRenderer.invoke(channels.continueRun, threadId),
  stopTurn: (threadId: string) => ipcRenderer.invoke(channels.stopTurn, threadId),
  decideApproval: (input: ApprovalDecisionInput) => ipcRenderer.invoke(channels.decideApproval, input),
  searchContextMentions: (input) => ipcRenderer.invoke(channels.searchContextMentions, input),
  saveSettings: (input: SaveSettingsInput) => ipcRenderer.invoke(channels.saveSettings, input),
  openPath: (path: string) => ipcRenderer.invoke(channels.openPath, path),
  openWorkspaceTarget: (target) => ipcRenderer.invoke(channels.openWorkspaceTarget, target),
  onEvent: (callback: (event: DesktopEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: DesktopEvent) => callback(payload);
    ipcRenderer.on(channels.event, listener);
    return () => ipcRenderer.off(channels.event, listener);
  },
};

contextBridge.exposeInMainWorld("privoraDesktop", api);
