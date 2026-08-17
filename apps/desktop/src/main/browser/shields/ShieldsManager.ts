import path from "node:path";
import type {
  BrowserShieldsBlockedRequestRecord,
  BrowserShieldsMode,
  BrowserShieldsStateRecord,
} from "../../../shared/types";
import { compactUrl, isLocalBrowserUrl, redactSensitiveText, safeExactBrowserUrl } from "../browserSecurity";
import { GhosteryFilterEngine } from "./GhosteryFilterEngine";
import { ShieldsStore } from "./ShieldsStore";

export interface ShieldsDecision {
  blocked: boolean;
  record?: BrowserShieldsBlockedRequestRecord;
}

const MAX_RECENT_BLOCKED = 40;
const MAIN_FRAME_RESOURCE = "mainFrame";

export class ShieldsManager {
  private readonly store: ShieldsStore;
  private readonly engine: GhosteryFilterEngine;
  private readonly blockedByWebContents = new Map<number, BrowserShieldsBlockedRequestRecord[]>();

  constructor(userDataPath: string, options: { preloadFilters?: boolean } = {}) {
    this.store = new ShieldsStore(userDataPath);
    this.engine = new GhosteryFilterEngine(path.join(userDataPath, "browser-shields", "ghostery-engine.bin"));
    if (options.preloadFilters !== false) void this.engine.preload();
  }

  stateFor(workspaceId: string, url: string, webContentsId?: number): BrowserShieldsStateRecord {
    const settings = this.store.getWorkspace(workspaceId);
    const origin = originFor(url);
    const siteOverride = origin ? settings.siteOverrides[origin] : undefined;
    const effectiveMode = this.effectiveMode(workspaceId, url);
    const recentBlocked = webContentsId ? this.blockedByWebContents.get(webContentsId) || [] : [];
    return {
      mode: settings.mode,
      effectiveMode,
      origin,
      siteOverride,
      blockedCount: recentBlocked.length,
      recentBlocked: recentBlocked.slice(-12).reverse(),
      engineReady: this.engine.ready,
      loadError: this.engine.error,
      updatedAt: Date.now(),
    };
  }

  setMode(workspaceId: string, mode: BrowserShieldsMode) {
    this.store.setWorkspaceMode(workspaceId, mode);
  }

  setSiteMode(workspaceId: string, origin: string, mode: BrowserShieldsMode | undefined) {
    this.store.setSiteOverride(workspaceId, origin, mode);
  }

  toggleSite(workspaceId: string, url: string, enabled?: boolean) {
    const origin = originFor(url);
    if (!origin) throw new Error("Open a website before toggling Shields for this site.");
    const current = this.stateFor(workspaceId, url);
    const nextEnabled = enabled ?? current.effectiveMode === "off";
    this.setSiteMode(workspaceId, origin, nextEnabled ? "standard" : "off");
    return this.stateFor(workspaceId, url);
  }

  clearPage(webContentsId: number) {
    this.blockedByWebContents.delete(webContentsId);
  }

  recentBlocked(webContentsId: number) {
    return this.blockedByWebContents.get(webContentsId) || [];
  }

  evaluate(workspaceId: string, details: Electron.OnBeforeRequestListenerDetails): ShieldsDecision {
    if (details.resourceType === MAIN_FRAME_RESOURCE) return { blocked: false };
    const sourceUrl = details.referrer || details.frame?.url || details.url;
    if (this.effectiveMode(workspaceId, sourceUrl) === "off") return { blocked: false };
    const match = this.engine.match({
      url: details.url,
      sourceUrl,
      resourceType: details.resourceType,
      requestId: String(details.id),
      tabId: details.webContentsId,
    });
    if (!match.matched) return { blocked: false };
    const record: BrowserShieldsBlockedRequestRecord = {
      id: crypto.randomUUID(),
      url: safeExactBrowserUrl(details.url),
      displayUrl: compactUrl(details.url),
      resourceType: details.resourceType,
      sourceUrl: sourceUrl ? compactUrl(sourceUrl) : undefined,
      blockedReason: "Privora Shields blocked an ad/tracker request.",
      ruleSource: match.ruleSource ? redactSensitiveText(match.ruleSource, 300) : undefined,
      timestamp: Date.now(),
    };
    if (typeof details.webContentsId === "number") this.recordBlocked(details.webContentsId, record);
    return { blocked: true, record };
  }

  private recordBlocked(webContentsId: number, record: BrowserShieldsBlockedRequestRecord) {
    const current = this.blockedByWebContents.get(webContentsId) || [];
    this.blockedByWebContents.set(webContentsId, [...current, record].slice(-MAX_RECENT_BLOCKED));
  }

  private effectiveMode(workspaceId: string, url: string): BrowserShieldsMode {
    const settings = this.store.getWorkspace(workspaceId);
    const origin = originFor(url);
    const override = origin ? settings.siteOverrides[origin] : undefined;
    if (override) return override;
    if (isLocalBrowserUrl(url)) return "off";
    return settings.mode;
  }
}

const originFor = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.origin;
  } catch {
    return "";
  }
};
