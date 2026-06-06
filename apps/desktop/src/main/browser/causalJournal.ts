import path from "node:path";
import fs from "node:fs/promises";
import { app, type WebContents } from "electron";
import { compactUrl, redactSensitiveText } from "./browserSecurity";

export interface BrowserConsoleEntry {
  level: string;
  message: string;
  sourceId?: string;
  lineNumber?: number;
  timestamp: number;
}

export interface BrowserNetworkEntry {
  id: string;
  url: string;
  method: string;
  status?: number;
  failed?: boolean;
  errorText?: string;
  blockedByShields?: boolean;
  blockedReason?: string;
  ruleSource?: string;
  startedAt: number;
  endedAt?: number;
}

export interface BrowserActionFinding {
  actionId: string;
  action: string;
  before: BrowserPageSummary;
  after: BrowserPageSummary;
  consoleErrors: BrowserConsoleEntry[];
  failedRequests: BrowserNetworkEntry[];
  screenshotPath?: string;
  finding: string;
}

export interface BrowserPageSummary {
  url: string;
  title: string;
}

interface ActiveAction {
  id: string;
  action: string;
  before: BrowserPageSummary;
  startedAt: number;
  includeScreenshot: boolean;
}

const MAX_CONSOLE = 80;
const MAX_NETWORK = 160;
const MAX_FINDINGS = 30;

export class CausalJournal {
  private consoleEntries: BrowserConsoleEntry[] = [];
  private networkEntries: BrowserNetworkEntry[] = [];
  private findings: BrowserActionFinding[] = [];
  private active: ActiveAction | null = null;

  constructor(private workspaceId: string) {}

  recordConsole(entry: Omit<BrowserConsoleEntry, "timestamp">) {
    const message = redactSensitiveText(entry.message, 1600);
    const duplicate = [...this.consoleEntries].reverse().find((item) =>
      item.level === entry.level &&
      item.message === message &&
      item.sourceId === entry.sourceId &&
      Math.abs(Date.now() - item.timestamp) < 750);
    if (duplicate) return;
    this.consoleEntries = [
      ...this.consoleEntries,
      {
        ...entry,
        message,
        timestamp: Date.now(),
      },
    ].slice(-MAX_CONSOLE);
  }

  recordRequest(entry: BrowserNetworkEntry) {
    this.networkEntries = [
      ...this.networkEntries.filter((item) => item.id !== entry.id),
      {
        ...entry,
        url: compactUrl(entry.url),
        errorText: entry.errorText ? redactSensitiveText(entry.errorText, 500) : undefined,
      },
    ].slice(-MAX_NETWORK);
  }

  clearPageEvidence() {
    this.consoleEntries = [];
    this.networkEntries = [];
  }

  begin(action: string, before: BrowserPageSummary, includeScreenshot = false) {
    const active: ActiveAction = {
      id: crypto.randomUUID(),
      action,
      before,
      includeScreenshot,
      startedAt: Date.now(),
    };
    this.active = active;
    return active.id;
  }

  async finish(contents: WebContents, after: BrowserPageSummary): Promise<BrowserActionFinding | null> {
    const active = this.active;
    if (!active) return null;
    this.active = null;
    const since = active.startedAt - 50;
    const consoleErrors = this.consoleEntries
      .filter((entry) => entry.timestamp >= since && (entry.level === "error" || entry.level === "warning"))
      .slice(-8);
    const failedRequests = this.networkEntries
      .filter((entry) => entry.startedAt >= since && !entry.blockedByShields && (entry.failed || (typeof entry.status === "number" && entry.status >= 400)))
      .slice(-8);
    const screenshotPath = active.includeScreenshot ? await this.captureScreenshot(contents, active.id).catch(() => undefined) : undefined;
    const finding = buildFinding(active.action, active.before, after, consoleErrors, failedRequests);
    const record: BrowserActionFinding = {
      actionId: active.id,
      action: active.action,
      before: active.before,
      after,
      consoleErrors,
      failedRequests,
      screenshotPath,
      finding,
    };
    this.findings = [...this.findings, record].slice(-MAX_FINDINGS);
    return record;
  }

  recentConsole() {
    return this.consoleEntries.slice(-20);
  }

  recentNetwork() {
    return this.networkEntries.slice(-40);
  }

  recentFindings() {
    return this.findings.slice(-10);
  }

  lastFinding() {
    return this.findings.at(-1) || null;
  }

  private async captureScreenshot(contents: WebContents, actionId: string) {
    const image = await contents.capturePage();
    const dir = path.join(app.getPath("userData"), "browser-artifacts", this.workspaceId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${Date.now()}-${actionId}.png`);
    await fs.writeFile(filePath, image.toPNG());
    return filePath;
  }
}

export const pageSummary = (contents: WebContents): BrowserPageSummary => ({
  url: compactUrl(contents.getURL()),
  title: redactSensitiveText(contents.getTitle(), 240),
});

const buildFinding = (
  action: string,
  before: BrowserPageSummary,
  after: BrowserPageSummary,
  consoleErrors: BrowserConsoleEntry[],
  failedRequests: BrowserNetworkEntry[],
) => {
  const blockedNavigation = before.url === after.url && (failedRequests.length > 0 || consoleErrors.length > 0) && /^Clicked\b/i.test(action);
  const parts = [blockedNavigation ? action.replace(/^Clicked\b/i, "Click attempted on") : action];
  if (before.url !== after.url) parts.push(`navigated to ${after.url}`);
  else parts.push(blockedNavigation ? "navigation did not complete" : "stayed on the same page");
  if (failedRequests.length) {
    const first = failedRequests[0];
    parts.push(`${first.method} ${first.url} ${first.status || first.errorText || "failed"}`);
  }
  if (consoleErrors.length) {
    const first = consoleErrors[0];
    const source = first.sourceId ? ` at ${first.sourceId}${first.lineNumber ? `:${first.lineNumber}` : ""}` : "";
    parts.push(`${first.level}: ${first.message}${source}`);
  }
  if (!failedRequests.length && !consoleErrors.length) parts.push("no console or network failures captured");
  return parts.join("; ");
};
