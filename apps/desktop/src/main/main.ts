import { app, BrowserWindow, nativeTheme } from "electron";
import path from "node:path";
import { DesktopStore } from "./db/store";
import { AgentRuntime } from "./agent/runtime";
import { InProcessAgentService, type AgentService } from "./agent/service";
import { registerIpc, type IpcState } from "./ipc/register";
import { installRendererDiagnostics } from "./diagnostics";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let store: DesktopStore | null = null;
let runtime: AgentService | null = null;
const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 1.7;
const ZOOM_STEP = 0.1;
const state: IpcState = {
  activeThreadId: null,
  activeWorkspaceId: null,
};
const singleInstanceLock = app.requestSingleInstanceLock();

const clampZoomFactor = (zoomFactor: number) => Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, zoomFactor));

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
      window.webContents.setZoomFactor(1);
      return;
    }

    const nextZoomFactor = window.webContents.getZoomFactor() + (isZoomIn ? ZOOM_STEP : -ZOOM_STEP);
    window.webContents.setZoomFactor(clampZoomFactor(Number(nextZoomFactor.toFixed(2))));
  });
};

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 920,
    minHeight: 640,
    title: "Privora",
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

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  installRendererDiagnostics(mainWindow);

  try {
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      await mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
    }
  } catch (error) {
    if ((error as { code?: string })?.code === "ERR_ABORTED") return;
    throw error;
  }
};

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    store = new DesktopStore();
    const workspaces = store.listWorkspaces();
    state.activeWorkspaceId = workspaces[0]?.id ?? null;
    state.activeThreadId = store.listThreads()[0]?.id ?? store.createThread(state.activeWorkspaceId).id;
    runtime = new InProcessAgentService(new AgentRuntime(store, () => mainWindow, () => state));
    registerIpc(store, runtime, state);
    await createWindow();

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
