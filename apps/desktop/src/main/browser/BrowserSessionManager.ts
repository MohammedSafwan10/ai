import fs from "node:fs/promises";
import fsSync from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, shell, WebContentsView, type DownloadItem, type Event, type Rectangle, type WebContents } from "electron";
import { BrowserCdpClient, type BrowserSnapshotOptions } from "./browserCdp";
import { buildBrowserExtractScript, browserExtractionOutput, normalizeExtractMode, sanitizeBrowserExtraction, type BrowserExtractMode, type BrowserExtractionResult } from "./browserExtraction";
import { browserOriginDecision, compactUrl, installBrowserSessionSecurity, installBrowserWebContentsSecurity, normalizeBrowserUrl, redactSensitiveText, shouldRestorePersistedBrowserUrl, type BrowserControlScope } from "./browserSecurity";
import { hideBrowserCursorOverlay, showBrowserCursorOverlay, type BrowserCursorBox, type BrowserCursorPoint } from "./browserCursorOverlay";
import { CausalJournal, pageSummary, type BrowserActionFinding, type BrowserNetworkEntry } from "./causalJournal";
import { inspectDevBridge } from "./devBridge";
import {
  browserFormOperationOutput,
  browserFormsOutput,
  buildBrowserFormAnalyzeScript,
  buildBrowserFormFillScript,
  buildBrowserFormSubmitScript,
  buildBrowserFormValidateScript,
  sanitizeBrowserFormOperation,
  sanitizeBrowserForms,
  type BrowserFormOperationResult,
} from "./browserForms";
import {
  assertionResultsOutput,
  BrowserWorkflowManager,
  classifyDiagnosis,
  diagnoseToolFailure,
  evidenceListOutput,
  stepResult,
  workflowListOutput,
  workflowRunOutput,
} from "./browserWorkflow";
import type {
  BrowserActionInput,
  BrowserEvidenceRecord,
  BrowserDiagnoseInput,
  BrowserDownloadInput,
  BrowserDownloadRecord,
  BrowserEvidenceVaultInput,
  BrowserFormAnalyzeInput,
  BrowserFormFillInput,
  BrowserFormRecord,
  BrowserFormSubmitInput,
  BrowserFormValidateInput,
  BrowserPanelStateRecord,
  BrowserTabInput,
  BrowserTabRecord,
  BrowserViewportPreset,
  BrowserWorkflowAssertInput,
  BrowserWorkflowAssertionResult,
  BrowserWorkflowAssertionKind,
  BrowserWorkflowDiagnosisRecord,
  BrowserWorkflowInput,
  BrowserWorkflowRecord,
  BrowserWorkflowStep,
  BrowserWorkspaceStateRecord,
  DesktopToolCall,
  ToolResult,
} from "../../shared/types";

interface BrowserSessionRecord {
  id: string;
  workspaceId: string;
  partition: string;
  view: WebContentsView;
  cdp: BrowserCdpClient;
  journal: CausalJournal;
  attached: boolean;
  visible: boolean;
  bounds: Rectangle;
  viewport: { width: number; height: number };
  refs: Map<string, BrowserElementRef>;
  forms: BrowserFormRecord[];
  network: Map<string, BrowserNetworkEntry>;
  approvedAgentOrigins: Set<string>;
  state: BrowserPanelStateRecord;
  createdAt: number;
  updatedAt: number;
}

interface BrowserElementRef {
  ref: string;
  role: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface OpenOptions {
  scope: BrowserControlScope;
  viewport?: { width: number; height: number };
  rememberAgentApproval?: boolean;
  throwOnLoadFailure?: boolean;
  tabId?: string;
  newTab?: boolean;
}

interface VerifyOptions {
  reload: boolean;
}

interface BrowserWaitOptions {
  kind: string;
  value?: string;
  ref?: string;
  timeoutMs?: number;
  idleMs?: number;
}

interface BrowserScreenshotOptions {
  mode: string;
  ref?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface BrowserEvidenceOptions {
  includeScreenshot?: boolean;
  includeVisibleText?: boolean;
  includeConsole?: boolean;
  includeNetwork?: boolean;
}

const DEFAULT_VIEWPORT = { width: 900, height: 680 };
const EMPTY_BOUNDS: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
const MAX_BROWSER_TABS = 6;

export class BrowserSessionManager {
  private sessions = new Map<string, BrowserSessionRecord>();
  private workspaceTabs = new Map<string, BrowserSessionRecord[]>();
  private downloads = new Map<string, BrowserDownloadRecord[]>();
  private allowNextDownload = new Set<string>();
  private downloadHandlers = new Set<string>();
  private workflows = new BrowserWorkflowManager(app.getPath("userData"));
  private replayingWorkflows = new Set<string>();
  private latestAdHocDiagnosis = new Map<string, { diagnosis: BrowserWorkflowDiagnosisRecord; createdAt: number }>();

  constructor(
    private getMainWindow: () => BrowserWindow | null,
    private emitState: (state: BrowserPanelStateRecord) => void,
    private loadPersistedWorkspace?: (workspaceId: string) => BrowserWorkspaceStateRecord | null,
    private savePersistedWorkspace?: (state: BrowserWorkspaceStateRecord) => void,
  ) {}

  getState(workspaceId: string | null | undefined) {
    if (!workspaceId) return null;
    return this.ensureSession(workspaceId).state;
  }

  async openUrl(workspaceId: string, rawUrl: string, options: OpenOptions = { scope: "user" }) {
    const url = normalizeBrowserUrl(rawUrl);
    const decision = browserOriginDecision(url, options.scope);
    if (!decision.allowed) throw new Error(decision.reason || "Browser navigation is not allowed.");
    const session = options.newTab
      ? this.createTab(workspaceId, { activate: true })
      : this.ensureSession(workspaceId, options.tabId);
    this.ensureOperationalBounds(session);
    if (options.rememberAgentApproval) session.approvedAgentOrigins.add(decision.origin);
    if (options.viewport) {
      session.viewport = options.viewport;
      this.updateState(session, { viewport: session.viewport });
    }
    this.clearPageEvidence(session);
    try {
      await session.view.webContents.loadURL(url);
    } catch (error) {
      const message = cleanLoadError(error);
      session.journal.recordConsole({ level: "error", message });
      this.updateStateFromContents(session);
      this.updateState(session, { lastFinding: message, loading: false });
      this.syncAttachment(session);
      if (options.throwOnLoadFailure) throw new Error(message);
      return session.state;
    }
    this.syncAttachment(session);
    this.updateStateFromContents(session);
    return session.state;
  }

  setVisible(workspaceId: string | null | undefined, visible: boolean) {
    if (!workspaceId) return null;
    const session = visible ? this.ensureSession(workspaceId) : this.sessions.get(workspaceId);
    if (!session) return null;
    this.workspaceTabs.get(workspaceId)?.forEach((tab) => {
      tab.visible = visible;
      this.syncAttachment(tab);
    });
    this.updateState(session, { visible });
    return session.state;
  }

  setBounds(workspaceId: string | null | undefined, bounds: Rectangle) {
    if (!workspaceId) return null;
    const session = this.ensureSession(workspaceId);
    const nextBounds = {
      x: Math.max(0, Math.round(bounds.x || 0)),
      y: Math.max(0, Math.round(bounds.y || 0)),
      width: Math.max(0, Math.round(bounds.width || 0)),
      height: Math.max(0, Math.round(bounds.height || 0)),
    };
    const tabs = this.workspaceTabs.get(workspaceId) || [];
    const unchanged = tabs.length > 0 && tabs.every((tab) =>
      tab.bounds.x === nextBounds.x &&
      tab.bounds.y === nextBounds.y &&
      tab.bounds.width === nextBounds.width &&
      tab.bounds.height === nextBounds.height &&
      tab.viewport.width === nextBounds.width &&
      tab.viewport.height === nextBounds.height
    );
    if (unchanged) return session.state;
    tabs.forEach((tab) => {
      tab.bounds = nextBounds;
      tab.viewport = { width: nextBounds.width, height: nextBounds.height };
      this.syncAttachment(tab);
    });
    this.updateState(session, { viewport: session.viewport });
    return session.state;
  }

  async navigate(workspaceId: string, direction: "back" | "forward" | "reload" | "stop", tabId?: string) {
    const session = this.ensureSession(workspaceId, tabId);
    const contents = session.view.webContents;
    if (direction === "back" && contents.navigationHistory.canGoBack()) {
      this.clearPageEvidence(session);
      contents.navigationHistory.goBack();
    }
    if (direction === "forward" && contents.navigationHistory.canGoForward()) {
      this.clearPageEvidence(session);
      contents.navigationHistory.goForward();
    }
    if (direction === "reload") {
      this.clearPageEvidence(session);
      contents.reload();
    }
    if (direction === "stop") contents.stop();
    this.updateStateFromContents(session);
    return session.state;
  }

  async snapshot(workspaceId: string, options: BrowserSnapshotOptions = {}) {
    const session = this.ensureSession(workspaceId);
    await session.cdp.snapshot({ depth: 1 }).catch(() => undefined);
    const snapshot = await this.collectInteractiveSnapshot(session, options);
    this.updateStateFromContents(session);
    return {
      url: session.state.url,
      title: session.state.title,
      snapshot,
    };
  }

  async act(workspaceId: string, input: BrowserActionInput, options: { agentApproved?: boolean } = {}): Promise<BrowserActionFinding> {
    return this.performAction(workspaceId, input, false, options);
  }

  async trace(workspaceId: string, input: BrowserActionInput & { includeScreenshot?: boolean }, options: { agentApproved?: boolean } = {}): Promise<BrowserActionFinding> {
    return this.performAction(workspaceId, input, input.includeScreenshot === true, options);
  }

  async inspect(workspaceId: string, kind: string, tabId?: string) {
    const session = this.ensureSession(workspaceId, tabId);
    if (kind === "console") {
      const consoleEntries = session.journal.recentConsole();
      return {
        output: consoleEntries.map((entry) => `${entry.level}: ${entry.message}`).join("\n") || "No recent console messages.",
        data: { console: consoleEntries },
      };
    }
    if (kind === "network") {
      const requests = session.journal.recentNetwork();
      return {
        output: requests.map((entry) => `${entry.method} ${entry.url} ${entry.status || entry.errorText || ""}`.trim()).join("\n") || "No recent network requests.",
        data: { requests },
      };
    }
    if (kind === "dom") {
      const dom = await session.cdp.domSnapshot();
      return { output: dom, data: { dom } };
    }
    if (kind === "screenshot") {
      const actionId = session.journal.begin("Captured screenshot", pageSummary(session.view.webContents), true);
      const finding = await session.journal.finish(session.view.webContents, pageSummary(session.view.webContents));
      return {
        output: finding?.screenshotPath || "Screenshot capture failed.",
        data: { actionId, screenshotPath: finding?.screenshotPath },
      };
    }
    if (kind === "source") {
      const devBridge = await inspectDevBridge(session.cdp).catch(() => ({ available: false, tools: [] }));
      return {
        output: devBridge.available ? JSON.stringify(devBridge, null, 2).slice(0, 4000) : "No Privora DevBridge data is available on this page.",
        data: { devBridge },
      };
    }
    throw new Error(`Unknown browser inspect kind: ${kind}`);
  }

  async extract(workspaceId: string, modeInput: unknown) {
    const session = this.ensureSession(workspaceId);
    const mode = normalizeExtractMode(modeInput);
    const result = await this.extractPage(session, mode);
    return {
      output: browserExtractionOutput(result),
      data: result as unknown as Record<string, unknown>,
    };
  }

  async wait(workspaceId: string, options: BrowserWaitOptions) {
    const session = this.ensureSession(workspaceId);
    this.ensureOpenPage(session);
    const kind = normalizeWaitKind(options.kind);
    const value = String(options.value || options.ref || "").trim();
    const timeoutMs = Math.max(250, Math.min(30_000, Number(options.timeoutMs) || 5_000));
    const idleMs = Math.max(200, Math.min(5_000, Number(options.idleMs) || 600));
    const startedAt = Date.now();
    let stableSince = 0;
    let lastDomSignature = "";
    if (kind === "network_idle") await session.cdp.enableNetwork().catch(() => undefined);
    while (Date.now() - startedAt <= timeoutMs) {
      const matched = await this.browserWaitMatched(session, kind, value, idleMs, lastDomSignature, stableSince);
      lastDomSignature = matched.domSignature || lastDomSignature;
      stableSince = matched.stableSince || stableSince;
      if (matched.ok) {
        this.updateStateFromContents(session);
        return {
          matched: true,
          kind,
          value,
          elapsedMs: Date.now() - startedAt,
          url: compactUrl(session.view.webContents.getURL()),
        };
      }
      await delay(150);
    }
    this.updateStateFromContents(session);
    return {
      matched: false,
      kind,
      value,
      elapsedMs: Date.now() - startedAt,
      url: compactUrl(session.view.webContents.getURL()),
    };
  }

  async screenshot(workspaceId: string, options: BrowserScreenshotOptions) {
    const session = this.ensureSession(workspaceId);
    this.ensureOpenPage(session);
    const mode = normalizeScreenshotMode(options.mode);
    const rect = await this.screenshotRect(session, mode, options);
    const image = await session.view.webContents.capturePage(rect);
    const screenshotPath = await this.saveScreenshot(session, image.toPNG(), mode);
    const pageViewport = await this.pageViewport(session);
    this.updateStateFromContents(session);
    return {
      mode,
      url: compactUrl(session.view.webContents.getURL()),
      title: redactSensitiveText(session.view.webContents.getTitle(), 240),
      screenshotPath,
      viewport: pageViewport,
      effectiveViewport: pageViewport,
      requestedViewport: session.viewport,
      rect: rect || { x: 0, y: 0, width: pageViewport.width, height: pageViewport.height },
    };
  }

  async evidence(workspaceId: string, options: BrowserEvidenceOptions) {
    const session = this.ensureSession(workspaceId);
    this.ensureOpenPage(session);
    const includeVisibleText = options.includeVisibleText !== false;
    const includeConsole = options.includeConsole !== false;
    const includeNetwork = options.includeNetwork !== false;
    const metadata = await this.extractPage(session, "metadata").catch(() => null);
    const visibleText = includeVisibleText ? await this.extractPage(session, "visible_text").catch(() => null) : null;
    const screenshot = options.includeScreenshot
      ? await this.captureEvidenceScreenshot(workspaceId, session)
      : null;
    const consoleEntries = includeConsole ? session.journal.recentConsole() : [];
    const requests = includeNetwork ? session.journal.recentNetwork() : [];
    const pageViewport = await this.pageViewport(session);
    const data = {
      url: compactUrl(session.view.webContents.getURL()),
      title: redactSensitiveText(session.view.webContents.getTitle(), 240),
      timestamp: new Date().toISOString(),
      viewport: pageViewport,
      effectiveViewport: pageViewport,
      requestedViewport: session.viewport,
      metadata: metadata?.metadata,
      visibleText: visibleText?.text,
      console: consoleEntries,
      requests,
      screenshotPath: screenshot?.screenshotPath,
      screenshotError: screenshot?.error,
      pdf: looksLikePdfUrl(session.view.webContents.getURL()) ? { available: true } : { available: false },
    };
    this.updateState(session, { evidenceUpdatedAt: Date.now() });
    return {
      output: evidenceOutput(data),
      data,
    };
  }

  async search(workspaceId: string, query: string, options: { engine?: string; open?: boolean; limit?: number; newTab?: boolean; tabId?: string } = {}) {
    const engine = normalizeSearchEngine(options.engine);
    const url = searchUrl(engine, query);
    if (options.open !== false) {
      await this.openUrl(workspaceId, url, { scope: "user", throwOnLoadFailure: true, newTab: options.newTab, tabId: options.tabId });
      await waitForBrowserSettle(this.ensureSession(workspaceId).view.webContents, 850);
    }
    const session = this.ensureSession(workspaceId);
    const links = await this.extractPage(session, "links").catch(() => ({ links: [] as BrowserExtractionResult["links"] }));
    const results = uniqueBrowserSearchResults((links.links || [])
      .filter((link) => link.href && link.text && !isSearchChromeLink(link.href, engine))
      .filter((link) => !looksLikeDuplicateUrlLabel(link.text, link.href)))
      .slice(0, Math.max(1, Math.min(20, Number(options.limit) || 8)));
    return {
      output: results.length
        ? results.map((item, index) => `${index + 1}. ${item.text} — ${item.href}`).join("\n")
        : `Opened ${engine} search for "${redactSensitiveText(query, 200)}"; no result links extracted yet.`,
      data: {
        query: redactSensitiveText(query, 500),
        engine,
        url: compactUrl(session.view.webContents.getURL()),
        title: redactSensitiveText(session.view.webContents.getTitle(), 240),
        results,
      },
    };
  }

  async tab(workspaceId: string, input: BrowserTabInput) {
    this.ensureSession(workspaceId);
    if (input.action === "new") {
      const tab = this.createTab(workspaceId, { activate: true });
      if (input.url) await this.openUrl(workspaceId, input.url, { scope: "user", tabId: tab.id, throwOnLoadFailure: true });
      return this.ensureSession(workspaceId).state;
    }
    if (input.action === "switch") {
      if (!input.tabId) throw new Error("browser_tab switch requires tabId.");
      return this.switchTab(workspaceId, input.tabId).state;
    }
    if (input.action === "close") {
      if (!input.tabId) throw new Error("browser_tab close requires tabId.");
      return this.closeTab(workspaceId, input.tabId).state;
    }
    if (input.action === "close_all_except") {
      return this.closeAllTabsExcept(workspaceId, input.tabId).state;
    }
    return this.ensureSession(workspaceId).state;
  }

  async downloadAction(workspaceId: string, input: BrowserDownloadInput) {
    this.ensureSession(workspaceId);
    if (input.action === "allow_next") {
      this.allowNextDownload.add(workspaceId);
      return {
        output: "The next browser download in this workspace is allowed.",
        data: { downloads: this.downloads.get(workspaceId) || [] },
      };
    }
    if (input.action === "cancel") {
      const download = this.findDownload(workspaceId, input.downloadId);
      if (!download) throw new Error("Download not found.");
      if (download.state === "progressing" || download.state === "pending") {
        download.state = "cancelled";
        download.updatedAt = Date.now();
        this.updateState(this.ensureSession(workspaceId), {});
      }
      return { output: `Cancelled ${download.filename}.`, data: { download } };
    }
    if (input.action === "reveal") {
      const download = this.findDownload(workspaceId, input.downloadId);
      if (!download?.path) throw new Error("Completed download path not found.");
      await shell.showItemInFolder(download.path);
      return { output: `Revealed ${download.path}.`, data: { download } };
    }
    const downloads = this.downloads.get(workspaceId) || [];
    return {
      output: downloads.length
        ? downloads.map((item) => `${item.state}: ${item.filename} ${item.receivedBytes}/${item.totalBytes || "?"}`).join("\n")
        : "No browser downloads recorded.",
      data: { downloads },
    };
  }

  async pdf(workspaceId: string, modeInput: unknown, tabId?: string) {
    const session = this.ensureSession(workspaceId, tabId);
    this.ensureOpenPage(session);
    const mode = normalizePdfMode(modeInput);
    const url = session.view.webContents.getURL();
    if (mode === "screenshot") {
      const screenshot = await this.screenshot(workspaceId, { mode: "viewport" });
      return { output: `Saved PDF screenshot: ${screenshot.screenshotPath}`, data: screenshot as unknown as Record<string, unknown> };
    }
    const text = await extractPdfTextFromUrl(url);
    const artifactPath = await this.saveTextArtifact(session, text, "pdf-text");
    const summary = summarizeText(text, mode === "summary" ? 1400 : 6000);
    return {
      output: [
        mode === "summary" ? "PDF summary:" : "PDF text:",
        summary || "(no text extracted)",
        `Artifact: ${artifactPath}`,
      ].join("\n"),
      data: {
        url: compactUrl(url),
        mode,
        artifactPath,
        text: summary,
        totalCharacters: text.length,
      },
    };
  }

  recordWorkflowTool(workspaceId: string, call: DesktopToolCall, result?: ToolResult) {
    if (this.replayingWorkflows.has(workspaceId)) return null;
    const session = this.sessions.get(workspaceId);
    const panel = this.workflows.panelState(workspaceId);
    if (session && panel.status === "recording" && panel.stepCount === 0 && call.name !== "browser_open") {
      const url = session.view.webContents.getURL();
      if (/^https?:\/\//i.test(url)) {
        this.workflows.recordStep({
          workspaceId,
          action: "browser_open",
          args: { url: compactUrl(url) },
        });
      }
    }
    const targetStrategy = session ? this.workflowTargetForCall(session, call) : undefined;
    const step = this.workflows.recordStep({
      workspaceId,
      action: call.name,
      args: this.workflowArgsForCall(session || null, call),
      targetStrategy,
      createdFromToolEventId: call.id,
    });
    if (step && session) {
      this.updateState(session, {
        lastAction: `Recorded ${workflowActionTitle(call.name)}`,
        lastFinding: `Recorded ${workflowActionTitle(call.name)} in ${this.workflows.panelState(workspaceId).activeWorkflowName || "workflow"}.`,
      });
    }
    if (result && !result.success && session) {
      this.updateState(session, { lastFinding: diagnoseToolFailure(result.error, result).finding });
    }
    return step;
  }

  async workflow(workspaceId: string, input: BrowserWorkflowInput, options: { agentApproved?: boolean } = {}) {
    this.ensureSession(workspaceId);
    if (input.action === "start_recording") {
      const workflow = this.workflows.startRecording(workspaceId, input.name, input.description);
      this.updateState(this.ensureSession(workspaceId), { lastAction: "Started workflow recording", lastFinding: `Recording ${workflow.name}.` });
      return { output: `Started recording ${workflow.name}.`, data: { workflow } };
    }
    if (input.action === "stop_recording") {
      const workflow = this.workflows.stopRecording(workspaceId, input.workflowId);
      this.updateState(this.ensureSession(workspaceId), { lastAction: "Stopped workflow recording", lastFinding: workflow ? `Saved ${workflow.steps.length} workflow step(s).` : "No active workflow recording." });
      return { output: workflow ? `Stopped recording ${workflow.name}; ${workflow.steps.length} step(s) saved.` : "No active workflow recording.", data: { workflow } };
    }
    if (input.action === "list") {
      const workflows = this.workflows.list(workspaceId);
      return { output: workflowListOutput(workflows), data: { workflows } };
    }
    if (input.action === "get") {
      const workflow = this.workflows.get(workspaceId, input.workflowId);
      return { output: workflowDetailOutput(workflow), data: { workflow } };
    }
    if (input.action === "delete") {
      const workflow = this.workflows.delete(workspaceId, input.workflowId);
      this.updateState(this.ensureSession(workspaceId), { lastFinding: `Deleted workflow ${workflow.name}.` });
      return { output: `Deleted workflow ${workflow.name}.`, data: { workflow } };
    }
    if (input.action === "rename") {
      const workflow = this.workflows.rename(workspaceId, input.workflowId, input.name, input.description);
      this.updateState(this.ensureSession(workspaceId), { lastFinding: `Renamed workflow ${workflow.name}.` });
      return { output: `Renamed workflow ${workflow.name}.`, data: { workflow } };
    }
    if (input.action === "replay") {
      const workflow = this.workflows.get(workspaceId, input.workflowId);
      const run = await this.replayWorkflow(workspaceId, workflow, { agentApproved: options.agentApproved === true, newTab: input.newTab === true });
      this.updateState(this.ensureSession(workspaceId), {
        lastAction: "Replayed browser workflow",
        lastFinding: run.diagnosis?.finding || `Workflow ${run.status}.`,
      });
      return { output: workflowRunOutput(run), data: { run, workflow } };
    }
    throw new Error(`Unknown browser_workflow action: ${input.action}`);
  }

  async workflowAssert(workspaceId: string, input: BrowserWorkflowAssertInput) {
    this.ensureSession(workspaceId);
    if (input.action === "add") {
      let screenshotPath: string | undefined;
      if (input.kind === "screenshot_changed") {
        const screenshot = await this.screenshot(workspaceId, { mode: "viewport" });
        screenshotPath = screenshot.screenshotPath;
      }
      const assertion = this.workflows.addAssertion(workspaceId, { ...input, screenshotPath });
      this.updateState(this.ensureSession(workspaceId), { lastFinding: `Added ${assertion.kind} assertion.` });
      return { output: `Added ${assertion.kind} assertion.`, data: { assertion } };
    }
    if (input.action === "remove") {
      const workflow = this.workflows.removeAssertion(workspaceId, input.workflowId, input.assertionId);
      this.updateState(this.ensureSession(workspaceId), { lastFinding: "Removed browser workflow assertion." });
      return { output: `Removed assertion. ${workflow.assertions.length} assertion(s) remain.`, data: { workflow } };
    }
    const workflow = this.workflows.get(workspaceId, input.workflowId);
    if (input.action === "list") {
      return {
        output: workflow.assertions.length ? workflow.assertions.map((assertion) => `${assertion.id} ${assertion.kind} ${assertion.value || assertion.ref || assertion.formId || ""}`.trim()).join("\n") : "No assertions configured.",
        data: { assertions: workflow.assertions },
      };
    }
    if (input.action === "run") {
      const results = await this.runWorkflowAssertions(workspaceId, workflow);
      const failed = results.find((result) => !result.passed);
      if (failed) {
        const diagnosis = classifyDiagnosis(`${failed.kind} assertion failed: ${failed.finding}`);
        this.latestAdHocDiagnosis.set(workspaceId, { diagnosis, createdAt: Date.now() });
      } else {
        this.latestAdHocDiagnosis.delete(workspaceId);
      }
      this.updateState(this.ensureSession(workspaceId), { lastFinding: assertionResultsOutput(results) });
      return { output: assertionResultsOutput(results), data: { results } };
    }
    throw new Error(`Unknown browser_assert action: ${input.action}`);
  }

  async evidenceVault(workspaceId: string, input: BrowserEvidenceVaultInput) {
    this.ensureSession(workspaceId);
    if (input.action === "save_current") {
      const record = await this.captureVaultEvidence(workspaceId, {
        workflowId: input.workflowId,
        runId: input.runId,
        includeScreenshot: input.includeScreenshot !== false,
      });
      this.updateState(this.ensureSession(workspaceId), { evidenceUpdatedAt: Date.now(), lastFinding: `Saved evidence ${record.id}.` });
      return { output: `Saved browser evidence ${record.id} for ${record.url}.`, data: { evidence: record } };
    }
    if (input.action === "get") {
      const evidence = this.workflows.getEvidence(workspaceId, input.evidenceId);
      return { output: evidenceDetailOutput(evidence), data: { evidence } };
    }
    if (input.action === "prune") {
      const removed = this.workflows.pruneEvidence(workspaceId);
      this.updateState(this.ensureSession(workspaceId), { lastFinding: `Pruned ${removed} browser evidence record(s).` });
      return { output: `Pruned ${removed} browser evidence record(s).`, data: { removed } };
    }
    const evidence = this.workflows.listEvidence(workspaceId);
    return { output: evidenceListOutput(evidence), data: { evidence } };
  }

  async diagnose(workspaceId: string, input: BrowserDiagnoseInput = { workspaceId }) {
    this.ensureSession(workspaceId);
    const requestedRun = input.runId ? this.workflows.getRun(workspaceId, input.runId) : null;
    const panelRun = this.workflows.panelState(workspaceId).lastRun;
    const run = requestedRun || panelRun;
    const adHoc = this.latestAdHocDiagnosis.get(workspaceId);
    const runTime = run?.endedAt || run?.startedAt || 0;
    if (!input.runId && !input.workflowId && adHoc && Date.now() - adHoc.createdAt < 10 * 60 * 1000 && adHoc.createdAt >= runTime) {
      this.updateState(this.ensureSession(workspaceId), { lastFinding: adHoc.diagnosis.finding });
      return { output: adHoc.diagnosis.finding, data: { diagnosis: adHoc.diagnosis } };
    }
    if (run?.diagnosis) {
      this.updateState(this.ensureSession(workspaceId), { lastFinding: run.diagnosis.finding });
      return { output: run.diagnosis.finding, data: { diagnosis: run.diagnosis, run } };
    }
    if (input.runId && run) {
      const diagnosis = diagnosisForRun(run);
      this.updateState(this.ensureSession(workspaceId), { lastFinding: diagnosis.finding });
      return { output: diagnosis.finding, data: { diagnosis, run } };
    }
    if (!input.runId && !input.workflowId && adHoc && Date.now() - adHoc.createdAt < 10 * 60 * 1000) {
      this.updateState(this.ensureSession(workspaceId), { lastFinding: adHoc.diagnosis.finding });
      return { output: adHoc.diagnosis.finding, data: { diagnosis: adHoc.diagnosis } };
    }
    const evidence = this.workflows.listEvidence(workspaceId)[0];
    const diagnosis = this.workflows.diagnose(workspaceId);
    this.updateState(this.ensureSession(workspaceId), { lastFinding: diagnosis.finding });
    return { output: diagnosis.finding, data: { diagnosis, run, evidence } };
  }

  async formAnalyze(workspaceId: string, tabId?: BrowserFormAnalyzeInput["tabId"]) {
    const session = this.ensureSession(workspaceId, tabId);
    const forms = await this.analyzeForms(session);
    return {
      output: browserFormsOutput(forms),
      data: { url: compactUrl(session.view.webContents.getURL()), title: redactSensitiveText(session.view.webContents.getTitle(), 240), forms },
    };
  }

  async formFill(workspaceId: string, input: BrowserFormFillInput, options: { agentApproved?: boolean } = {}) {
    const session = this.ensureSession(workspaceId, input.tabId);
    this.assertAgentMayControl(session, options.agentApproved === true);
    this.ensureOpenPage(session);
    const result = await this.runFormOperation(session, buildBrowserFormFillScript({ formId: input.formId, fields: input.fields }));
    const output = browserFormOperationOutput("Filled browser form", result);
    this.updateState(session, {
      forms: result.forms,
      lastAction: "Filled browser form",
      lastFinding: summarizeFormResult(output),
    });
    return { output, data: result as unknown as Record<string, unknown> };
  }

  async formValidate(workspaceId: string, input: BrowserFormValidateInput) {
    const session = this.ensureSession(workspaceId, input.tabId);
    this.ensureOpenPage(session);
    const result = await this.runFormOperation(session, buildBrowserFormValidateScript({ formId: input.formId }));
    const output = browserFormOperationOutput("Validated browser form", result);
    this.updateState(session, {
      forms: result.forms,
      lastAction: "Validated browser form",
      lastFinding: summarizeFormResult(output),
    });
    return { output, data: result as unknown as Record<string, unknown> };
  }

  async formSubmit(workspaceId: string, input: BrowserFormSubmitInput, options: { agentApproved?: boolean } = {}) {
    const session = this.ensureSession(workspaceId, input.tabId);
    this.assertAgentMayControl(session, options.agentApproved === true);
    this.ensureOpenPage(session);
    await session.cdp.enableNetwork().catch(() => undefined);
    const forms = session.forms.length ? session.forms : await this.analyzeForms(session);
    const form = input.formId ? forms.find((item) => item.id === input.formId) : forms[0];
    const actionLabel = `Submitted form ${form?.label || form?.submitLabel || form?.id || ""}`.trim();
    session.journal.begin(actionLabel, pageSummary(session.view.webContents), input.includeScreenshot === true);
    this.updateState(session, { agentActive: true, lastAction: actionLabel });
    let result: BrowserFormOperationResult;
    try {
      result = await this.runFormOperation(session, buildBrowserFormSubmitScript({ formId: input.formId }));
      await waitForBrowserSettle(session.view.webContents, 900);
    } finally {
      this.updateState(session, { agentActive: false });
    }
    const finding = await session.journal.finish(session.view.webContents, pageSummary(session.view.webContents));
    const output = [
      browserFormOperationOutput("Submitted browser form", result),
      finding?.finding ? `Trace: ${finding.finding}` : "",
      finding?.screenshotPath ? `Screenshot: ${finding.screenshotPath}` : "",
    ].filter(Boolean).join("\n");
    this.updateState(session, {
      forms: result.forms,
      lastAction: actionLabel,
      lastFinding: finding?.finding || summarizeFormResult(output),
      consoleErrorCount: session.journal.recentConsole().filter((entry) => entry.level === "error").length,
      failedRequestCount: session.journal.recentNetwork().filter((entry) => entry.failed || (entry.status || 0) >= 400).length,
    });
    return {
      output,
      data: {
        ...result,
        finding,
      } as unknown as Record<string, unknown>,
    };
  }

  openDevTools(workspaceId: string) {
    const session = this.ensureSession(workspaceId);
    if (!session.view.webContents.getURL()) {
      throw new Error("Open a page in Privora Browser before opening DevTools.");
    }
    session.view.webContents.openDevTools({ mode: "detach" });
  }

  async verify(workspaceId: string, options: VerifyOptions) {
    const session = this.ensureSession(workspaceId);
    if (options.reload) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 3500);
        session.view.webContents.once("did-finish-load", () => {
          clearTimeout(timer);
          resolve();
        });
        session.view.webContents.reload();
      });
    }
    const last = session.journal.lastFinding();
    const recentErrors = session.journal.recentConsole().filter((entry) => entry.level === "error").slice(-4);
    const recentFailures = session.journal.recentNetwork().filter((entry) => entry.failed || (entry.status || 0) >= 400).slice(-4);
    const passed = recentErrors.length === 0 && recentFailures.length === 0;
    return {
      passed,
      output: passed
        ? `Verified ${compactUrl(session.view.webContents.getURL())}; no recent console or network failures captured.`
        : `Verification found ${recentErrors.length} console error(s) and ${recentFailures.length} failed request(s).`,
      lastFinding: last,
      consoleErrors: recentErrors,
      failedRequests: recentFailures,
    };
  }

  applyViewportPreset(workspaceId: string, preset: BrowserViewportPreset) {
    const session = this.ensureSession(workspaceId);
    const viewport = viewportForPreset(preset);
    this.workspaceTabs.get(workspaceId)?.forEach((tab) => {
      tab.viewport = viewport;
      tab.state.viewportPreset = preset;
      this.syncAttachment(tab);
    });
    this.updateState(session, { viewport, viewportPreset: preset });
    return session.state;
  }

  destroyAll() {
    Array.from(this.workspaceTabs.values()).flat().forEach((session) => {
      try {
        session.cdp.detach();
        if (session.attached) this.getMainWindow()?.contentView.removeChildView(session.view);
        session.view.webContents.close({ waitForBeforeUnload: false });
      } catch {
        // best-effort cleanup during app shutdown
      }
    });
    this.sessions.clear();
    this.workspaceTabs.clear();
  }

  private ensureSession(workspaceId: string, tabId?: string) {
    this.ensureWorkspaceTabs(workspaceId);
    const tabs = this.workspaceTabs.get(workspaceId) || [];
    const explicit = tabId ? tabs.find((tab) => tab.id === tabId) : null;
    if (explicit) return explicit;
    const existing = this.sessions.get(workspaceId);
    if (existing) return existing;
    return this.createTab(workspaceId, { activate: true });
  }

  private ensureWorkspaceTabs(workspaceId: string) {
    if (this.workspaceTabs.has(workspaceId)) return;
    const persisted = this.loadPersistedWorkspace?.(workspaceId);
    const tabs = (persisted?.tabs || []).slice(0, MAX_BROWSER_TABS);
    if (tabs.length === 0) {
      this.createTab(workspaceId, { activate: true });
      return;
    }
    tabs.forEach((tab) => {
      const session = this.createTab(workspaceId, { activate: tab.id === persisted?.activeTabId, id: tab.id, createdAt: tab.createdAt });
      const restoreUrl = tab.url && shouldRestorePersistedBrowserUrl(tab.url) ? tab.url : "";
      if (restoreUrl) {
        void session.view.webContents.loadURL(restoreUrl).catch(() => undefined);
      }
      session.state = {
        ...session.state,
        url: restoreUrl,
        title: restoreUrl ? tab.title || "Privora Browser" : "New tab",
        loading: false,
      };
    });
    const active = this.workspaceTabs.get(workspaceId)?.find((tab) => tab.id === persisted?.activeTabId) || this.workspaceTabs.get(workspaceId)?.[0];
    if (active) this.switchTab(workspaceId, active.id);
  }

  private createTab(workspaceId: string, options: { activate: boolean; id?: string; createdAt?: number }) {
    const currentTabs = this.workspaceTabs.get(workspaceId) || [];
    if (currentTabs.length >= MAX_BROWSER_TABS) {
      throw new Error(`Privora Browser supports up to ${MAX_BROWSER_TABS} tabs per workspace.`);
    }
    const partition = `persist:privora-browser:${workspaceId.replace(/[^\w.-]/g, "_")}`;
    const browserSession = installBrowserSessionSecurity(partition);
    if (!this.downloadHandlers.has(partition)) {
      this.downloadHandlers.add(partition);
      browserSession.on("will-download", (event, item, webContents) => {
        this.handleDownload(workspaceId, event, item, webContents);
      });
    }
    const view = new WebContentsView({
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        javascript: true,
      },
    });
    installBrowserWebContentsSecurity(view.webContents);
    const timestamp = Date.now();
    const active = this.sessions.get(workspaceId);
    const session: BrowserSessionRecord = {
      id: options.id || crypto.randomUUID(),
      workspaceId,
      partition,
      view,
      cdp: new BrowserCdpClient(view.webContents),
      journal: new CausalJournal(workspaceId),
      attached: false,
      visible: active?.visible || false,
      bounds: active?.bounds || EMPTY_BOUNDS,
      viewport: active?.viewport || DEFAULT_VIEWPORT,
      refs: new Map(),
      forms: [],
      network: new Map(),
      approvedAgentOrigins: new Set(),
      state: createEmptyBrowserState(workspaceId),
      createdAt: options.createdAt || timestamp,
      updatedAt: timestamp,
    };
    this.installContentsListeners(session);
    this.workspaceTabs.set(workspaceId, [...currentTabs, session]);
    if (options.activate) this.switchTab(workspaceId, session.id);
    else this.persistWorkspace(workspaceId);
    return session;
  }

  private switchTab(workspaceId: string, tabId: string) {
    const tabs = this.workspaceTabs.get(workspaceId) || [];
    const next = tabs.find((tab) => tab.id === tabId);
    if (!next) throw new Error("Browser tab not found.");
    const previous = this.sessions.get(workspaceId);
    if (previous && previous.id !== next.id) {
      if (previous.attached) this.getMainWindow()?.contentView.removeChildView(previous.view);
      previous.attached = false;
    }
    this.sessions.set(workspaceId, next);
    this.syncAttachment(next);
    this.updateStateFromContents(next);
    this.persistWorkspace(workspaceId);
    return next;
  }

  private closeTab(workspaceId: string, tabId: string) {
    const tabs = this.workspaceTabs.get(workspaceId) || [];
    const closingIndex = tabs.findIndex((tab) => tab.id === tabId);
    if (closingIndex < 0) throw new Error("Browser tab not found.");
    const [closing] = tabs.splice(closingIndex, 1);
    try {
      closing.cdp.detach();
      if (closing.attached) this.getMainWindow()?.contentView.removeChildView(closing.view);
      closing.view.webContents.close({ waitForBeforeUnload: false });
    } catch {
      // best effort
    }
    this.workspaceTabs.set(workspaceId, tabs);
    if (tabs.length === 0) return this.createTab(workspaceId, { activate: true });
    const next = tabs[Math.max(0, Math.min(closingIndex, tabs.length - 1))];
    return this.switchTab(workspaceId, next.id);
  }

  private closeAllTabsExcept(workspaceId: string, keepTabId?: string) {
    const keep = keepTabId ? this.ensureSession(workspaceId, keepTabId) : this.ensureSession(workspaceId);
    const tabs = this.workspaceTabs.get(workspaceId) || [];
    tabs.filter((tab) => tab.id !== keep.id).forEach((tab) => {
      try {
        tab.cdp.detach();
        if (tab.attached) this.getMainWindow()?.contentView.removeChildView(tab.view);
        tab.view.webContents.close({ waitForBeforeUnload: false });
      } catch {
        // best effort cleanup
      }
    });
    this.workspaceTabs.set(workspaceId, [keep]);
    return this.switchTab(workspaceId, keep.id);
  }

  private handleDownload(workspaceId: string, event: Event, item: DownloadItem, webContents: WebContents) {
    const timestamp = Date.now();
    const tab = this.findTabByWebContents(workspaceId, webContents) || this.ensureSession(workspaceId);
    const filename = safeDownloadFilename(item.getFilename() || "download");
    const record: BrowserDownloadRecord = {
      id: crypto.randomUUID(),
      tabId: tab.id,
      url: compactUrl(item.getURL()),
      filename,
      mimeType: item.getMimeType() || "",
      state: this.allowNextDownload.has(workspaceId) ? "pending" : "blocked",
      receivedBytes: 0,
      totalBytes: Math.max(0, item.getTotalBytes() || 0),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.pushDownload(workspaceId, record);
    if (!this.allowNextDownload.has(workspaceId)) {
      event.preventDefault();
      this.updateState(tab, { lastFinding: `Blocked download: ${filename}` });
      return;
    }
    this.allowNextDownload.delete(workspaceId);
    const dir = path.join(app.getPath("downloads"), "Privora");
    fsSync.mkdirSync(dir, { recursive: true });
    const savePath = uniqueDownloadPath(dir, filename);
    record.path = savePath;
    record.state = "progressing";
    item.setSavePath(savePath);
    item.on("updated", (_event, state) => {
      record.state = state === "interrupted" ? "failed" : "progressing";
      record.receivedBytes = Math.max(0, item.getReceivedBytes() || 0);
      record.totalBytes = Math.max(record.totalBytes, item.getTotalBytes() || 0);
      record.updatedAt = Date.now();
      this.updateState(tab, {});
    });
    item.once("done", (_event, state) => {
      record.state = state === "completed" ? "completed" : state === "cancelled" ? "cancelled" : "failed";
      record.receivedBytes = Math.max(0, item.getReceivedBytes() || record.receivedBytes);
      record.totalBytes = Math.max(record.totalBytes, item.getTotalBytes() || 0);
      record.updatedAt = Date.now();
      if (record.state === "failed") record.error = state;
      this.updateState(tab, { lastFinding: `${record.state}: ${record.filename}` });
    });
    this.updateState(tab, { lastFinding: `Downloading ${filename}` });
  }

  private pushDownload(workspaceId: string, record: BrowserDownloadRecord) {
    const current = this.downloads.get(workspaceId) || [];
    this.downloads.set(workspaceId, [record, ...current].slice(0, 40));
  }

  private findDownload(workspaceId: string, downloadId: string | undefined) {
    const downloads = this.downloads.get(workspaceId) || [];
    if (!downloadId) return downloads[0] || null;
    return downloads.find((download) => download.id === downloadId) || null;
  }

  private findTabByWebContents(workspaceId: string, contents: WebContents) {
    return (this.workspaceTabs.get(workspaceId) || []).find((tab) => tab.view.webContents.id === contents.id) || null;
  }

  private installContentsListeners(session: BrowserSessionRecord) {
    const contents = session.view.webContents;
    contents.on("page-title-updated", () => this.updateStateFromContents(session));
    contents.on("did-start-loading", () => this.updateState(session, { loading: true }));
    contents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) this.clearPageEvidence(session);
    });
    contents.on("did-stop-loading", () => this.updateStateFromContents(session));
    contents.on("did-navigate", () => this.updateStateFromContents(session));
    contents.on("did-navigate-in-page", () => this.updateStateFromContents(session));
    contents.on("did-fail-load", (_event, _code, description, validatedURL) => {
      session.journal.recordConsole({ level: "error", message: `Load failed: ${description} ${validatedURL}` });
      this.updateStateFromContents(session);
    });
    contents.on("console-message", (details) => {
      if (isInternalBrowserConsoleMessage(details)) return;
      session.journal.recordConsole({
        level: details.level,
        message: details.message,
        sourceId: details.sourceId,
        lineNumber: details.lineNumber,
      });
      this.updateState(session, {
        consoleErrorCount: session.journal.recentConsole().filter((entry) => entry.level === "error").length,
      });
    });
    contents.debugger.on("message", (_event, method, params: Record<string, unknown>) => {
      this.recordCdpRuntime(session, method, params);
      this.recordCdpNetwork(session, method, params);
    });
  }

  private recordCdpRuntime(session: BrowserSessionRecord, method: string, params: Record<string, unknown>) {
    if (method !== "Runtime.exceptionThrown") return;
    const exceptionDetails = params.exceptionDetails as Record<string, unknown> | undefined;
    const exception = exceptionDetails?.exception as Record<string, unknown> | undefined;
    const message = String(exceptionDetails?.text || exception?.description || exception?.value || "Uncaught browser exception");
    session.journal.recordConsole({
      level: "error",
      message,
      sourceId: typeof exceptionDetails?.url === "string" ? exceptionDetails.url : undefined,
      lineNumber: Number.isFinite(Number(exceptionDetails?.lineNumber)) ? Number(exceptionDetails?.lineNumber) + 1 : undefined,
    });
    this.updateState(session, {
      consoleErrorCount: session.journal.recentConsole().filter((entry) => entry.level === "error").length,
    });
  }

  private recordCdpNetwork(session: BrowserSessionRecord, method: string, params: Record<string, unknown>) {
    if (method === "Network.requestWillBeSent") {
      const request = params.request as Record<string, unknown> | undefined;
      const id = String(params.requestId || crypto.randomUUID());
      const entry: BrowserNetworkEntry = {
        id,
        url: String(request?.url || ""),
        method: String(request?.method || "GET"),
        startedAt: Date.now(),
      };
      session.network.set(id, entry);
      session.journal.recordRequest(entry);
    }
    if (method === "Network.responseReceived") {
      const id = String(params.requestId || "");
      const current = session.network.get(id);
      const response = params.response as Record<string, unknown> | undefined;
      if (!current) return;
      const entry = {
        ...current,
        status: Number(response?.status) || undefined,
        endedAt: Date.now(),
      };
      session.network.set(id, entry);
      session.journal.recordRequest(entry);
      this.updateFailedRequestCount(session);
    }
    if (method === "Network.loadingFailed") {
      const id = String(params.requestId || "");
      const current = session.network.get(id);
      const entryBase = current || {
        id: id || crypto.randomUUID(),
        url: String(params.blockedReason || params.errorText || "unknown request"),
        method: "GET",
        startedAt: Date.now(),
      };
      const entry = {
        ...entryBase,
        failed: true,
        errorText: String(params.errorText || "failed"),
        endedAt: Date.now(),
      };
      session.network.set(id, entry);
      session.journal.recordRequest(entry);
      this.updateFailedRequestCount(session);
    }
  }

  private updateFailedRequestCount(session: BrowserSessionRecord) {
    this.updateState(session, {
      failedRequestCount: session.journal.recentNetwork().filter((entry) => entry.failed || (entry.status || 0) >= 400).length,
    });
  }

  private clearPageEvidence(session: BrowserSessionRecord) {
    session.network.clear();
    session.journal.clearPageEvidence();
    this.updateState(session, {
      consoleErrorCount: 0,
      failedRequestCount: 0,
      lastFinding: undefined,
      forms: [],
    });
    session.forms = [];
  }

  private async replayWorkflow(workspaceId: string, workflow: Pick<BrowserWorkflowRecord, "id" | "steps" | "assertions">, options: { agentApproved: boolean; newTab: boolean }) {
    const run = this.workflows.beginRun(workspaceId, workflow.id);
    this.replayingWorkflows.add(workspaceId);
    const sourceUrl = this.sessions.get(workspaceId)?.view.webContents.getURL() || "";
    if (options.newTab) {
      this.createTab(workspaceId, { activate: true });
      if (workflow.steps[0]?.action !== "browser_open" && /^https?:\/\//i.test(sourceUrl)) {
        await this.openUrl(workspaceId, sourceUrl, {
          scope: options.agentApproved ? "user" : "agent",
          throwOnLoadFailure: true,
          rememberAgentApproval: options.agentApproved,
        });
      }
    }
    try {
      for (const step of workflow.steps) {
        const startedAt = Date.now();
        try {
          const result = await this.replayWorkflowStep(workspaceId, step, options);
          const evidence = await this.captureVaultEvidence(workspaceId, {
            workflowId: workflow.id,
            runId: run.id,
            includeScreenshot: shouldScreenshotWorkflowStep(step.action),
          }).catch(() => null);
          run.stepResults.push(stepResult(step, "passed", startedAt, {
            output: result.output,
            evidenceId: evidence?.id,
          }));
          if (evidence) run.evidenceIds.push(evidence.id);
        } catch (error) {
          const evidence = await this.captureVaultEvidence(workspaceId, {
            workflowId: workflow.id,
            runId: run.id,
            includeScreenshot: true,
          }).catch(() => null);
          const diagnosis = classifyDiagnosis(error instanceof Error ? error.message : String(error), evidence?.id);
          run.stepResults.push(stepResult(step, "failed", startedAt, {
            error: error instanceof Error ? error.message : String(error),
            evidenceId: evidence?.id,
            diagnosis,
          }));
          if (evidence) run.evidenceIds.push(evidence.id);
          return this.workflows.finishRun(run, "failed", diagnosis);
        }
      }
      const assertions = await this.runWorkflowAssertions(workspaceId, workflow);
      run.assertionResults = assertions;
      const failedAssertion = assertions.find((assertion) => !assertion.passed);
      if (failedAssertion) {
        const diagnosis = classifyDiagnosis(failedAssertion.finding);
        return this.workflows.finishRun(run, "failed", diagnosis);
      }
      return this.workflows.finishRun(run, "passed");
    } finally {
      this.replayingWorkflows.delete(workspaceId);
    }
  }

  private async replayWorkflowStep(workspaceId: string, step: BrowserWorkflowStep, options: { agentApproved: boolean }): Promise<ToolResult> {
    const args = { ...step.args };
    if (step.action === "browser_open") {
      const state = await this.openUrl(workspaceId, String(args.url || ""), {
        scope: options.agentApproved ? "user" : "agent",
        throwOnLoadFailure: true,
        rememberAgentApproval: options.agentApproved,
        newTab: args.newTab === true,
      });
      return { success: true, output: `Opened ${state.url}`, data: state as unknown as Record<string, unknown> };
    }
    if (step.action === "browser_wait") {
      const result = await this.wait(workspaceId, {
        kind: String(args.for || args.kind || "network_idle"),
        value: typeof args.value === "string" ? args.value : undefined,
        ref: typeof args.ref === "string" ? args.ref : undefined,
        timeoutMs: Number.isFinite(Number(args.timeoutMs)) ? Number(args.timeoutMs) : undefined,
        idleMs: Number.isFinite(Number(args.idleMs)) ? Number(args.idleMs) : undefined,
      });
      if (!result.matched) throw new Error(`Timed out waiting for ${result.kind}${result.value ? ` ${result.value}` : ""}.`);
      return { success: true, output: `Matched ${result.kind}.`, data: result as unknown as Record<string, unknown> };
    }
    if (step.action === "browser_act" || step.action === "browser_trace") {
      const session = this.ensureSession(workspaceId);
      const actionArgs = await this.resolveWorkflowActionArgs(session, args, step.targetStrategy);
      const actionInput = actionArgs as unknown as BrowserActionInput;
      const finding = step.action === "browser_trace"
        ? await this.trace(workspaceId, actionInput, { agentApproved: options.agentApproved })
        : await this.act(workspaceId, actionInput, { agentApproved: options.agentApproved });
      return { success: true, output: finding.finding, data: finding as unknown as Record<string, unknown> };
    }
    if (step.action === "browser_form_fill") {
      const input = await this.resolveWorkflowFormFill(workspaceId, step);
      const result = await this.formFill(workspaceId, input, { agentApproved: options.agentApproved });
      return { success: true, output: result.output, data: result.data };
    }
    if (step.action === "browser_form_submit") {
      const input = await this.resolveWorkflowFormSubmit(workspaceId, step);
      const result = await this.formSubmit(workspaceId, input, { agentApproved: options.agentApproved });
      if (result.data?.valid === false || /Form is invalid|Submit ready:\s*no|Valid:\s*no/i.test(result.output || "")) {
        throw new Error(`Form validation failed during replay. ${result.output}`);
      }
      return { success: true, output: result.output, data: result.data };
    }
    if (step.action === "browser_screenshot") {
      const result = await this.screenshot(workspaceId, { mode: String(args.mode || "viewport"), ref: typeof args.ref === "string" ? args.ref : undefined });
      return { success: true, output: `Saved screenshot: ${result.screenshotPath}`, data: result as unknown as Record<string, unknown> };
    }
    if (step.action === "browser_extract") {
      const result = await this.extract(workspaceId, args.mode);
      return { success: true, output: result.output, data: result.data };
    }
    if (step.action === "browser_evidence") {
      const result = await this.evidence(workspaceId, {
        includeScreenshot: args.includeScreenshot === true,
        includeVisibleText: args.includeVisibleText !== false,
        includeConsole: args.includeConsole !== false,
        includeNetwork: args.includeNetwork !== false,
      });
      return { success: true, output: result.output, data: result.data };
    }
    if (step.action === "browser_verify") {
      const result = await this.verify(workspaceId, { reload: args.reload !== false });
      if (!result.passed) throw new Error(result.output);
      return { success: true, output: result.output, data: result as unknown as Record<string, unknown> };
    }
    throw new Error(`Workflow replay does not support ${step.action}.`);
  }

  private async runWorkflowAssertions(workspaceId: string, workflow: { assertions: Array<{ id: string; kind: BrowserWorkflowAssertionKind; value?: string; ref?: string; formId?: string; screenshotPath?: string }> }): Promise<BrowserWorkflowAssertionResult[]> {
    const results: BrowserWorkflowAssertionResult[] = [];
    for (const assertion of workflow.assertions) {
      try {
        results.push(await this.runWorkflowAssertion(workspaceId, assertion));
      } catch (error) {
        results.push({
          id: assertion.id,
          kind: assertion.kind,
          passed: false,
          finding: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
  }

  private async runWorkflowAssertion(workspaceId: string, assertion: { id: string; kind: BrowserWorkflowAssertionKind; value?: string; ref?: string; formId?: string; screenshotPath?: string }): Promise<BrowserWorkflowAssertionResult> {
    if (assertion.kind === "form_valid") {
      const result = await this.formValidate(workspaceId, { workspaceId, formId: assertion.formId });
      const valid = Boolean(result.data?.valid);
      return { id: assertion.id, kind: assertion.kind, passed: valid, finding: valid ? "Form is valid." : result.output };
    }
    if (assertion.kind === "pdf_contains") {
      const result = await this.pdf(workspaceId, "text");
      const text = String(result.data?.text || result.output || "");
      const passed = assertion.value ? text.toLowerCase().includes(assertion.value.toLowerCase()) : Boolean(text.trim());
      return { id: assertion.id, kind: assertion.kind, passed, finding: passed ? `PDF contains ${assertion.value || "text"}.` : `PDF did not contain ${assertion.value || "expected text"}.` };
    }
    if (assertion.kind === "element_visible") {
      const snapshot = await this.snapshot(workspaceId, { depth: 5 });
      const needle = assertion.value || assertion.ref || "";
      const passed = needle ? snapshot.snapshot.toLowerCase().includes(needle.toLowerCase()) : Boolean(snapshot.snapshot.trim());
      return { id: assertion.id, kind: assertion.kind, passed, finding: passed ? `Element evidence found for ${needle}.` : `Element evidence missing for ${needle}.` };
    }
    if (assertion.kind === "screenshot_changed") {
      if (!assertion.screenshotPath || !fsSync.existsSync(assertion.screenshotPath)) {
        return { id: assertion.id, kind: assertion.kind, passed: false, finding: "Screenshot baseline is missing." };
      }
      const screenshot = await this.screenshot(workspaceId, { mode: "viewport" });
      const changed = !fsSync.readFileSync(assertion.screenshotPath).equals(fsSync.readFileSync(screenshot.screenshotPath));
      return { id: assertion.id, kind: assertion.kind, passed: changed, finding: changed ? "Screenshot changed from baseline." : "Screenshot did not change from baseline." };
    }
    const evidence = await this.evidence(workspaceId, { includeScreenshot: false, includeVisibleText: true, includeConsole: true, includeNetwork: true });
    const data = evidence.data || {};
    const visibleText = String(data.visibleText || "");
    if (assertion.kind === "text_present") {
      const passed = Boolean(assertion.value && visibleText.toLowerCase().includes(assertion.value.toLowerCase()));
      return { id: assertion.id, kind: assertion.kind, passed, finding: passed ? `Text present: ${assertion.value}.` : `Text missing: ${assertion.value}.` };
    }
    if (assertion.kind === "text_absent") {
      const value = assertion.value || "";
      const passed = Boolean(value) && !visibleText.toLowerCase().includes(value.toLowerCase());
      return { id: assertion.id, kind: assertion.kind, passed, finding: passed ? `Text absent: ${value}.` : `Unexpected text present: ${value}.` };
    }
    if (assertion.kind === "url_contains") {
      const url = String(data.url || "");
      const passed = Boolean(assertion.value && url.includes(assertion.value));
      return { id: assertion.id, kind: assertion.kind, passed, finding: passed ? `URL contains ${assertion.value}.` : `URL did not contain ${assertion.value}; current URL is ${url}.` };
    }
    if (assertion.kind === "no_console_errors") {
      const errors = Array.isArray(data.console) ? data.console.filter((entry) => JSON.stringify(entry).includes("\"level\":\"error\"")) : [];
      return { id: assertion.id, kind: assertion.kind, passed: errors.length === 0, finding: errors.length === 0 ? "No console errors." : `${errors.length} console error(s) captured.` };
    }
    if (assertion.kind === "no_failed_requests") {
      const failures = Array.isArray(data.requests) ? data.requests.filter((entry) => /"failed":true|"status":[45]\d\d/.test(JSON.stringify(entry))) : [];
      return { id: assertion.id, kind: assertion.kind, passed: failures.length === 0, finding: failures.length === 0 ? "No failed requests." : `${failures.length} failed request(s) captured.` };
    }
    throw new Error(`Unsupported assertion kind ${assertion.kind}.`);
  }

  private async captureVaultEvidence(workspaceId: string, options: { workflowId?: string; runId?: string; includeScreenshot?: boolean }) {
    const session = this.ensureSession(workspaceId);
    const result = await this.evidence(workspaceId, {
      includeScreenshot: options.includeScreenshot === true,
      includeVisibleText: true,
      includeConsole: true,
      includeNetwork: true,
    });
    return this.workflows.saveEvidence({
      workspaceId,
      workflowId: options.workflowId,
      runId: options.runId,
      tabId: session.id,
      data: result.data || {},
    });
  }

  private async resolveWorkflowActionArgs(session: BrowserSessionRecord, args: Record<string, unknown>, target?: BrowserWorkflowStep["targetStrategy"]) {
    const next = { ...args };
    if (target?.role || target?.name || target?.text) {
      await this.collectInteractiveSnapshot(session, { depth: 5 }).catch(() => "");
      const needleName = (target.name || target.text || "").toLowerCase();
      const found = Array.from(session.refs.values()).find((ref) => {
        const roleMatches = !target.role || ref.role.toLowerCase() === target.role.toLowerCase();
        const nameMatches = !needleName || ref.name.toLowerCase().includes(needleName);
        return roleMatches && nameMatches;
      });
      if (found) {
        next.ref = found.ref;
        delete next.x;
        delete next.y;
        return next;
      }
    }
    if (!next.ref && Number.isFinite(target?.x) && Number.isFinite(target?.y)) {
      next.x = target?.x;
      next.y = target?.y;
    }
    return next;
  }

  private async resolveWorkflowFormFill(workspaceId: string, step: BrowserWorkflowStep): Promise<BrowserFormFillInput> {
    const session = this.ensureSession(workspaceId);
    const forms = await this.analyzeForms(session);
    const target = step.targetStrategy;
    const form = target?.formLabel
      ? forms.find((item) => item.label.toLowerCase().includes(target.formLabel!.toLowerCase()) || item.submitLabel.toLowerCase().includes(target.formLabel!.toLowerCase()))
      : target?.formId ? forms.find((item) => item.id === target.formId) : undefined;
    const fields = Array.isArray(step.args.fields) ? step.args.fields as Array<Record<string, unknown>> : [];
    return {
      workspaceId,
      formId: form?.id || String(step.args.formId || ""),
      fields: fields.map((field) => {
        const fieldTarget = {
          fieldId: typeof field.fieldId === "string" ? field.fieldId : undefined,
          name: typeof field.name === "string" ? field.name : undefined,
          label: typeof field.label === "string" ? field.label : undefined,
        };
        const control = form?.controls.find((item) =>
          (fieldTarget.name && item.name.toLowerCase() === fieldTarget.name.toLowerCase()) ||
          (fieldTarget.label && item.label.toLowerCase().includes(fieldTarget.label.toLowerCase())) ||
          (fieldTarget.fieldId && item.id === fieldTarget.fieldId)
        );
        return {
          fieldId: control?.id || fieldTarget.fieldId,
          name: control?.name || fieldTarget.name,
          label: control?.label || fieldTarget.label,
          value: typeof field.value === "boolean" ? field.value : String(field.value || ""),
        };
      }),
    };
  }

  private async resolveWorkflowFormSubmit(workspaceId: string, step: BrowserWorkflowStep): Promise<BrowserFormSubmitInput> {
    const session = this.ensureSession(workspaceId);
    const forms = await this.analyzeForms(session);
    const target = step.targetStrategy;
    const form = target?.formLabel
      ? forms.find((item) => item.label.toLowerCase().includes(target.formLabel!.toLowerCase()) || item.submitLabel.toLowerCase().includes(target.formLabel!.toLowerCase()))
      : target?.formId ? forms.find((item) => item.id === target.formId) : undefined;
    return {
      workspaceId,
      formId: form?.id || String(step.args.formId || ""),
      includeScreenshot: step.args.includeScreenshot === true,
    };
  }

  private workflowTargetForCall(session: BrowserSessionRecord, call: DesktopToolCall) {
    if (call.name === "browser_act" || call.name === "browser_trace") {
      const ref = String(call.arguments.ref || call.arguments.targetRef || "");
      const entry = ref ? session.refs.get(ref) : null;
      return {
        ref: ref || undefined,
        role: entry?.role,
        name: entry?.name,
        text: typeof call.arguments.text === "string" ? call.arguments.text : undefined,
        x: Number.isFinite(Number(call.arguments.x)) ? Number(call.arguments.x) : entry ? Math.round(entry.x + entry.width / 2) : undefined,
        y: Number.isFinite(Number(call.arguments.y)) ? Number(call.arguments.y) : entry ? Math.round(entry.y + entry.height / 2) : undefined,
      };
    }
    if (call.name === "browser_form_fill" || call.name === "browser_form_submit") {
      const formId = typeof call.arguments.formId === "string" ? call.arguments.formId : undefined;
      const form = formId ? session.forms.find((item) => item.id === formId) : session.forms[0];
      return {
        formId,
        formLabel: form?.label || form?.submitLabel,
      };
    }
    return undefined;
  }

  private workflowArgsForCall(session: BrowserSessionRecord | null, call: DesktopToolCall) {
    if (call.name !== "browser_form_fill" || !session) return call.arguments;
    const fields = Array.isArray(call.arguments.fields) ? call.arguments.fields : [];
    const formId = typeof call.arguments.formId === "string" ? call.arguments.formId : undefined;
    const form = formId ? session.forms.find((item) => item.id === formId) : session.forms[0];
    return {
      ...call.arguments,
      fields: fields.map((field) => {
        const data = field && typeof field === "object" ? field as Record<string, unknown> : {};
        const fieldId = typeof data.fieldId === "string" ? data.fieldId : undefined;
        const control = fieldId ? form?.controls.find((item) => item.id === fieldId) : undefined;
        return {
          ...data,
          name: typeof data.name === "string" ? data.name : control?.name,
          label: typeof data.label === "string" ? data.label : control?.label,
        };
      }),
    };
  }

  private syncAttachment(session: BrowserSessionRecord) {
    const window = this.getMainWindow();
    if (!window || window.isDestroyed()) return;
    const active = this.sessions.get(session.workspaceId);
    const shouldAttach = active?.id === session.id && session.visible && Boolean(session.view.webContents.getURL()) && session.bounds.width > 0 && session.bounds.height > 0;
    if (shouldAttach && !session.attached) {
      window.contentView.addChildView(session.view);
      session.attached = true;
    }
    if (!shouldAttach && session.attached) {
      window.contentView.removeChildView(session.view);
      session.attached = false;
    }
    if (shouldAttach) session.view.setBounds(session.bounds);
  }

  private updateStateFromContents(session: BrowserSessionRecord) {
    const contents = session.view.webContents;
    session.updatedAt = Date.now();
    this.updateState(session, {
      url: compactUrl(contents.getURL()),
      title: redactSensitiveText(contents.getTitle(), 240),
      loading: contents.isLoading(),
      canGoBack: contents.navigationHistory.canGoBack(),
      canGoForward: contents.navigationHistory.canGoForward(),
      visible: session.visible,
      viewport: session.viewport,
      forms: session.forms,
    });
  }

  private updateState(session: BrowserSessionRecord, patch: Partial<BrowserPanelStateRecord>) {
    session.state = {
      ...session.state,
      ...patch,
      workspaceId: session.workspaceId,
      activeTabId: this.sessions.get(session.workspaceId)?.id || session.id,
      tabs: this.tabRecords(session.workspaceId),
      downloads: this.downloads.get(session.workspaceId) || [],
      forms: session.forms,
      workflow: this.workflows.panelState(session.workspaceId),
      updatedAt: Date.now(),
    };
    this.persistWorkspace(session.workspaceId);
    if (this.sessions.get(session.workspaceId)?.id === session.id) this.emitState(session.state);
  }

  private tabRecords(workspaceId: string): BrowserTabRecord[] {
    return (this.workspaceTabs.get(workspaceId) || []).map((tab) => {
      const contents = tab.view.webContents;
      return {
        id: tab.id,
        url: compactUrl(contents.getURL() || tab.state.url || ""),
        title: redactSensitiveText(contents.getTitle() || tab.state.title || "New tab", 80),
        loading: contents.isLoading(),
        canGoBack: contents.navigationHistory.canGoBack(),
        canGoForward: contents.navigationHistory.canGoForward(),
        createdAt: tab.createdAt,
        updatedAt: tab.updatedAt,
      };
    });
  }

  private persistWorkspace(workspaceId: string) {
    const active = this.sessions.get(workspaceId);
    if (!active || !this.savePersistedWorkspace) return;
    this.savePersistedWorkspace({
      workspaceId,
      activeTabId: active.id,
      tabs: this.tabRecords(workspaceId),
      updatedAt: Date.now(),
    });
  }

  private async collectInteractiveSnapshot(session: BrowserSessionRecord, options: BrowserSnapshotOptions) {
    const result = await session.view.webContents.executeJavaScript(SNAPSHOT_SCRIPT, true) as { lines: string[]; refs: BrowserElementRef[] };
    session.refs = new Map(result.refs.map((item) => [item.ref, item]));
    const maxDepth = Math.max(1, Math.min(8, Number(options.depth) || 5));
    const lines = result.lines.slice(0, Math.max(40, maxDepth * 60));
    if (options.includeBoxes) {
      return lines.join("\n");
    }
    return lines.map((line) => line.replace(/\s\[box=[^\]]+\]/g, "")).join("\n") || "(empty page)";
  }

  private async extractPage(session: BrowserSessionRecord, mode: BrowserExtractMode) {
    this.ensureOpenPage(session);
    const raw = await session.view.webContents.executeJavaScript(buildBrowserExtractScript(mode), true) as BrowserExtractionResult;
    return sanitizeBrowserExtraction(raw);
  }

  private async analyzeForms(session: BrowserSessionRecord) {
    this.ensureOpenPage(session);
    const raw = await session.view.webContents.executeJavaScript(buildBrowserFormAnalyzeScript(), true) as BrowserFormRecord[];
    const forms = sanitizeBrowserForms(raw);
    session.forms = forms;
    this.updateState(session, { forms });
    return forms;
  }

  private async runFormOperation(session: BrowserSessionRecord, script: string) {
    this.ensureOpenPage(session);
    const raw = await session.view.webContents.executeJavaScript(script, true) as BrowserFormOperationResult;
    const result = sanitizeBrowserFormOperation(raw);
    session.forms = result.forms;
    return result;
  }

  private async performAction(workspaceId: string, input: BrowserActionInput, includeScreenshot: boolean, options: { agentApproved?: boolean } = {}) {
    const session = this.ensureSession(workspaceId);
    this.assertAgentMayControl(session, options.agentApproved === true);
    await session.cdp.enableNetwork().catch(() => undefined);
    await session.cdp.enableRuntime().catch(() => undefined);
    const action = normalizeAction(input.action);
    const actionLabel = actionLabelForInput(action, input, session.refs.get(input.ref || ""));
    const actionStartedAt = Date.now();
    session.journal.begin(actionLabel, pageSummary(session.view.webContents), includeScreenshot);
    this.updateState(session, { agentActive: true, lastAction: actionLabel });
    await this.showActionCursor(session, action, input, actionLabel);
    try {
      await this.dispatchAction(session, action, input);
      await this.waitForActionEvidenceSettle(session, actionStartedAt);
    } finally {
      void hideBrowserCursorOverlay(session.view.webContents);
    }
    const finding = await session.journal.finish(session.view.webContents, pageSummary(session.view.webContents));
    this.updateState(session, {
      agentActive: false,
      lastAction: actionLabel,
      lastFinding: finding?.finding,
      consoleErrorCount: session.journal.recentConsole().filter((entry) => entry.level === "error").length,
      failedRequestCount: session.journal.recentNetwork().filter((entry) => entry.failed || (entry.status || 0) >= 400).length,
    });
    if (!finding) throw new Error("Browser action did not produce a trace.");
    return finding;
  }

  private async dispatchAction(session: BrowserSessionRecord, action: string, input: BrowserActionInput) {
    if (action === "resize") {
      const width = Math.max(320, Math.min(2560, Number(input.width) || session.viewport.width));
      const height = Math.max(320, Math.min(2000, Number(input.height) || session.viewport.height));
      session.viewport = { width, height };
      this.updateState(session, { viewport: session.viewport });
      return;
    }
    if (action === "scroll") {
      const point = this.pointForInput(session, input);
      session.view.webContents.sendInputEvent({
        type: "mouseWheel",
        x: point.x,
        y: point.y,
        deltaX: input.deltaX || 0,
        deltaY: input.deltaY || -420,
      });
      return;
    }
    if (action === "click" || action === "type" || action === "select") {
      const point = this.pointForInput(session, input);
      session.view.webContents.focus();
      session.view.webContents.sendInputEvent({ type: "mouseDown", x: point.x, y: point.y, button: "left", clickCount: 1 });
      session.view.webContents.sendInputEvent({ type: "mouseUp", x: point.x, y: point.y, button: "left", clickCount: 1 });
      if (action === "type" && input.text) await session.view.webContents.insertText(input.text);
      if (action === "select" && input.value) await session.view.webContents.insertText(input.value);
      return;
    }
    if (action === "press") {
      const key = input.key || "Enter";
      session.view.webContents.focus();
      session.view.webContents.sendInputEvent({ type: "keyDown", keyCode: key });
      session.view.webContents.sendInputEvent({ type: "keyUp", keyCode: key });
      return;
    }
    throw new Error(`Unsupported browser action: ${action}`);
  }

  private assertAgentMayControl(session: BrowserSessionRecord, approved: boolean) {
    const url = session.view.webContents.getURL();
    if (!url) return;
    const decision = browserOriginDecision(url, "agent");
    if (decision.allowed) return;
    if (approved) session.approvedAgentOrigins.add(decision.origin);
    if (session.approvedAgentOrigins.has(decision.origin)) return;
    throw new Error(decision.reason || `Agent browser control for ${decision.origin} needs approval.`);
  }

  private pointForInput(session: BrowserSessionRecord, input: BrowserActionInput) {
    const ref = input.ref ? session.refs.get(input.ref) : null;
    if (ref) return { x: Math.round(ref.x + ref.width / 2), y: Math.round(ref.y + ref.height / 2) };
    if (Number.isFinite(input.x) && Number.isFinite(input.y)) return { x: Math.round(input.x || 0), y: Math.round(input.y || 0) };
    throw new Error("Browser action needs a snapshot ref or x/y coordinate.");
  }

  currentAgentControlRequiresApproval(workspaceId: string | null | undefined) {
    if (!workspaceId) return false;
    const session = this.sessions.get(workspaceId);
    const url = session?.view.webContents.getURL();
    if (!url) return false;
    return !browserOriginDecision(url, "agent").allowed;
  }

  private async showActionCursor(session: BrowserSessionRecord, action: string, input: BrowserActionInput, label: string) {
    const target = this.cursorTargetForInput(session, action, input);
    await showBrowserCursorOverlay(session.view.webContents, {
      point: target.point,
      box: target.box,
      label,
      pulse: action === "click" || action === "type" || action === "select",
    });
    await delay(action === "press" || action === "resize" ? 120 : 230);
  }

  private cursorTargetForInput(session: BrowserSessionRecord, action: string, input: BrowserActionInput): { point?: BrowserCursorPoint; box?: BrowserCursorBox } {
    const ref = input.ref ? session.refs.get(input.ref) : null;
    if (ref) {
      return {
        point: { x: Math.round(ref.x + ref.width / 2), y: Math.round(ref.y + ref.height / 2) },
        box: { x: Math.round(ref.x), y: Math.round(ref.y), width: Math.round(ref.width), height: Math.round(ref.height) },
      };
    }
    if (Number.isFinite(input.x) && Number.isFinite(input.y)) {
      return { point: { x: Math.round(input.x || 0), y: Math.round(input.y || 0) } };
    }
    if (action === "press" || action === "resize") {
      return { point: { x: Math.round(session.viewport.width / 2), y: Math.round(session.viewport.height / 2) } };
    }
    return {};
  }

  private ensureOpenPage(session: BrowserSessionRecord) {
    this.ensureOperationalBounds(session);
    if (!session.view.webContents.getURL()) throw new Error("Open a page in Privora Browser first.");
  }

  private ensureOperationalBounds(session: BrowserSessionRecord) {
    const width = Math.max(320, Math.round(session.bounds.width || session.viewport.width || DEFAULT_VIEWPORT.width));
    const height = Math.max(320, Math.round(session.bounds.height || session.viewport.height || DEFAULT_VIEWPORT.height));
    if (session.bounds.width > 0 && session.bounds.height > 0 && session.viewport.width > 0 && session.viewport.height > 0) return;
    session.bounds = { x: session.bounds.x || 0, y: session.bounds.y || 0, width, height };
    session.viewport = { width, height };
    session.view.setBounds(session.bounds);
    this.updateState(session, { viewport: session.viewport });
  }

  private async waitForActionEvidenceSettle(session: BrowserSessionRecord, startedAt: number) {
    const timeoutMs = 2600;
    const quietMs = 450;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const recentConsole = session.journal.recentConsole().filter((entry) => entry.timestamp >= startedAt - 50);
      const recentNetwork = session.journal.recentNetwork().filter((entry) => (entry.endedAt || entry.startedAt) >= startedAt - 50);
      const latestEventAt = Math.max(
        startedAt,
        ...recentConsole.map((entry) => entry.timestamp),
        ...recentNetwork.map((entry) => entry.endedAt || entry.startedAt),
      );
      const hasFailureEvidence = recentConsole.some((entry) => entry.level === "error" || entry.level === "warning") ||
        recentNetwork.some((entry) => entry.failed || (typeof entry.status === "number" && entry.status >= 400));
      const hasYoungPendingRequest = recentNetwork.some((entry) => !entry.endedAt && Date.now() - entry.startedAt < 1500);
      if (hasFailureEvidence && Date.now() - latestEventAt >= 180) return;
      if (!session.view.webContents.isLoading() && !hasYoungPendingRequest && Date.now() - latestEventAt >= quietMs) return;
      await delay(90);
    }
  }

  private async browserWaitMatched(
    session: BrowserSessionRecord,
    kind: BrowserWaitKind,
    value: string,
    idleMs: number,
    previousDomSignature: string,
    previousStableSince: number,
  ): Promise<{ ok: boolean; domSignature?: string; stableSince?: number }> {
    if (kind === "url_contains") return { ok: Boolean(value && session.view.webContents.getURL().includes(value)) };
    if (kind === "network_idle") {
      const latestNetworkAt = Math.max(0, ...session.journal.recentNetwork().map((entry) => entry.endedAt || entry.startedAt));
      return { ok: !session.view.webContents.isLoading() && Date.now() - latestNetworkAt >= idleMs };
    }
    if (kind === "text") {
      const found = await session.view.webContents.executeJavaScript(
        `document.body && document.body.innerText.toLowerCase().includes(${JSON.stringify(value.toLowerCase())})`,
        true,
      ).catch(() => false);
      return { ok: Boolean(value && found) };
    }
    if (kind === "ref") {
      if (!value) return { ok: false };
      await this.collectInteractiveSnapshot(session, { depth: 5 }).catch(() => undefined);
      return { ok: session.refs.has(value) };
    }
    const signature = await session.view.webContents.executeJavaScript(
      `(() => {
        const body = document.body;
        if (!body) return "";
        return [body.innerText.length, document.querySelectorAll("*").length, document.documentElement.scrollHeight].join(":");
      })()`,
      true,
    ).catch(() => "");
    const stableSince = signature && signature === previousDomSignature
      ? previousStableSince || Date.now()
      : Date.now();
    return { ok: Boolean(signature && signature === previousDomSignature && Date.now() - stableSince >= 450), domSignature: String(signature), stableSince };
  }

  private async screenshotRect(session: BrowserSessionRecord, mode: BrowserScreenshotMode, options: BrowserScreenshotOptions): Promise<Rectangle | undefined> {
    if (mode === "viewport") return undefined;
    if (mode === "element") {
      const ref = options.ref ? session.refs.get(options.ref) : null;
      if (!ref) throw new Error("browser_screenshot mode=element needs a valid snapshot ref.");
      return rectFromNumbers(ref.x, ref.y, ref.width, ref.height);
    }
    if (mode === "region") {
      return rectFromNumbers(Number(options.x), Number(options.y), Number(options.width), Number(options.height));
    }
    const dimensions = await session.view.webContents.executeJavaScript(
      `(() => ({
        width: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0, window.innerWidth),
        height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, window.innerHeight),
      }))()`,
      true,
    ).catch(() => session.viewport);
    return rectFromNumbers(0, 0, Math.min(4096, Number(dimensions.width) || session.viewport.width), Math.min(4096, Number(dimensions.height) || session.viewport.height));
  }

  private async saveScreenshot(session: BrowserSessionRecord, png: Buffer, label: string) {
    const dir = path.join(app.getPath("userData"), "browser-artifacts", session.workspaceId);
    await fs.mkdir(dir, { recursive: true });
    const filename = `${Date.now()}-${label.replace(/[^\w.-]/g, "_")}-${crypto.randomUUID().slice(0, 8)}.png`;
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, png);
    return filePath;
  }

  private async captureEvidenceScreenshot(workspaceId: string, session: BrowserSessionRecord): Promise<{ screenshotPath?: string; error?: string }> {
    const primary = await this.screenshot(workspaceId, { mode: "viewport" }).catch((error: unknown) => ({ error }));
    if ("screenshotPath" in primary && typeof primary.screenshotPath === "string") {
      return { screenshotPath: primary.screenshotPath };
    }
    try {
      this.ensureOperationalBounds(session);
      const image = await session.view.webContents.capturePage();
      return { screenshotPath: await this.saveScreenshot(session, image.toPNG(), "viewport") };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error || "Screenshot capture failed.") };
    }
  }

  private async saveTextArtifact(session: BrowserSessionRecord, text: string, label: string) {
    const dir = path.join(app.getPath("userData"), "browser-artifacts", session.workspaceId);
    await fs.mkdir(dir, { recursive: true });
    const filename = `${Date.now()}-${label.replace(/[^\w.-]/g, "_")}-${crypto.randomUUID().slice(0, 8)}.txt`;
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, text, "utf8");
    return filePath;
  }

  private async pageViewport(session: BrowserSessionRecord) {
    return await session.view.webContents.executeJavaScript(
      `(() => ({ width: Math.round(window.innerWidth || 0), height: Math.round(window.innerHeight || 0) }))()`,
      true,
    ).then((value) => {
      const data = value as { width?: unknown; height?: unknown };
      const width = Number(data.width);
      const height = Number(data.height);
      return {
        width: Number.isFinite(width) && width > 0 ? width : session.viewport.width,
        height: Number.isFinite(height) && height > 0 ? height : session.viewport.height,
      };
    }).catch(() => session.viewport);
  }
}

const createEmptyBrowserState = (workspaceId: string): BrowserPanelStateRecord => ({
  workspaceId,
  url: "",
  title: "Privora Browser",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  visible: false,
  agentActive: false,
  consoleErrorCount: 0,
  failedRequestCount: 0,
  viewport: DEFAULT_VIEWPORT,
  viewportPreset: "responsive",
  tabs: [],
  activeTabId: "",
  downloads: [],
  forms: [],
  workflow: emptyWorkflowPanelState(),
  updatedAt: Date.now(),
});

const emptyWorkflowPanelState = () => ({
  status: "idle" as const,
  stepCount: 0,
  assertionCount: 0,
  workflows: [],
  recentEvidence: [],
  updatedAt: Date.now(),
});

const viewportForPreset = (preset: BrowserViewportPreset) => {
  if (preset === "mobile") return { width: 390, height: 844 };
  if (preset === "tablet") return { width: 820, height: 1180 };
  return DEFAULT_VIEWPORT;
};

const normalizeAction = (value: string) => {
  const action = value.trim().toLowerCase();
  if (["click", "type", "press", "scroll", "select", "resize"].includes(action)) return action;
  throw new Error("browser action must be click, type, press, scroll, select, or resize.");
};

type BrowserWaitKind = "text" | "url_contains" | "network_idle" | "dom_stable" | "ref";

const normalizeWaitKind = (value: string): BrowserWaitKind => {
  const kind = value.trim().toLowerCase().replace(/^url$/, "url_contains");
  if (["text", "url_contains", "network_idle", "dom_stable", "ref"].includes(kind)) return kind as BrowserWaitKind;
  throw new Error("browser_wait for must be text, url_contains, network_idle, dom_stable, or ref.");
};

type BrowserScreenshotMode = "viewport" | "full_page" | "element" | "region";

const normalizeScreenshotMode = (value: string): BrowserScreenshotMode => {
  const mode = (value || "viewport").trim().toLowerCase();
  if (["viewport", "full_page", "element", "region"].includes(mode)) return mode as BrowserScreenshotMode;
  throw new Error("browser_screenshot mode must be viewport, full_page, element, or region.");
};

const rectFromNumbers = (x: number, y: number, width: number, height: number): Rectangle => {
  const rect = {
    x: Math.max(0, Math.round(Number(x) || 0)),
    y: Math.max(0, Math.round(Number(y) || 0)),
    width: Math.max(1, Math.round(Number(width) || 0)),
    height: Math.max(1, Math.round(Number(height) || 0)),
  };
  if (rect.width <= 1 || rect.height <= 1) throw new Error("Screenshot region must have positive width and height.");
  return rect;
};

const evidenceOutput = (data: {
  url: string;
  title: string;
  timestamp: string;
  viewport: { width: number; height: number };
  requestedViewport?: { width: number; height: number };
  visibleText?: string;
  console: unknown[];
  requests: unknown[];
  screenshotPath?: string;
  screenshotError?: string;
}) => [
  `URL: ${data.url}`,
  data.title ? `Title: ${data.title}` : "",
  `Captured: ${data.timestamp}`,
  `Effective viewport: ${data.viewport.width}x${data.viewport.height}`,
  data.requestedViewport ? `Requested viewport: ${data.requestedViewport.width}x${data.requestedViewport.height}` : "",
  data.requestedViewport && (data.requestedViewport.width !== data.viewport.width || data.requestedViewport.height !== data.viewport.height)
    ? "Viewport note: effective viewport is constrained by the current Browser panel bounds."
    : "",
  `Console entries: ${data.console.length}`,
  `Network entries: ${data.requests.length}`,
  data.screenshotPath ? `Screenshot: ${data.screenshotPath}` : "",
  data.screenshotError ? `Screenshot error: ${redactSensitiveText(data.screenshotError, 300)}` : "",
  data.visibleText ? `\nVisible text:\n${redactSensitiveText(data.visibleText, 2400)}` : "",
].filter(Boolean).join("\n");

type BrowserSearchEngine = "duckduckgo" | "bing" | "google";

type BrowserPdfMode = "summary" | "text" | "screenshot";

const normalizePdfMode = (value: unknown): BrowserPdfMode => {
  const mode = String(value || "summary").trim().toLowerCase();
  if (["summary", "text", "screenshot"].includes(mode)) return mode as BrowserPdfMode;
  throw new Error("browser_pdf mode must be summary, text, or screenshot.");
};

const looksLikePdfUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    return parsed.pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return /\.pdf(?:[?#]|$)/i.test(url);
  }
};

const extractPdfTextFromUrl = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not fetch PDF: ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!/pdf/i.test(contentType) && !looksLikePdfUrl(url)) throw new Error("The current URL did not return PDF content.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  ensurePdfJsDomPolyfills();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = resolvePdfWorkerSrc();
  const document = await pdfjs.getDocument({ data: bytes, disableFontFace: true }).promise;
  const pages: string[] = [];
  const maxPages = Math.min(document.numPages, 24);
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => "str" in item ? String(item.str) : "")
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pages.push(`Page ${pageNumber}: ${text}`);
  }
  return pages.join("\n\n");
};

const resolvePdfWorkerSrc = () => {
  const anchors = [
    path.join(app.getAppPath(), "package.json"),
    path.join(process.cwd(), "package.json"),
    typeof __filename === "string" ? __filename : "",
  ].filter(Boolean);
  for (const anchor of anchors) {
    try {
      return pathToFileURL(createRequire(anchor).resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).toString();
    } catch {
      // Try the next runtime anchor.
    }
  }
  const fallback = path.join(app.getAppPath(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
  return pathToFileURL(fallback).toString();
};

const ensurePdfJsDomPolyfills = () => {
  const target = globalThis as Record<string, unknown>;
  target.DOMMatrix ||= MinimalDOMMatrix;
  target.ImageData ||= MinimalImageData;
  target.Path2D ||= MinimalPath2D;
};

class MinimalDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  m11 = 1;
  m12 = 0;
  m13 = 0;
  m14 = 0;
  m21 = 0;
  m22 = 1;
  m23 = 0;
  m24 = 0;
  m31 = 0;
  m32 = 0;
  m33 = 1;
  m34 = 0;
  m41 = 0;
  m42 = 0;
  m43 = 0;
  m44 = 1;

  constructor(init?: number[] | string) {
    if (Array.isArray(init)) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      this.sync3dFrom2d();
    }
  }

  multiplySelf() {
    return this;
  }

  translateSelf(x = 0, y = 0) {
    this.e += x;
    this.f += y;
    this.sync3dFrom2d();
    return this;
  }

  scaleSelf() {
    return this;
  }

  rotateSelf() {
    return this;
  }

  invertSelf() {
    return this;
  }

  private sync3dFrom2d() {
    this.m11 = this.a;
    this.m12 = this.b;
    this.m21 = this.c;
    this.m22 = this.d;
    this.m41 = this.e;
    this.m42 = this.f;
  }
}

class MinimalImageData {
  constructor(
    public data: Uint8ClampedArray,
    public width: number,
    public height: number,
  ) {}
}

class MinimalPath2D {}

ensurePdfJsDomPolyfills();

const summarizeText = (text: string, maxLength: number) => {
  const compact = redactSensitiveText(text.replace(/\s+/g, " ").trim(), maxLength);
  return compact;
};

const summarizeFormResult = (output: string) =>
  redactSensitiveText(output.replace(/\s+/g, " ").trim(), 500);

const workflowActionTitle = (name: string) =>
  name.replace(/^browser_/, "").replace(/_/g, " ");

const shouldScreenshotWorkflowStep = (action: string) =>
  action === "browser_act" || action === "browser_trace" || action === "browser_form_submit" || action === "browser_open";

const workflowDetailOutput = (workflow: { id: string; name: string; steps: BrowserWorkflowStep[]; assertions: unknown[] }) => [
  `${workflow.name} (${workflow.id})`,
  `${workflow.steps.length} step(s), ${workflow.assertions.length} assertion(s)`,
  ...workflow.steps.slice(0, 30).map((step, index) => `${index + 1}. ${workflowActionTitle(step.action)} ${summarizeWorkflowArgs(step.args)}`.trim()),
].join("\n");

const summarizeWorkflowArgs = (args: Record<string, unknown>) => {
  const parts = [
    typeof args.url === "string" ? args.url : "",
    typeof args.value === "string" ? args.value : "",
    typeof args.text === "string" ? args.text : "",
    typeof args.mode === "string" ? args.mode : "",
    typeof args.action === "string" ? args.action : "",
  ].filter(Boolean);
  return redactSensitiveText(parts.join(" "), 240);
};

const evidenceDetailOutput = (evidence: BrowserEvidenceRecord) => [
  `Evidence ${evidence.id}`,
  `URL: ${evidence.url}`,
  evidence.title ? `Title: ${evidence.title}` : "",
  `Captured: ${evidence.timestamp}`,
  evidence.artifactPaths.length ? `Artifacts: ${evidence.artifactPaths.join(", ")}` : "",
  evidence.consoleSummary.length ? `Console: ${evidence.consoleSummary.length}` : "Console: 0",
  evidence.networkSummary.length ? `Network: ${evidence.networkSummary.length}` : "Network: 0",
  evidence.textSummary ? `\nText:\n${evidence.textSummary}` : "",
].filter(Boolean).join("\n");

const diagnosisForRun = (run: { status: string; stepResults?: Array<{ status: string; error?: string; diagnosis?: { finding: string } }>; assertionResults?: Array<{ passed: boolean; finding: string }> }) => {
  const failedStep = run.stepResults?.find((step) => step.status === "failed");
  if (failedStep?.diagnosis) return failedStep.diagnosis;
  if (failedStep?.error) return classifyDiagnosis(failedStep.error);
  const failedAssertion = run.assertionResults?.find((assertion) => !assertion.passed);
  if (failedAssertion) return classifyDiagnosis(failedAssertion.finding);
  const passedSteps = run.stepResults?.filter((step) => step.status === "passed").length || 0;
  const passedAssertions = run.assertionResults?.filter((assertion) => assertion.passed).length || 0;
  return {
    kind: "unknown" as const,
    finding: run.status === "passed"
      ? `Workflow run passed: ${passedSteps} step(s) passed, ${passedAssertions} assertion(s) passed.`
      : `Workflow run is ${run.status}: ${passedSteps} step(s) passed, ${passedAssertions} assertion(s) passed.`,
  };
};

const safeDownloadFilename = (value: string) => {
  const base = path.basename(value).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim();
  return base || "download";
};

const uniqueDownloadPath = (dir: string, filename: string) => {
  const parsed = path.parse(filename);
  let candidate = path.join(dir, filename);
  let index = 1;
  while (fsSync.existsSync(candidate)) {
    candidate = path.join(dir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
};

const normalizeSearchEngine = (value: unknown): BrowserSearchEngine => {
  const engine = String(value || "duckduckgo").trim().toLowerCase();
  if (["duckduckgo", "bing", "google"].includes(engine)) return engine as BrowserSearchEngine;
  return "duckduckgo";
};

const searchUrl = (engine: BrowserSearchEngine, query: string) => {
  const q = encodeURIComponent(query.trim());
  if (!q) throw new Error("browser_search query is required.");
  if (engine === "bing") return `https://www.bing.com/search?q=${q}`;
  if (engine === "google") return `https://www.google.com/search?q=${q}`;
  return `https://duckduckgo.com/?q=${q}`;
};

const isSearchChromeLink = (href: string, engine: BrowserSearchEngine) => {
  try {
    const parsed = new URL(href);
    if (engine === "duckduckgo" && parsed.hostname.includes("duckduckgo.com")) return true;
    if (engine === "bing" && parsed.hostname.includes("bing.com")) return true;
    if (engine === "google" && parsed.hostname.includes("google.com")) return true;
    return false;
  } catch {
    return false;
  }
};

const uniqueBrowserSearchResults = <T extends { href: string; text: string }>(links: T[]) => {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const link of links) {
    const key = normalizeSearchResultHref(link.href);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(link);
  }
  return unique;
};

const normalizeSearchResultHref = (href: string) => {
  try {
    const parsed = new URL(href);
    parsed.hash = "";
    parsed.search = parsed.search ? "?..." : "";
    parsed.hostname = parsed.hostname.replace(/^www\./, "");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return href.trim().replace(/\/$/, "");
  }
};

const looksLikeDuplicateUrlLabel = (text: string, href: string) => {
  const normalizedText = text.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[^\w]+/g, "");
  const normalizedHref = href.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[^\w]+/g, "");
  return Boolean(normalizedText && normalizedHref && normalizedHref.startsWith(normalizedText) && normalizedText.length > 12);
};

const isInternalBrowserConsoleMessage = (details: { sourceId?: string; message?: string }) =>
  String(details.sourceId || "").startsWith("node:electron/") ||
  /electron security warning/i.test(String(details.message || ""));

const actionLabelForInput = (action: string, input: BrowserActionInput, ref?: BrowserElementRef) => {
  const target = ref?.name || input.ref || (Number.isFinite(input.x) ? `${input.x},${input.y}` : "page");
  if (action === "type") return `Typed into ${target}`;
  if (action === "press") return `Pressed ${input.key || "Enter"}`;
  if (action === "scroll") return `Scrolled ${target}`;
  if (action === "resize") return `Resized browser to ${input.width}x${input.height}`;
  return `${action.charAt(0).toUpperCase()}${action.slice(1)}ed ${target}`;
};

const waitForBrowserSettle = (contents: WebContents, timeoutMs: number) =>
  new Promise<void>((resolve) => {
    if (!contents.isLoading()) {
      setTimeout(resolve, timeoutMs);
      return;
    }
    const timer = setTimeout(resolve, Math.max(1800, timeoutMs));
    contents.once("did-stop-loading", () => {
      clearTimeout(timer);
      setTimeout(resolve, 120);
    });
  });

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const cleanLoadError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "Page load failed.");
  return message.replace(/\s+at\s+.*$/s, "").slice(0, 500);
};

const SNAPSHOT_SCRIPT = `
(() => {
  const roleFor = (el) => {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'input') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (type === 'range') return 'slider';
      return 'textbox';
    }
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    return tag;
  };
  const nameFor = (el) => {
    const labelledBy = el.getAttribute('aria-labelledby');
    const fromLabelledBy = labelledBy && labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ').trim();
    const fromLabel = el.labels && Array.from(el.labels).map((label) => label.innerText).join(' ').trim();
    return (el.getAttribute('aria-label') || fromLabelledBy || fromLabel || el.getAttribute('placeholder') || el.innerText || el.value || el.getAttribute('href') || '').replace(/\\s+/g, ' ').trim().slice(0, 140);
  };
  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || '1') > 0.02;
  };
  const selector = 'a,button,input,textarea,select,[role],h1,h2,h3,h4,h5,h6,[tabindex]:not([tabindex="-1"])';
  const elements = Array.from(document.querySelectorAll(selector)).filter(visible).slice(0, 180);
  const refs = [];
  const lines = [];
  elements.forEach((el, index) => {
    const rect = el.getBoundingClientRect();
    const role = roleFor(el);
    const name = nameFor(el);
    const interactive = /button|link|textbox|searchbox|combobox|checkbox|radio|switch|slider|tab|menuitem|option/.test(role);
    const ref = interactive ? 'b' + (refs.length + 1) : '';
    if (ref) refs.push({ ref, role, name, x: rect.left, y: rect.top, width: rect.width, height: rect.height });
    lines.push('- ' + role + (name ? ' "' + name.replace(/"/g, '\\\\"') + '"' : '') + (ref ? ' [ref=' + ref + ']' : '') + ' [box=' + Math.round(rect.left) + ',' + Math.round(rect.top) + ',' + Math.round(rect.width) + ',' + Math.round(rect.height) + ']');
  });
  return { lines, refs };
})()
`;
