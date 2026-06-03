import { app, BrowserWindow, Menu, nativeImage, nativeTheme, screen, shell } from "electron";
import squirrelStartup from "electron-squirrel-startup";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DesktopStore } from "./db/store";
import { AgentRuntime } from "./agent/runtime";
import { InProcessAgentService, type AgentService } from "./agent/service";
import { registerIpc, type IpcState } from "./ipc/register";
import { channels } from "./ipc/channels";
import { installRendererDiagnostics } from "./diagnostics";
import { resolveAppIconPath } from "./resources";
import { installUpdateService } from "./updateService";
import { decodePrivoraDesktopAuthCode, parsePrivoraAuthCallback } from "./billing/browserAuthFlow";
import { createTokenSession, getAppwriteAccount } from "./billing/appwriteAuth";
import { emptyAiCreditSummary, refreshAiCreditSummary } from "./billing/creditService";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let store: DesktopStore | null = null;
let runtime: AgentService | null = null;
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

if (squirrelStartup) app.quit();

if (isDevMode) {
  app.setName("Privora Dev");
  app.setPath("userData", path.join(app.getPath("appData"), "Privora Dev"));
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
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
};

const emitSnapshot = () => {
  if (!store || !runtime) return;
  const snapshot = store.snapshot(state.activeThreadId, state.activeWorkspaceId);
  snapshot.activeRun = state.activeThreadId ? runtime.getActiveRun(state.activeThreadId) : null;
  snapshot.activeRuns = runtime.listActiveRuns();
  mainWindow?.webContents.send(channels.event, { type: "snapshot", snapshot });
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
      mainWindow?.webContents.send(channels.event, {
        type: "toast",
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
    mainWindow?.webContents.send(channels.event, {
      type: "toast",
      tone: "error",
      message: result.message,
    });
    return;
  }
  void completePrivoraProtocolAuth(result.code)
    .then(() => {
      mainWindow?.webContents.send(channels.event, {
        type: "toast",
        tone: "success",
        message: "Privora Desktop is connected.",
      });
    })
    .catch((error) => {
      mainWindow?.webContents.send(channels.event, {
        type: "toast",
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
  setWindowZoom(mainWindow, getDefaultZoomFactor(mainWindow));
  const rendererEntryPath = path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
  installExternalNavigationGuards(mainWindow, MAIN_WINDOW_VITE_DEV_SERVER_URL ? undefined : pathToFileURL(rendererEntryPath).toString());

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
    const workspaces = store.listWorkspaces();
    state.activeWorkspaceId = workspaces[0]?.id ?? null;
    state.activeThreadId = store.listThreads()[0]?.id ?? store.createThread(state.activeWorkspaceId).id;
    runtime = new InProcessAgentService(new AgentRuntime(store, () => mainWindow, () => state));
    registerIpc(store, runtime, state);
    installUpdateService();
    await createWindow();
    handlePrivoraProtocolUrl(findPrivoraProtocolUrl(process.argv));

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

app.on("before-quit", () => {
  store?.close();
});
