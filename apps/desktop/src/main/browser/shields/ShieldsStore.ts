import fs from "node:fs";
import path from "node:path";
import type { BrowserShieldsMode } from "../../../shared/types";

export interface ShieldsWorkspaceSettings {
  mode: BrowserShieldsMode;
  siteOverrides: Record<string, BrowserShieldsMode>;
}

interface ShieldsStoreFile {
  version: 1;
  workspaces: Record<string, ShieldsWorkspaceSettings>;
}

const DEFAULT_SETTINGS: ShieldsWorkspaceSettings = {
  mode: "standard",
  siteOverrides: {},
};

export class ShieldsStore {
  private data: ShieldsStoreFile = { version: 1, workspaces: {} };
  private loaded = false;

  constructor(private userDataPath: string) {}

  getWorkspace(workspaceId: string): ShieldsWorkspaceSettings {
    this.ensureLoaded();
    const current = this.data.workspaces[workspaceId];
    if (current) return {
      mode: current.mode === "off" ? "off" : "standard",
      siteOverrides: { ...current.siteOverrides },
    };
    return { ...DEFAULT_SETTINGS, siteOverrides: {} };
  }

  setWorkspaceMode(workspaceId: string, mode: BrowserShieldsMode) {
    const next = this.getWorkspace(workspaceId);
    next.mode = mode;
    this.data.workspaces[workspaceId] = next;
    this.save();
    return next;
  }

  setSiteOverride(workspaceId: string, origin: string, mode: BrowserShieldsMode | undefined) {
    const next = this.getWorkspace(workspaceId);
    if (mode) next.siteOverrides[origin] = mode;
    else delete next.siteOverrides[origin];
    this.data.workspaces[workspaceId] = next;
    this.save();
    return next;
  }

  private ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = fs.readFileSync(this.filePath(), "utf8");
      const parsed = JSON.parse(raw) as Partial<ShieldsStoreFile>;
      if (parsed.version === 1 && parsed.workspaces && typeof parsed.workspaces === "object") {
        this.data = { version: 1, workspaces: parsed.workspaces as Record<string, ShieldsWorkspaceSettings> };
      }
    } catch {
      this.data = { version: 1, workspaces: {} };
    }
  }

  private save() {
    fs.mkdirSync(path.dirname(this.filePath()), { recursive: true });
    fs.writeFileSync(this.filePath(), JSON.stringify(this.data, null, 2));
  }

  private filePath() {
    return path.join(this.userDataPath, "browser-shields", "settings.json");
  }
}
