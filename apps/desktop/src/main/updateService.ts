import { app, autoUpdater, BrowserWindow, ipcMain } from "electron";
import { channels } from "./ipc/channels";
import type { UpdateStatus } from "../shared/types";

const UPDATE_FEED_URL = "https://updates.nexdark.com/win32/x64/stable";

let status: UpdateStatus = {
  state: "idle",
  supported: process.platform === "win32" && app.isPackaged,
  feedUrl: UPDATE_FEED_URL,
};

let checking = false;

const emitStatus = () => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(channels.updateStatusChanged, status);
  });
};

const setStatus = (next: Partial<UpdateStatus>) => {
  status = { ...status, ...next };
  emitStatus();
};

const checkForUpdates = () => {
  if (!status.supported) {
    setStatus({
      state: "unsupported",
      message: app.isPackaged ? "Updates are only configured for Windows." : "Updates run in packaged builds.",
    });
    return status;
  }
  if (checking || status.state === "downloading") return status;
  checking = true;
  setStatus({ state: "checking", error: undefined, message: undefined });
  autoUpdater.checkForUpdates();
  return status;
};

export const installUpdateService = () => {
  if (status.supported) {
    autoUpdater.setFeedURL({ url: UPDATE_FEED_URL });
  } else {
    status = {
      ...status,
      state: "unsupported",
      message: app.isPackaged ? "Updates are only configured for Windows." : "Updates run in packaged builds.",
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

  ipcMain.handle(channels.getUpdateStatus, () => status);
  ipcMain.handle(channels.checkForUpdates, () => checkForUpdates());
  ipcMain.handle(channels.installUpdate, () => {
    if (status.state !== "ready") return status;
    setStatus({ state: "installing", message: "Installing update..." });
    autoUpdater.quitAndInstall();
    return status;
  });

  if (status.supported) {
    setTimeout(() => {
      checkForUpdates();
    }, 10_000);
  }
};
