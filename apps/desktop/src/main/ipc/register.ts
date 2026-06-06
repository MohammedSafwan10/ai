import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from "electron";
import { z } from "zod";
import type { DesktopStore } from "../db/store";
import type { AgentService } from "../agent/service";
import { searchContextMentions } from "../agent/contextMentions";
import { TurnUndoCoordinator } from "../agent/turnUndoCoordinator";
import { resolveExistingWorkspacePath } from "../security/pathSandbox";
import { listWorkspaceDirectory, readWorkspaceFile } from "../workspace/files";
import { listWorkspaceOpenTargets, openWorkspaceTarget } from "../workspace/openTargets";
import { StorageCleanupService } from "../storage/cleanup";
import { channels } from "./channels";
import { emptyAiCreditSummary, refreshAiCreditSummary } from "../billing/creditService";
import { createEmailPasswordAccount, createEmailPasswordSession, createTokenSession, deleteCurrentSession, getAppwriteAccount } from "../billing/appwriteAuth";
import { beginPrivoraBrowserAuth } from "../billing/browserAuthFlow";
import type { BrowserSessionManager } from "../browser/BrowserSessionManager";
import type { NotesStore } from "../notes/NotesStore";
import type {
  ApprovalDecisionInput,
  BrowserBoundsInput,
  BrowserDownloadInput,
  BrowserFormAnalyzeInput,
  BrowserFormFillInput,
  BrowserFormSubmitInput,
  BrowserFormValidateInput,
  BrowserDiagnoseInput,
  BrowserEvidenceVaultInput,
  BrowserInspectInput,
  BrowserNavigationInput,
  BrowserOpenInput,
  BrowserOverlayInput,
  BrowserShieldsInput,
  BrowserTabInput,
  BrowserToolsMenuAction,
  BrowserToolsMenuInput,
  BrowserViewportInput,
  BrowserWorkflowAssertInput,
  BrowserWorkflowInput,
  DesktopEvent,
  NotesCloseTabInput,
  NotesCreateInput,
  NotesDeleteInput,
  NotesListInput,
  NotesOpenFileInput,
  NotesOpenInput,
  NotesRenameInput,
  NotesSaveInput,
  NotesUpdateInput,
  RequestUserInputResponseInput,
  SaveSettingsInput,
  SearchContextMentionsInput,
  StartTurnInput,
  StorageCleanupInput,
  WorkspaceOpenTarget,
  PrivoraAuthInput,
} from "../../shared/types";

export interface IpcState {
  activeThreadId: string | null;
  activeWorkspaceId: string | null;
}

export const registerIpc = (store: DesktopStore, runtime: AgentService, state: IpcState, browserManager: BrowserSessionManager, notesStore: NotesStore) => {
  let browserOverlayWindow: BrowserWindow | null = null;
  const overlayPreloadPath = ensureBrowserOverlayPreload(app.getPath("userData"));
  const storageCleanup = new StorageCleanupService({
    userDataPath: app.getPath("userData"),
    downloadsPath: app.getPath("downloads"),
    clearBrowserProfileData: () => browserManager.clearProfileData(),
  });
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

  const emitSnapshot = () => {
    ensureThread();
    const snapshot = store.snapshot(state.activeThreadId, state.activeWorkspaceId);
    snapshot.activeRun = state.activeThreadId ? runtime.getActiveRun(state.activeThreadId) : null;
    snapshot.activeRuns = runtime.listActiveRuns();
    emit({ type: "snapshot", snapshot });
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

  handle(channels.saveThreadSettings, z.tuple([saveThreadSettingsInputSchema]), (_event, input: z.infer<typeof saveThreadSettingsInputSchema>) => {
    const updated = store.updateThreadSettings(input.threadId, input);
    if (!updated) throw new Error("Thread not found.");
    emitSnapshot();
    return updated;
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

  handle(channels.listNotes, z.tuple([notesListInputSchema]), (_event, input: NotesListInput) => {
    return notesStore.list(input.workspaceId || state.activeWorkspaceId || undefined, input.query);
  });

  handle(channels.createNote, z.tuple([notesCreateInputSchema]), (_event, input: NotesCreateInput) => {
    return notesStore.create({ ...input, workspaceId: input.workspaceId || state.activeWorkspaceId || undefined });
  });

  handle(channels.openNote, z.tuple([notesOpenInputSchema]), (_event, input: NotesOpenInput) => {
    return notesStore.open({ ...input, workspaceId: input.workspaceId || state.activeWorkspaceId || undefined });
  });

  handle(channels.openNoteFile, z.tuple([notesOpenFileInputSchema]), async (_event, input: NotesOpenFileInput) => {
    const filePath = input.filePath || (await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Text notes", extensions: ["txt", "md", "markdown", "json", "log", "csv", "yaml", "yml", "toml"] },
        { name: "All files", extensions: ["*"] },
      ],
    })).filePaths[0];
    if (!filePath) return null;
    return notesStore.openFile({ filePath, workspaceId: input.workspaceId || state.activeWorkspaceId || undefined });
  });

  handle(channels.updateNote, z.tuple([notesUpdateInputSchema]), (_event, input: NotesUpdateInput) => {
    return notesStore.update({ ...input, workspaceId: input.workspaceId || state.activeWorkspaceId || undefined });
  });

  handle(channels.saveNote, z.tuple([notesSaveInputSchema]), (_event, input: NotesSaveInput) => {
    return notesStore.save({ ...input, workspaceId: input.workspaceId || state.activeWorkspaceId || undefined });
  });

  handle(channels.saveNoteAs, z.tuple([notesSaveInputSchema]), async (_event, input: NotesSaveInput) => {
    const result = await dialog.showSaveDialog({
      defaultPath: input.filePath,
      filters: [
        { name: "Markdown", extensions: ["md"] },
        { name: "Text", extensions: ["txt"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (result.canceled || !result.filePath) return null;
    return notesStore.save({ ...input, workspaceId: input.workspaceId || state.activeWorkspaceId || undefined, filePath: result.filePath });
  });

  handle(channels.renameNote, z.tuple([notesRenameInputSchema]), (_event, input: NotesRenameInput) => {
    return notesStore.rename({ ...input, workspaceId: input.workspaceId || state.activeWorkspaceId || undefined });
  });

  handle(channels.deleteNote, z.tuple([notesDeleteInputSchema]), async (_event, input: NotesDeleteInput) => {
    const workspaceId = input.workspaceId || state.activeWorkspaceId || undefined;
    if (input.deleteFile) {
      const result = notesStore.open({ noteId: input.noteId, workspaceId });
      if (!result.note.filePath) throw new Error("Only file-backed notes can be moved to the Recycle Bin.");
      if (input.permanent) notesStore.deleteExternalFile(input.noteId);
      else await shell.trashItem(result.note.filePath);
    }
    return notesStore.delete({ ...input, workspaceId });
  });

  handle(channels.closeNoteTab, z.tuple([notesCloseTabInputSchema]), (_event, input: NotesCloseTabInput) => {
    return notesStore.closeTab({ ...input, workspaceId: input.workspaceId || state.activeWorkspaceId || undefined });
  });

  handle(channels.revealNote, z.tuple([notesOpenInputSchema]), (_event, input: NotesOpenInput) => {
    const result = notesStore.open({ ...input, workspaceId: input.workspaceId || state.activeWorkspaceId || undefined });
    if (!result.note.filePath) throw new Error("Only file-backed notes can be revealed in Explorer.");
    shell.showItemInFolder(result.note.filePath);
  });

  handle(channels.saveSettings, z.tuple([saveSettingsInputSchema]), (_event, input: SaveSettingsInput) => {
    return store.saveSettings(input);
  });

  handle(channels.startPrivoraBrowserAuth, z.tuple([]), async () => {
    const auth = await beginPrivoraBrowserAuth(store, {
      onToken: async (token) => {
        const sessionCookie = await createTokenSession(store.getSettings(), token);
        store.setPrivoraSessionCookie(sessionCookie);
        try {
          const account = await getAppwriteAccount(store.getSettings(), sessionCookie);
          if (account.authenticated) {
            store.setPrivoraAccountProfile({ email: account.email, name: account.name });
          }
        } catch {
          if (token.email || token.name) store.setPrivoraAccountProfile({ email: token.email, name: token.name });
        }
        try {
          await refreshCreditsFromSession();
        } catch (error) {
          const summary = emptyAiCreditSummary(error instanceof Error ? error.message : String(error));
          store.setAiCreditSummary(summary);
          emit({ type: "ai_credit_summary_updated", summary });
        }
        emitSnapshot();
        emit({ type: "toast", tone: "success", message: "Privora Desktop is connected." });
      },
    });
    await shell.openExternal(auth.url);
    emit({ type: "toast", tone: "info", message: "Opened Privora sign-in in your browser." });
    return auth;
  });

  const refreshCreditsFromSession = async () => {
    const settings = store.getSettings();
    const sessionCookie = store.getSecret("privora_session_cookie");
    const userJwt = store.getPrivoraUserJwt();
    const summary = await refreshAiCreditSummary(settings, sessionCookie, userJwt);
    store.setAiCreditSummary(summary);
    emit({ type: "ai_credit_summary_updated", summary });
    return summary;
  };

  handle(channels.signInPrivora, z.tuple([privoraAuthInputSchema]), async (_event, input: PrivoraAuthInput) => {
    const sessionCookie = await createEmailPasswordSession(store.getSettings(), input);
    store.setPrivoraSessionCookie(sessionCookie);
    const summary = await refreshCreditsFromSession();
    emitSnapshot();
    return summary;
  });

  handle(channels.signUpPrivora, z.tuple([privoraAuthInputSchema]), async (_event, input: PrivoraAuthInput) => {
    await createEmailPasswordAccount(store.getSettings(), input);
    const sessionCookie = await createEmailPasswordSession(store.getSettings(), input);
    store.setPrivoraSessionCookie(sessionCookie);
    const summary = await refreshCreditsFromSession();
    emitSnapshot();
    return summary;
  });

  handle(channels.signOutPrivora, z.tuple([]), async () => {
    await deleteCurrentSession(store.getSettings(), store.getSecret("privora_session_cookie"));
    store.clearPrivoraSession();
    const summary = emptyAiCreditSummary();
    store.setAiCreditSummary(summary);
    emit({ type: "ai_credit_summary_updated", summary });
    emitSnapshot();
    return summary;
  });

  handle(channels.refreshAiCredits, z.tuple([]), async () => {
    const settings = store.getSettings();
    const sessionCookie = store.getSecret("privora_session_cookie");
    const userJwt = store.getPrivoraUserJwt();
    try {
      const summary = await refreshAiCreditSummary(settings, sessionCookie, userJwt);
      store.setAiCreditSummary(summary);
      emit({ type: "ai_credit_summary_updated", summary });
      return summary;
    } catch (error) {
      const summary = emptyAiCreditSummary(error instanceof Error ? error.message : String(error));
      store.setAiCreditSummary(summary);
      emit({ type: "ai_credit_summary_updated", summary });
      return summary;
    }
  });

  handle(channels.getBrowserState, z.tuple([idSchema]), (_event, workspaceId: string) => {
    return browserManager.getState(workspaceId);
  });

  handle(channels.setBrowserVisible, z.tuple([idSchema, z.boolean()]), (_event, workspaceId: string, visible: boolean) => {
    return browserManager.setVisible(workspaceId, visible);
  });

  handle(channels.setBrowserBounds, z.tuple([browserBoundsInputSchema]), (_event, input: BrowserBoundsInput) => {
    return browserManager.setBounds(input.workspaceId, {
      x: input.x,
      y: input.y,
      width: input.width,
      height: input.height,
    });
  });

  handle(channels.openBrowserUrl, z.tuple([browserOpenInputSchema]), async (_event, input: BrowserOpenInput) => {
    return browserManager.openUrl(input.workspaceId, input.url, { scope: "user", viewport: input.viewport, tabId: input.tabId, newTab: input.newTab });
  });

  handle(channels.navigateBrowser, z.tuple([browserNavigationInputSchema]), async (_event, input: BrowserNavigationInput) => {
    return browserManager.navigate(input.workspaceId, input.direction, input.tabId);
  });

  handle(channels.setBrowserViewport, z.tuple([browserViewportInputSchema]), (_event, input: BrowserViewportInput) => {
    return browserManager.applyViewportPreset(input.workspaceId, input.preset);
  });

  handle(channels.inspectBrowser, z.tuple([browserInspectInputSchema]), async (_event, input: BrowserInspectInput) => {
    return browserManager.inspect(input.workspaceId, input.kind, input.tabId);
  });

  handle(channels.browserTab, z.tuple([browserTabInputSchema]), async (_event, input: BrowserTabInput) => {
    return browserManager.tab(input.workspaceId, input);
  });

  handle(channels.browserDownload, z.tuple([browserDownloadInputSchema]), async (_event, input: BrowserDownloadInput) => {
    return browserManager.downloadAction(input.workspaceId, input);
  });

  handle(channels.browserShields, z.tuple([browserShieldsInputSchema]), async (_event, input: BrowserShieldsInput) => {
    return browserManager.shieldsAction(input.workspaceId, input);
  });

  handle(channels.browserFormAnalyze, z.tuple([browserFormAnalyzeInputSchema]), async (_event, input: BrowserFormAnalyzeInput) => {
    return browserManager.formAnalyze(input.workspaceId, input.tabId);
  });

  handle(channels.browserFormFill, z.tuple([browserFormFillInputSchema]), async (_event, input: BrowserFormFillInput) => {
    return browserManager.formFill(input.workspaceId, input, { agentApproved: true });
  });

  handle(channels.browserFormValidate, z.tuple([browserFormValidateInputSchema]), async (_event, input: BrowserFormValidateInput) => {
    return browserManager.formValidate(input.workspaceId, input);
  });

  handle(channels.browserFormSubmit, z.tuple([browserFormSubmitInputSchema]), async (_event, input: BrowserFormSubmitInput) => {
    return browserManager.formSubmit(input.workspaceId, input, { agentApproved: true });
  });

  handle(channels.browserWorkflow, z.tuple([browserWorkflowInputSchema]), async (_event, input: BrowserWorkflowInput) => {
    return browserManager.workflow(input.workspaceId, input, { agentApproved: true });
  });

  handle(channels.browserAssert, z.tuple([browserWorkflowAssertInputSchema]), async (_event, input: BrowserWorkflowAssertInput) => {
    return browserManager.workflowAssert(input.workspaceId, input);
  });

  handle(channels.browserEvidenceVault, z.tuple([browserEvidenceVaultInputSchema]), async (_event, input: BrowserEvidenceVaultInput) => {
    return browserManager.evidenceVault(input.workspaceId, input);
  });

  handle(channels.browserDiagnose, z.tuple([browserDiagnoseInputSchema]), async (_event, input: BrowserDiagnoseInput) => {
    return browserManager.diagnose(input.workspaceId, input);
  });

  handle(channels.browserEvidence, z.tuple([idSchema]), async (_event, workspaceId: string) => {
    return browserManager.evidence(workspaceId, { includeScreenshot: false, includeVisibleText: true });
  });

  handle(channels.openBrowserDevTools, z.tuple([idSchema]), (_event, workspaceId: string) => {
    browserManager.openDevTools(workspaceId);
  });

  handle(channels.showBrowserToolsMenu, z.tuple([browserToolsMenuInputSchema]), async (event, input: BrowserToolsMenuInput) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    const sendAction = (action: BrowserToolsMenuAction) => {
      event.sender.send(channels.event, {
        type: "browser_tools_menu_action",
        workspaceId: input.workspaceId,
        action,
      });
    };
    const downloadsResult = await browserManager.downloadAction(input.workspaceId, { workspaceId: input.workspaceId, action: "list" });
    const downloads = Array.isArray(downloadsResult.data?.downloads) ? downloadsResult.data.downloads : [];
    const downloadsSubmenu: MenuItemConstructorOptions[] = [
      {
        label: "Allow next download",
        click: async () => {
          await browserManager.downloadAction(input.workspaceId, { workspaceId: input.workspaceId, action: "allow_next" });
          event.sender.send(channels.event, { type: "toast", tone: "info", message: "The next browser download is allowed." });
        },
      },
      { type: "separator" },
      ...(downloads.length ? downloads.slice(0, 12).map((download) => {
        const item = download as { id?: string; filename?: string; state?: string; path?: string };
        const label = `${item.filename || "download"}${item.state ? ` (${item.state})` : ""}`;
        const submenu: MenuItemConstructorOptions[] = [
          { label, enabled: false },
        ];
        if (item.path && item.id) {
          submenu.push({
            label: "Reveal in folder",
            click: () => {
              void browserManager.downloadAction(input.workspaceId, { workspaceId: input.workspaceId, action: "reveal", downloadId: item.id });
            },
          });
        }
        if (item.id && (item.state === "progressing" || item.state === "pending")) {
          submenu.push({
            label: "Cancel",
            click: () => {
              void browserManager.downloadAction(input.workspaceId, { workspaceId: input.workspaceId, action: "cancel", downloadId: item.id });
            },
          });
        }
        return { label, submenu };
      }) : [{ label: "No downloads yet", enabled: false }]),
    ];
    const template: MenuItemConstructorOptions[] = [
      { label: "Current evidence", enabled: input.hasUrl, click: () => sendAction("current_evidence") },
      { label: "Forms", enabled: input.hasUrl, click: () => sendAction("forms") },
      {
        label: input.shieldsEnabled ? "Turn off Shields for this site" : "Turn on Shields for this site",
        enabled: input.hasUrl,
        click: () => sendAction("toggle_shields_site"),
      },
      { label: "Show Shields blocks", enabled: input.hasUrl, click: () => sendAction("list_shields_blocked") },
      { type: "separator" },
      { label: input.recording ? "Stop recording" : "Record workflow", enabled: input.hasUrl || input.recording, click: () => sendAction("record_workflow") },
      { label: "Replay workflow", enabled: input.hasWorkflows, click: () => sendAction("replay_workflow") },
      { label: "Save evidence", enabled: input.hasUrl, click: () => sendAction("save_evidence") },
      { type: "separator" },
      { label: "Downloads", submenu: downloadsSubmenu },
      { label: "Workflow vault", click: () => sendAction("workflow_vault") },
    ];
    Menu.buildFromTemplate(template).popup({ window });
  });

  handle(channels.showBrowserOverlay, z.tuple([browserOverlayInputSchema]), async (event, input: BrowserOverlayInput) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    if (!parent) return;
    const parentBounds = parent.getBounds();
    const width = Math.min(Math.max(input.width || 520, 360), Math.max(360, parentBounds.width - 40));
    const height = Math.min(Math.max(input.height || 420, 220), Math.max(260, parentBounds.height - 120));
    if (!browserOverlayWindow || browserOverlayWindow.isDestroyed()) {
      browserOverlayWindow = new BrowserWindow({
        parent,
        modal: false,
        show: false,
        frame: false,
        resizable: true,
        minimizable: false,
        maximizable: false,
        skipTaskbar: true,
        backgroundColor: "#242424",
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          preload: overlayPreloadPath,
        },
      });
      browserOverlayWindow.on("blur", () => {
        const current = browserOverlayWindow;
        if (current && !current.isDestroyed()) current.hide();
      });
      browserOverlayWindow.on("closed", () => {
        browserOverlayWindow = null;
      });
    }
    const overlayWindow = browserOverlayWindow;
    overlayWindow.setBounds({
      x: parentBounds.x + parentBounds.width - width - 24,
      y: parentBounds.y + 122,
      width,
      height,
    });
    await overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(browserOverlayHtml(input.title, input.body))}`);
    overlayWindow.show();
    overlayWindow.focus();
  });

  ipcMain.on("desktop:closeBrowserOverlay", (event) => {
    if (browserOverlayWindow && event.sender === browserOverlayWindow.webContents && !browserOverlayWindow.isDestroyed()) {
      browserOverlayWindow.hide();
    }
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

  handle(channels.getStorageUsage, z.tuple([]), async () => {
    return storageCleanup.usage();
  });

  handle(channels.cleanupStorage, z.tuple([storageCleanupInputSchema]), async (_event, input: StorageCleanupInput) => {
    return storageCleanup.cleanup(input);
  });
};

const idSchema = z.string().trim().min(1).max(200);
const optionalNullableId = z.string().trim().min(1).max(200).nullable();
const workspacePathInputSchema = z.string().trim().min(1).max(2000);
const workspacePathObjectInputSchema = z.object({ path: z.string().trim().min(0).max(2000) });
const workspaceOpenTargetSchema = z.string().trim().min(1).max(2000);
const noteScopeSchema = z.enum(["global", "workspace", "file"]);
const notesListInputSchema = z.object({
  workspaceId: idSchema.optional(),
  query: z.string().max(240).optional(),
});
const notesCreateInputSchema = z.object({
  workspaceId: idSchema.optional(),
  scope: noteScopeSchema,
  title: z.string().trim().max(120).optional(),
  content: z.string().max(25 * 1024 * 1024).optional(),
  pinned: z.boolean().optional(),
});
const notesOpenInputSchema = z.object({
  workspaceId: idSchema.optional(),
  noteId: idSchema,
});
const notesOpenFileInputSchema = z.object({
  workspaceId: idSchema.optional(),
  filePath: z.string().trim().max(4000).optional(),
});
const notesUpdateInputSchema = z.object({
  workspaceId: idSchema.optional(),
  noteId: idSchema,
  title: z.string().trim().max(120).optional(),
  content: z.string().max(25 * 1024 * 1024).optional(),
  scope: z.enum(["global", "workspace"]).optional(),
  pinned: z.boolean().optional(),
});
const notesSaveInputSchema = z.object({
  workspaceId: idSchema.optional(),
  noteId: idSchema,
  filePath: z.string().trim().max(4000).optional(),
});
const notesRenameInputSchema = z.object({
  workspaceId: idSchema.optional(),
  noteId: idSchema,
  title: z.string().trim().min(1).max(120),
});
const notesDeleteInputSchema = z.object({
  workspaceId: idSchema.optional(),
  noteId: idSchema,
  deleteFile: z.boolean().optional(),
  permanent: z.boolean().optional(),
}).refine((input) => !input.permanent || input.deleteFile, {
  message: "Permanent deletion requires deleteFile.",
});
const notesCloseTabInputSchema = z.object({
  workspaceId: idSchema.optional(),
  noteId: idSchema,
});
const browserViewportSchema = z.object({
  width: z.number().min(1).max(10000),
  height: z.number().min(1).max(10000),
});
const browserBoundsInputSchema = z.object({
  workspaceId: idSchema,
  x: z.number().min(0).max(20000),
  y: z.number().min(0).max(20000),
  width: z.number().min(0).max(20000),
  height: z.number().min(0).max(20000),
});
const browserOpenInputSchema = z.object({
  workspaceId: idSchema,
  url: z.string().trim().min(1).max(4096),
  viewport: browserViewportSchema.optional(),
  tabId: idSchema.optional(),
  newTab: z.boolean().optional(),
});
const browserNavigationInputSchema = z.object({
  workspaceId: idSchema,
  direction: z.enum(["back", "forward", "reload", "stop"]),
  tabId: idSchema.optional(),
});
const browserViewportInputSchema = z.object({
  workspaceId: idSchema,
  preset: z.enum(["responsive", "mobile", "tablet", "desktop"]),
});
const browserInspectInputSchema = z.object({
  workspaceId: idSchema,
  kind: z.enum(["console", "network", "dom", "screenshot", "source"]),
  tabId: idSchema.optional(),
});
const browserTabInputSchema = z.object({
  workspaceId: idSchema,
  action: z.enum(["list", "new", "switch", "close", "close_all_except"]),
  tabId: idSchema.optional(),
  url: z.string().trim().min(1).max(4096).optional(),
});
const browserDownloadInputSchema = z.object({
  workspaceId: idSchema,
  action: z.enum(["list", "allow_next", "cancel", "reveal"]),
  downloadId: idSchema.optional(),
});
const browserShieldsInputSchema = z.object({
  workspaceId: idSchema,
  action: z.enum(["get", "set_mode", "toggle_site", "list_blocked"]),
  mode: z.enum(["off", "standard"]).optional(),
  enabled: z.boolean().optional(),
  origin: z.string().trim().max(4096).optional(),
});
const browserFormFieldValueInputSchema = z.object({
  fieldId: idSchema.optional(),
  name: z.string().trim().max(200).optional(),
  label: z.string().trim().max(240).optional(),
  value: z.union([z.string().max(4000), z.boolean()]),
}).refine((input) => Boolean(input.fieldId || input.name || input.label), {
  message: "Form field input needs fieldId, name, or label.",
});
const browserFormAnalyzeInputSchema = z.object({
  workspaceId: idSchema,
  tabId: idSchema.optional(),
});
const browserFormFillInputSchema = z.object({
  workspaceId: idSchema,
  tabId: idSchema.optional(),
  formId: idSchema.optional(),
  fields: z.array(browserFormFieldValueInputSchema).min(1).max(40),
});
const browserFormValidateInputSchema = z.object({
  workspaceId: idSchema,
  tabId: idSchema.optional(),
  formId: idSchema.optional(),
});
const browserFormSubmitInputSchema = z.object({
  workspaceId: idSchema,
  tabId: idSchema.optional(),
  formId: idSchema.optional(),
  includeScreenshot: z.boolean().optional(),
});
const browserWorkflowInputSchema = z.object({
  workspaceId: idSchema,
  action: z.enum(["start_recording", "stop_recording", "list", "get", "replay", "delete", "rename"]),
  workflowId: idSchema.optional(),
  name: z.string().trim().max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  newTab: z.boolean().optional(),
});
const browserWorkflowAssertInputSchema = z.object({
  workspaceId: idSchema,
  action: z.enum(["add", "list", "remove", "run"]),
  workflowId: idSchema.optional(),
  assertionId: idSchema.optional(),
  kind: z.enum(["text_present", "text_absent", "url_contains", "no_console_errors", "no_failed_requests", "element_visible", "form_valid", "screenshot_changed", "pdf_contains"]).optional(),
  value: z.string().trim().max(2000).optional(),
  ref: idSchema.optional(),
  formId: idSchema.optional(),
});
const browserEvidenceVaultInputSchema = z.object({
  workspaceId: idSchema,
  action: z.enum(["save_current", "list", "get", "prune"]),
  evidenceId: idSchema.optional(),
  workflowId: idSchema.optional(),
  runId: idSchema.optional(),
  includeScreenshot: z.boolean().optional(),
});
const browserDiagnoseInputSchema = z.object({
  workspaceId: idSchema,
  workflowId: idSchema.optional(),
  runId: idSchema.optional(),
});
const storageCleanupInputSchema = z.object({
  categoryIds: z.array(z.enum(["browser_artifacts", "browser_workflow_history", "browser_cache", "browser_downloads"])).min(1).max(4),
});
const browserToolsMenuInputSchema = z.object({
  workspaceId: idSchema,
  hasUrl: z.boolean(),
  hasWorkflows: z.boolean(),
  recording: z.boolean(),
  shieldsEnabled: z.boolean().optional(),
});
const browserOverlayInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().max(80_000),
  width: z.number().min(260).max(1200).optional(),
  height: z.number().min(180).max(1000).optional(),
});
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
  appwriteEndpoint: z.string().max(500).optional(),
  appwriteProjectId: z.string().max(120).optional(),
  privoraGatewayFunctionId: z.string().max(120).optional(),
  openRouterApiKey: z.string().max(10_000).optional(),
  geminiApiKey: z.string().max(10_000).optional(),
});

const saveThreadSettingsInputSchema = z.object({
  threadId: idSchema,
  model: z.string().max(160).optional(),
  reasoningEffort: z.enum(["none", "low", "medium", "high", "extra_high"]).optional(),
  collaborationMode: z.enum(["default", "plan"]).optional(),
});

const privoraAuthInputSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(8).max(4096),
  name: z.string().max(160).optional(),
});

const requestUserInputAnswerSchema = z.object({
  answers: z.array(z.string().max(4000)).max(4),
});

const requestUserInputResponseSchema = z.object({
  threadId: idSchema,
  callId: idSchema,
  answers: z.record(z.string().max(120), requestUserInputAnswerSchema),
});

const ensureBrowserOverlayPreload = (userDataPath: string) => {
  const preloadPath = path.join(userDataPath, "browser-overlay-preload.cjs");
  const source = [
    "const { contextBridge, ipcRenderer } = require('electron');",
    "contextBridge.exposeInMainWorld('privoraOverlay', { close: () => ipcRenderer.send('desktop:closeBrowserOverlay') });",
    "",
  ].join("\n");
  try {
    fs.writeFileSync(preloadPath, source, "utf8");
  } catch {
    // If this fails, the overlay still works with blur-to-close.
  }
  return preloadPath;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const browserOverlayHtml = (title: string, body: string) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';" />
    <style>
      :root { color-scheme: dark; font-family: Inter, Segoe UI, Arial, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #242424; color: #f2f2f2; overflow: hidden; }
      header { height: 42px; display: grid; grid-template-columns: minmax(0, 1fr) 28px; align-items: center; gap: 10px; border-bottom: 1px solid #3a3a3a; padding: 0 8px 0 14px; -webkit-app-region: drag; }
      strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
      button { -webkit-app-region: no-drag; display: grid; width: 26px; height: 26px; place-items: center; border: 0; border-radius: 6px; background: transparent; color: #bdbdbd; font: 18px/1 Arial, sans-serif; }
      button:hover { background: #3a3a3a; color: #fff; }
      main { height: calc(100vh - 42px); overflow: auto; padding: 12px 14px 16px; }
      pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; color: #dedede; font: 12px/1.5 Consolas, "Cascadia Mono", monospace; }
      ::selection { background: #2dd4bf55; }
      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-thumb { background: #555; border-radius: 999px; border: 2px solid #242424; }
    </style>
  </head>
  <body>
    <header><strong>${escapeHtml(title)}</strong><button type="button" aria-label="Close" title="Close" onclick="window.privoraOverlay && window.privoraOverlay.close()">×</button></header>
    <main><pre>${escapeHtml(body || "(empty)")}</pre></main>
  </body>
</html>`;
