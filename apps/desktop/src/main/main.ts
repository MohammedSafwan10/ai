import { app, BrowserWindow, dialog, Menu, nativeImage, nativeTheme, protocol, screen, shell, Tray, type MenuItemConstructorOptions, type MessageBoxOptions } from "electron";
import squirrelStartup from "electron-squirrel-startup";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DesktopStore } from "./db/store";
import { NotesStore } from "./notes/NotesStore";
import { TurnCoordinator } from "./agent/turnCoordinator";
import { AgentHarness } from "./agent/harness/agentHarness";
import { envelopePrivoraEvent } from "./agent/harness/eventBus";
import { InProcessAgentService, type AgentService } from "./agent/service";
import { registerIpc, type IpcState } from "./ipc/register";
import { channels } from "./ipc/channels";
import { installRendererDiagnostics } from "./diagnostics";
import { resolveAppIconPath } from "./resources";
import { checkForUpdates, getUpdateServiceStatus, installDownloadedUpdate, installUpdateService } from "./updateService";
import { decodePrivoraDesktopAuthCode, parsePrivoraAuthCallback } from "./billing/browserAuthFlow";
import { createTokenSession, getAppwriteAccount } from "./billing/appwriteAuth";
import { emptyAiCreditSummary, refreshAiCreditSummary } from "./billing/creditService";
import { BrowserSessionManager } from "./browser/BrowserSessionManager";
import { ComputerUseManager } from "./computer/ComputerUseManager";
import { SecurityWorkspaceService } from "./kali/service";
import { attachmentProtocolResponse } from "./attachments/protocol";
import { interceptWindowClose, stopWorkForShutdown, unfinishedSecurityJobs } from "./lifecycle";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let store: DesktopStore | null = null;
let notesStore: NotesStore | null = null;
let harnessService: AgentService | null = null;
let browserManager: BrowserSessionManager | null = null;
let computerUseManager: ComputerUseManager | null = null;
let securityService: SecurityWorkspaceService | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let isInstallingUpdate = false;
let shutdownPreparation: Promise<boolean> | null = null;
let resourcesClosed = false;
const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 1.7;
const ZOOM_STEP = 0.1;
const COMPACT_ZOOM_FACTOR = 0.84;
const MEDIUM_ZOOM_FACTOR = 0.9;
const LARGE_ZOOM_FACTOR = 1;
const state: IpcState = {
  activeThreadId: null,
  activeWorkspaceId: null,
};
const isDevMode = Boolean(MAIN_WINDOW_VITE_DEV_SERVER_URL);
const PRIVORA_PROTOCOL = "privora";
const PRIVORA_ATTACHMENT_PROTOCOL = "privora-attachment";

if (squirrelStartup) app.quit();

protocol.registerSchemesAsPrivileged([{
  scheme: PRIVORA_ATTACHMENT_PROTOCOL,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

if (isDevMode) {
  app.setName("Privora Dev");
  app.setPath("userData", path.join(app.getPath("appData"), "Privora Dev"));
} else {
  app.setName("Privora");
}
const singleInstanceLock = app.requestSingleInstanceLock();

const registerPrivoraProtocol = () => {
  if ((isDevMode || process.defaultApp) && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PRIVORA_PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    return;
  }
  app.setAsDefaultProtocolClient(PRIVORA_PROTOCOL);
};

const findPrivoraProtocolUrl = (argv: string[]) => argv.find((arg) => arg.startsWith(`${PRIVORA_PROTOCOL}://`));

const focusMainWindow = () => {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
};

const showMainWindow = async () => {
  if (!mainWindow || mainWindow.isDestroyed()) await createWindow();
  focusMainWindow();
};

const emitPrivoraEvent = (payload: Parameters<typeof envelopePrivoraEvent>[0]) => {
  const event = envelopePrivoraEvent(payload);
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) window.webContents.send(channels.event, event);
  });
};

const emitSnapshot = () => {
  if (!store || !harnessService) return;
  const snapshot = store.snapshot(state.activeThreadId, state.activeWorkspaceId);
  snapshot.activeRun = state.activeThreadId ? harnessService.getActiveRun(state.activeThreadId) : null;
  snapshot.activeRuns = harnessService.listActiveRuns();
  snapshot.terminal = harnessService.getTerminalState();
  emitPrivoraEvent({ type: "snapshot.updated", snapshot });
};

const completePrivoraProtocolAuth = async (code: string) => {
  if (!store) return;
  const token = decodePrivoraDesktopAuthCode(code);
  const settings = store.getSettings();
  const sessionCookie = await createTokenSession(settings, token);
  store.setPrivoraSessionCookie(sessionCookie);
  const account = await getAppwriteAccount(settings, sessionCookie);
  if (account.authenticated) {
    store.setPrivoraAccountProfile({ email: account.email, name: account.name });
  } else if (token.email || token.name) {
    store.setPrivoraAccountProfile({ email: token.email, name: token.name });
  }
  try {
    store.setAiCreditSummary(await refreshAiCreditSummary(store.getSettings(), sessionCookie));
  } catch (error) {
    store.setAiCreditSummary(emptyAiCreditSummary(error instanceof Error ? error.message : String(error)));
  }
  emitSnapshot();
};

const handlePrivoraProtocolUrl = (rawUrl: string | undefined) => {
  if (!rawUrl || !store) return;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === `${PRIVORA_PROTOCOL}:` && parsed.hostname === "settings" && parsed.pathname === "/billing") {
      focusMainWindow();
      emitPrivoraEvent({
        type: "notification.created",
        tone: "info",
        message: "Return to Billing and start Privora sign-in again if it is still not connected.",
      });
      return;
    }
  } catch {
    return;
  }

  const result = parsePrivoraAuthCallback(store, rawUrl);
  if (!result) return;
  focusMainWindow();
  if (!result.ok || !result.code) {
    emitPrivoraEvent({
      type: "notification.created",
      tone: "error",
      message: result.message,
    });
    return;
  }
  void completePrivoraProtocolAuth(result.code)
    .then(() => {
      emitPrivoraEvent({
        type: "notification.created",
        tone: "success",
        message: "Privora Desktop is connected.",
      });
    })
    .catch((error) => {
      emitPrivoraEvent({
        type: "notification.created",
        tone: "error",
        message: error instanceof Error ? error.message : "Privora sign-in failed.",
      });
    });
};

const clampZoomFactor = (zoomFactor: number) => Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, zoomFactor));
const zoomFactorToPercent = (zoomFactor: number) => Math.round(zoomFactor * 100);

const getDefaultZoomFactor = (window?: BrowserWindow | null) => {
  const display = window ? screen.getDisplayMatching(window.getBounds()) : screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const shortestSide = Math.min(width, height);

  if (shortestSide <= 1080) return COMPACT_ZOOM_FACTOR;
  if (shortestSide <= 1440) return MEDIUM_ZOOM_FACTOR;
  return LARGE_ZOOM_FACTOR;
};
const appIcon = () => nativeImage.createFromPath(resolveAppIconPath());

const shouldKeepRunningInTray = () =>
  process.platform !== "darwin" && Boolean(store?.getSettings().keepRunningInTray);

const runningTaskCount = () => {
  const activeRuns = harnessService?.listActiveRuns().length || 0;
  const runningTerminals = harnessService?.getTerminalState().sessions.filter((session) => session.running).length || 0;
  return activeRuns + runningTerminals + unfinishedSecurityJobs(listRemoteJobs()).length;
};

const listRemoteJobs = () => store?.listWorkspaces().filter((workspace) => workspace.type === "security").flatMap((workspace) => store!.listSecurityJobs(workspace.id)) || [];

const stopActiveWork = async () => {
  for (const run of harnessService?.listActiveRuns() || []) {
    harnessService?.stopTurn(run.threadId);
  }
  for (const session of harnessService?.getTerminalState().sessions || []) {
    if (session.running) harnessService?.stopTerminalSession(session.sessionId);
  }
  await computerUseManager?.stop();
};

const trayStatusLabel = () => {
  const tasks = runningTaskCount();
  if (tasks > 0) return `Running tasks: ${tasks}`;
  const update = getUpdateServiceStatus();
  if (update.state === "ready") return "Update ready";
  if (update.state === "downloading") return "Downloading update";
  if (update.state === "installing") return "Installing update";
  return "Idle";
};

const rebuildTrayMenu = () => {
  if (!tray) return;
  const update = getUpdateServiceStatus();
  const template: MenuItemConstructorOptions[] = [
    {
      label: "Open Privora",
      click: () => void showMainWindow(),
    },
    {
      label: "New Chat",
      click: () => {
        if (!store) return;
        const thread = store.createThread(state.activeWorkspaceId);
        state.activeThreadId = thread.id;
        emitSnapshot();
        void showMainWindow();
      },
    },
    { type: "separator" },
    { label: trayStatusLabel(), enabled: false },
    {
      label: update.state === "ready" ? "Install update and restart" : "Check updates",
      enabled: update.supported !== false && update.state !== "checking" && update.state !== "downloading" && update.state !== "installing",
      click: () => {
        if (update.state === "ready") {
          void installDownloadedUpdate();
          return;
        }
        checkForUpdates();
        rebuildTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: "Quit Privora",
      click: () => void requestQuit("tray"),
    },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
};

const createTray = () => {
  if (tray || process.platform === "darwin") return;
  const icon = appIcon();
  if (icon.isEmpty()) return;
  tray = new Tray(icon);
  tray.setToolTip("Privora");
  tray.on("double-click", () => void showMainWindow());
  rebuildTrayMenu();
};

const prepareShutdown = (reason: "tray" | "menu" | "update"): Promise<boolean> => {
  if (shutdownPreparation) return shutdownPreparation;
  shutdownPreparation = (async () => {
  const tasks = runningTaskCount();
  if (tasks > 0) {
    const options: MessageBoxOptions = {
      type: "warning",
      buttons: [reason === "update" ? "Stop tasks and restart" : "Stop tasks and quit", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Quit Privora?",
      message: `Privora has ${tasks} active or unconfirmed task(s). Stop tasks before ${reason === "update" ? "installing the update" : "quitting"}?`,
    };
    const response = mainWindow
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options);
    if (response.response !== 0) return false;
  }
  securityService?.beginShutdown();
  await stopWorkForShutdown({
    stopLocal: stopActiveWork,
    waitForLocalIdle: async () => { await harnessService?.waitForIdle(); },
    listRemoteJobs,
    cancelRemoteJob: async (id) => {
      if (!securityService) throw new Error("Kali connection service is unavailable.");
      await securityService.cancelJob(id);
    },
  });
  await securityService?.waitForIdle();
  const unconfirmed = unfinishedSecurityJobs(listRemoteJobs());
  if (unconfirmed.length) {
    const options: MessageBoxOptions = {
      type: "warning", title: "Kali jobs may still be running",
      buttons: [reason === "update" ? "Restart anyway" : "Quit anyway", "Keep Privora open"], defaultId: 1, cancelId: 1,
      message: `Could not confirm that ${unconfirmed.length} remote job(s) stopped.`,
      detail: "These jobs may continue in Kali. Their saved identities will be checked when Privora reopens.\n\n" + unconfirmed.slice(0, 8).map((job) => `${job.remoteJobId || job.id}: ${job.state}`).join("\n"),
    };
    const response = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
    if (response.response !== 0) return false;
  }
  return true;
  })().then((proceed) => {
    if (!proceed) securityService?.cancelShutdown();
    return proceed;
  }).catch(() => {
    securityService?.cancelShutdown();
    emitPrivoraEvent({ type: "notification.created", tone: "error", message: "Privora could not finish stopping its work. The app remains open; try again after active work settles." });
    return false;
  }).finally(() => { shutdownPreparation = null; });
  return shutdownPreparation;
};

const requestQuit = async (reason: "tray" | "menu" | "update") => {
  if (!await prepareShutdown(reason)) return;
  isQuitting = true;
  app.quit();
};

const setWindowZoom = (window: BrowserWindow, zoomFactor: number) => {
  const nextZoomFactor = clampZoomFactor(Number(zoomFactor.toFixed(2)));
  window.webContents.setZoomFactor(nextZoomFactor);
  window.webContents.send(channels.zoomChanged, zoomFactorToPercent(nextZoomFactor));
};

const zoomWindowBy = (window: BrowserWindow, delta: number) => {
  setWindowZoom(window, window.webContents.getZoomFactor() + delta);
};

const installApplicationMenu = () => {
  const isMac = process.platform === "darwin";
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          label: "Zoom In    Ctrl+=",
          click: (_menuItem, window) => {
            if (window instanceof BrowserWindow) zoomWindowBy(window, ZOOM_STEP);
          },
        },
        {
          label: "Zoom Out    Ctrl+-",
          click: (_menuItem, window) => {
            if (window instanceof BrowserWindow) zoomWindowBy(window, -ZOOM_STEP);
          },
        },
        {
          label: "Reset Zoom    Ctrl+0",
          click: (_menuItem, window) => {
            if (window instanceof BrowserWindow) setWindowZoom(window, getDefaultZoomFactor(window));
          },
        },
        ...isDevMode ? [
          { type: "separator" as const },
          { role: "reload" as const },
          { role: "toggleDevTools" as const },
        ] : [],
      ],
    },
    { role: "windowMenu" },
  ]));
};

const installWindowShortcuts = (window: BrowserWindow) => {
  window.webContents.on("before-input-event", (event, input) => {
    if (!input.control && !input.meta) return;

    const key = input.key.toLowerCase();
    const code = input.code.toLowerCase();
    const isZoomIn = key === "+" || key === "=" || code === "equal" || code === "numpadadd";
    const isZoomOut = key === "-" || code === "minus" || code === "numpadsubtract";
    const isResetZoom = key === "0" || code === "digit0" || code === "numpad0";

    if (!isZoomIn && !isZoomOut && !isResetZoom) return;

    event.preventDefault();

    if (isResetZoom) {
      setWindowZoom(window, getDefaultZoomFactor(window));
      return;
    }

    zoomWindowBy(window, isZoomIn ? ZOOM_STEP : -ZOOM_STEP);
  });
};

const installTextContextMenu = (window: BrowserWindow) => {
  window.webContents.on("context-menu", (_event, params) => {
    const selectedText = params.selectionText.trim();
    const editable = params.isEditable;
    if (!editable && !selectedText) return;

    const template: MenuItemConstructorOptions[] = editable
      ? [
          { role: "cut", label: "Cut", enabled: params.editFlags.canCut },
          { role: "copy", label: "Copy", enabled: params.editFlags.canCopy },
          { role: "paste", label: "Paste", enabled: params.editFlags.canPaste },
          { role: "selectAll", label: "Select All", enabled: params.editFlags.canSelectAll },
        ]
      : [
          { role: "copy", label: "Copy", enabled: params.editFlags.canCopy || Boolean(selectedText) },
        ];

    Menu.buildFromTemplate(template).popup({ window });
  });
};

const isHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

const installExternalNavigationGuards = (window: BrowserWindow, allowedProductionFileUrl?: string) => {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const allowedAppUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL
      ? url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)
      : Boolean(allowedProductionFileUrl && (url === allowedProductionFileUrl || url.startsWith(`${allowedProductionFileUrl}#`)));
    if (allowedAppUrl) return;
    event.preventDefault();
    if (isHttpUrl(url)) void shell.openExternal(url);
  });
};

const createWindow = async () => {
  const icon = appIcon();
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 920,
    minHeight: 640,
    title: "Privora",
    icon: icon.isEmpty() ? undefined : icon,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#12100d" : "#f4efe7",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.on("console-message", (details) => {
    if (!MAIN_WINDOW_VITE_DEV_SERVER_URL || (details.level !== "warning" && details.level !== "error")) return;
    console.warn(`[renderer:${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`);
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer:load-failed] ${errorCode} ${errorDescription} ${validatedURL}`);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[renderer:gone] ${details.reason}`);
  });
  installWindowShortcuts(mainWindow);
  installTextContextMenu(mainWindow);
  setWindowZoom(mainWindow, getDefaultZoomFactor(mainWindow));
  const rendererEntryPath = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
  installExternalNavigationGuards(mainWindow, MAIN_WINDOW_VITE_DEV_SERVER_URL ? undefined : pathToFileURL(rendererEntryPath).toString());

  mainWindow.on("close", (event) => {
    interceptWindowClose(event, {
      exiting: isQuitting || isInstallingUpdate,
      keepRunningInTray: shouldKeepRunningInTray(),
      hide: () => { mainWindow?.hide(); rebuildTrayMenu(); },
      requestQuit: () => requestQuit("menu"),
    });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  installRendererDiagnostics(mainWindow);

  try {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      await mainWindow.loadFile(rendererEntryPath);
    }
  } catch (error) {
    if ((error as { code?: string })?.code === "ERR_ABORTED") return;
    throw error;
  }
};

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    focusMainWindow();
    handlePrivoraProtocolUrl(findPrivoraProtocolUrl(argv));
  });

  app.on("open-url", (event, url) => {
    event.preventDefault();
    handlePrivoraProtocolUrl(url);
  });

  app.whenReady().then(async () => {
    registerPrivoraProtocol();
    installApplicationMenu();
    const icon = appIcon();
    if (process.platform === "darwin" && !icon.isEmpty()) app.dock?.setIcon(icon);
    store = new DesktopStore();
    protocol.handle(PRIVORA_ATTACHMENT_PROTOCOL, (request) => {
      const attachmentStore = store;
      if (!attachmentStore) return new Response(null, { status: 404 });
      return attachmentProtocolResponse(request, (artifactId) => attachmentStore.loadAttachment(artifactId), MAIN_WINDOW_VITE_DEV_SERVER_URL);
    });
    notesStore = new NotesStore(app.getPath("userData"));
    computerUseManager = new ComputerUseManager(app.getPath("userData"), (computerState) => {
      emitPrivoraEvent({
        type: "computer.state_updated",
        state: computerState,
      });
    });
    browserManager = new BrowserSessionManager(
      () => mainWindow,
      (browserState) => {
        emitPrivoraEvent({
          type: "browser.state_updated",
          state: browserState,
        });
      },
      (workspaceId) => store?.getBrowserWorkspaceState(workspaceId) || null,
      (browserState) => store?.saveBrowserWorkspaceState(browserState),
      () => Array.from(new Set([
        ...(store?.listWorkspaces().map((workspace) => workspace.id) || []),
        ...(store?.listBrowserWorkspaceIds() || []),
      ])),
    );
    const workspaces = store.listWorkspaces();
    state.activeWorkspaceId = workspaces[0]?.id ?? null;
    state.activeThreadId = store.listThreads()[0]?.id ?? store.createThread(state.activeWorkspaceId).id;
    computerUseManager.setEnabled(store.getSettings().computerUseEnabled);
    securityService = new SecurityWorkspaceService(store, () => emitSnapshot(), undefined, path.join(app.getPath("documents"), "Privora Evidence"));
    harnessService = new InProcessAgentService(new AgentHarness(
      new TurnCoordinator(store, () => mainWindow, () => state, browserManager, notesStore, computerUseManager, securityService),
    ));
    registerIpc(store, harnessService, state, browserManager, notesStore, computerUseManager, {
      onSettingsChanged: () => rebuildTrayMenu(),
      securityService,
    });
    installUpdateService({
      onStatusChanged: (status) => {
        if (status.state === "error" && isInstallingUpdate) { isInstallingUpdate = false; isQuitting = false; }
        rebuildTrayMenu();
      },
      onRequestInstall: () => prepareShutdown("update"),
      onBeforeInstall: () => {
        isInstallingUpdate = true;
        isQuitting = true;
      },
    });
    createTray();
    await createWindow();
    void securityService.recover().catch((error) => emitPrivoraEvent({
      type: "notification.created", tone: "error",
      message: "Kali recovery is incomplete: " + String(error),
    }));
    handlePrivoraProtocolUrl(findPrivoraProtocolUrl(process.argv));

    app.on("activate", () => {
      void showMainWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && !shouldKeepRunningInTray()) app.quit();
  });
}

app.on("before-quit", (event) => {
  if (!isQuitting && store) {
    event.preventDefault();
    void requestQuit("menu");
    return;
  }
  isQuitting = true;
  if (resourcesClosed) return;
  resourcesClosed = true;
  browserManager?.destroyAll();
  const closingStore = store;
  store = null;
  closingStore?.close();
});
