import { app, autoUpdater, BrowserWindow, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { channels } from "./ipc/channels";
import type { UpdateStatus } from "../shared/types";

const UPDATE_FEED_URL = "https://updates.nexdark.com/win32/x64/stable";
const hasInstalledWindowsUpdater = () => {
  if (process.platform !== "win32" || !app.isPackaged) return false;
  const executableDirectory = path.dirname(app.getPath("exe"));
  return [path.join(executableDirectory, "Update.exe"), path.join(executableDirectory, "..", "Update.exe")].some((filename) => {
    try { return fs.statSync(filename).isFile(); } catch { return false; }
  });
};
const unsupportedUpdateMessage = () => !app.isPackaged
  ? "Updates run in installed builds."
  : process.platform !== "win32"
    ? "Updates are only configured for Windows."
    : "Automatic updates require the installed Windows build. This portable build has no Squirrel updater.";

let status: UpdateStatus = {
  state: "idle",
  supported: hasInstalledWindowsUpdater(),
  feedUrl: UPDATE_FEED_URL,
  currentVersion: app.getVersion(),
};

let checking = false;
let lastMetadataFetch = 0;
let onStatusChanged: ((status: UpdateStatus) => void) | undefined;
let onBeforeInstall: (() => void) | undefined;
let onRequestInstall: (() => Promise<boolean>) | undefined;
let installRequest: Promise<UpdateStatus> | undefined;

const emitStatus = () => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channels.updateStatusChanged, status);
  });
};

const setStatus = (next: Partial<UpdateStatus>) => {
  status = { ...status, ...next };
  emitStatus();
  onStatusChanged?.(status);
};

export const checkForUpdates = () => {
  void refreshLatestReleaseMetadata();
  if (!status.supported) {
    setStatus({
      state: "unsupported",
      message: unsupportedUpdateMessage(),
    });
    return status;
  }
  if (checking || status.state === "downloading") return status;
  checking = true;
  setStatus({ state: "checking", error: undefined, message: undefined });
  autoUpdater.checkForUpdates();
  return status;
};

const refreshLatestReleaseMetadata = async () => {
  const now = Date.now();
  if (now - lastMetadataFetch < 60_000 && status.latestVersion) return status;
  lastMetadataFetch = now;

  try {
    const response = await fetch(UPDATE_FEED_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Update feed returned ${response.status}.`);
    const latest = await response.json() as {
      version?: string;
      notes?: string;
      releaseDate?: string;
    };
    setStatus({
      latestVersion: latest.version,
      latestReleaseNotes: latest.notes,
      latestReleaseDate: latest.releaseDate,
    });
  } catch (error) {
    setStatus({ error: error instanceof Error ? error.message : String(error) });
  }

  return status;
};

export const getUpdateServiceStatus = () => status;

export const installDownloadedUpdate = (): Promise<UpdateStatus> => {
  if (installRequest) return installRequest;
  if (status.state !== "ready") return Promise.resolve(status);
  installRequest = (async () => {
    if (onRequestInstall && !await onRequestInstall()) return status;
    onBeforeInstall?.();
    setStatus({ state: "installing", message: "Installing update..." });
    autoUpdater.quitAndInstall();
    return status;
  })().catch((error) => {
    setStatus({ state: "error", error: error instanceof Error ? error.message : String(error) });
    return status;
  }).finally(() => { installRequest = undefined; });
  return installRequest;
};

export const installUpdateService = (options?: {
  onStatusChanged?: (status: UpdateStatus) => void;
  onBeforeInstall?: () => void;
  onRequestInstall?: () => Promise<boolean>;
}) => {
  onStatusChanged = options?.onStatusChanged;
  onBeforeInstall = options?.onBeforeInstall;
  onRequestInstall = options?.onRequestInstall;
  if (status.supported) {
    autoUpdater.setFeedURL({ url: UPDATE_FEED_URL });
  } else {
    status = {
      ...status,
      state: "unsupported",
      message: unsupportedUpdateMessage(),
    };
  }

  autoUpdater.on("checking-for-update", () => {
    checking = true;
    setStatus({ state: "checking", error: undefined });
  });

  autoUpdater.on("update-available", () => {
    checking = false;
    setStatus({ state: "downloading", message: "Downloading update..." });
  });

  autoUpdater.on("update-not-available", () => {
    checking = false;
    setStatus({ state: "idle", lastCheckedAt: Date.now(), message: "Privora is up to date." });
  });

  autoUpdater.on("update-downloaded", (_event, releaseNotes, releaseName, releaseDate) => {
    checking = false;
    setStatus({
      state: "ready",
      releaseName: releaseName || undefined,
      releaseNotes: releaseNotes ? String(releaseNotes) : undefined,
      releaseDate: releaseDate ? String(releaseDate) : undefined,
      lastCheckedAt: Date.now(),
      message: "Update ready to install.",
    });
  });

  autoUpdater.on("error", (error) => {
    checking = false;
    setStatus({ state: "error", error: error.message || String(error), lastCheckedAt: Date.now() });
  });

  autoUpdater.on("before-quit-for-update", () => {
    setStatus({ state: "installing", message: "Installing update..." });
  });

  ipcMain.handle(channels.getUpdateStatus, () => refreshLatestReleaseMetadata());
  ipcMain.handle(channels.checkForUpdates, () => checkForUpdates());
  ipcMain.handle(channels.installUpdate, () => installDownloadedUpdate());

  if (status.supported) {
    setTimeout(() => {
      checkForUpdates();
    }, 10_000);
  }

  void refreshLatestReleaseMetadata();
};
