import type { DesktopToolCall, ToolResult } from "../../shared/types";
import type { BrowserSessionManager } from "./BrowserSessionManager";

export interface BrowserToolContext {
  workspaceId?: string;
  workspaceRoot: string;
  signal: AbortSignal;
  browserExternalApproved?: boolean;
}

type ResolvedBrowserToolContext = BrowserToolContext & { workspaceId: string };

export class BrowserToolExecutor {
  constructor(private manager: BrowserSessionManager) {}

  async execute(call: DesktopToolCall, context: BrowserToolContext): Promise<ToolResult> {
    if (!context.workspaceId) return { success: false, error: "Choose a workspace before using Privora Browser." };
    const resolvedContext: ResolvedBrowserToolContext = { ...context, workspaceId: context.workspaceId };
    const args = call.arguments;
    let result: ToolResult;
    switch (call.name) {
      case "browser_open":
        result = await this.open(args, resolvedContext);
        break;
      case "browser_snapshot":
        result = await this.snapshot(args, resolvedContext);
        break;
      case "browser_act":
        result = await this.act(args, resolvedContext);
        break;
      case "browser_inspect":
        result = await this.inspect(args, resolvedContext);
        break;
      case "browser_extract":
        result = await this.extract(args, resolvedContext);
        break;
      case "browser_wait":
        result = await this.wait(args, resolvedContext);
        break;
      case "browser_screenshot":
        result = await this.screenshot(args, resolvedContext);
        break;
      case "browser_evidence":
        result = await this.evidence(args, resolvedContext);
        break;
      case "browser_search":
        result = await this.search(args, resolvedContext);
        break;
      case "browser_tab":
        result = await this.tab(args, resolvedContext);
        break;
      case "browser_downloads":
        result = await this.downloads(args, resolvedContext);
        break;
      case "browser_pdf":
        result = await this.pdf(args, resolvedContext);
        break;
      case "browser_form_analyze":
        result = await this.formAnalyze(args, resolvedContext);
        break;
      case "browser_form_fill":
        result = await this.formFill(args, resolvedContext);
        break;
      case "browser_form_validate":
        result = await this.formValidate(args, resolvedContext);
        break;
      case "browser_form_submit":
        result = await this.formSubmit(args, resolvedContext);
        break;
      case "browser_capabilities":
        result = this.capabilities();
        break;
      case "browser_workflow":
        result = await this.workflow(args, resolvedContext);
        break;
      case "browser_assert":
        result = await this.workflowAssert(args, resolvedContext);
        break;
      case "browser_evidence_vault":
        result = await this.evidenceVault(args, resolvedContext);
        break;
      case "browser_diagnose":
        result = await this.diagnose(args, resolvedContext);
        break;
      case "browser_trace":
        result = await this.trace(args, resolvedContext);
        break;
      case "browser_verify":
        result = await this.verify(args, resolvedContext);
        break;
      default:
        return { success: false, error: `Unknown browser tool ${call.name}` };
    }
    if (!["browser_capabilities", "browser_workflow", "browser_assert", "browser_evidence_vault", "browser_diagnose"].includes(call.name)) {
      this.manager.recordWorkflowTool?.(resolvedContext.workspaceId, call, result);
    }
    return result;
  }

  private capabilities(): ToolResult {
    const toolGroups = {
      core: ["browser_open", "browser_snapshot", "browser_act", "browser_trace", "browser_verify"],
      evidence: ["browser_inspect", "browser_extract", "browser_wait", "browser_screenshot", "browser_evidence", "browser_search"],
      tabsDownloadsPdf: ["browser_tab", "browser_downloads", "browser_pdf"],
      forms: ["browser_form_analyze", "browser_form_fill", "browser_form_validate", "browser_form_submit"],
      workflows: ["browser_workflow", "browser_assert", "browser_evidence_vault", "browser_diagnose"],
    };
    return {
      success: true,
      output: [
        "Privora Browser capabilities:",
        `Core: ${toolGroups.core.join(", ")}`,
        `Evidence: ${toolGroups.evidence.join(", ")}`,
        `Tabs/downloads/PDF: ${toolGroups.tabsDownloadsPdf.join(", ")}`,
        `Forms: ${toolGroups.forms.join(", ")}`,
        `Workflows: ${toolGroups.workflows.join(", ")}`,
      ].join("\n"),
      data: {
        available: true,
        toolGroups,
        notes: [
          "Existing browser tools operate on the active tab unless tabId is provided.",
          "Full access skips normal browser approvals; hard browser security blocks remain.",
          "Evidence and workflow data are bounded and redacted.",
        ],
      },
    };
  }

  private async open(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const url = String(args.url || "").trim();
    const viewport = parseViewport(args.viewport);
    const result = await this.manager.openUrl(context.workspaceId, url, {
      scope: context.browserExternalApproved ? "user" : "agent",
      viewport,
      rememberAgentApproval: context.browserExternalApproved,
      throwOnLoadFailure: true,
      tabId: typeof args.tabId === "string" ? args.tabId : undefined,
      newTab: args.newTab === true || args.new_tab === true,
    });
    return {
      success: true,
      output: `Opened ${result.url}`,
      data: {
        workspaceId: result.workspaceId,
        url: result.url,
        title: result.title,
        loading: result.loading,
        canGoBack: result.canGoBack,
        canGoForward: result.canGoForward,
        viewport: result.viewport,
        activeTabId: result.activeTabId,
        tabs: result.tabs,
        consoleErrorCount: result.consoleErrorCount,
        failedRequestCount: result.failedRequestCount,
      },
    };
  }

  private async snapshot(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.snapshot(context.workspaceId, {
      depth: Number(args.depth) || undefined,
      includeBoxes: args.includeBoxes === true || args.include_boxes === true,
      targetRef: typeof args.targetRef === "string" ? args.targetRef : undefined,
    });
    return {
      success: true,
      output: result.snapshot,
      data: {
        url: result.url,
        title: result.title,
        snapshot: result.snapshot,
      },
    };
  }

  private async act(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.act(context.workspaceId, {
      action: String(args.action || ""),
      ref: typeof args.ref === "string" ? args.ref : typeof args.targetRef === "string" ? args.targetRef : undefined,
      text: typeof args.text === "string" ? args.text : undefined,
      key: typeof args.key === "string" ? args.key : undefined,
      x: Number.isFinite(Number(args.x)) ? Number(args.x) : undefined,
      y: Number.isFinite(Number(args.y)) ? Number(args.y) : undefined,
      deltaX: Number.isFinite(Number(args.deltaX || args.delta_x)) ? Number(args.deltaX || args.delta_x) : undefined,
      deltaY: Number.isFinite(Number(args.deltaY || args.delta_y)) ? Number(args.deltaY || args.delta_y) : undefined,
      value: typeof args.value === "string" ? args.value : undefined,
      width: Number.isFinite(Number(args.width)) ? Number(args.width) : undefined,
      height: Number.isFinite(Number(args.height)) ? Number(args.height) : undefined,
    }, { agentApproved: context.browserExternalApproved });
    return { success: true, output: result.finding, data: result as unknown as Record<string, unknown> };
  }

  private async inspect(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const kind = String(args.kind || "console");
    const result = await this.manager.inspect(context.workspaceId, kind);
    return { success: true, output: result.output, data: result.data };
  }

  private async extract(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.extract(context.workspaceId, args.mode);
    return { success: true, output: result.output, data: result.data };
  }

  private async wait(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.wait(context.workspaceId, {
      kind: String(args.for || args.kind || "network_idle"),
      value: typeof args.value === "string" ? args.value : undefined,
      ref: typeof args.ref === "string" ? args.ref : typeof args.targetRef === "string" ? args.targetRef : undefined,
      timeoutMs: Number.isFinite(Number(args.timeoutMs || args.timeout_ms)) ? Number(args.timeoutMs || args.timeout_ms) : undefined,
      idleMs: Number.isFinite(Number(args.idleMs || args.idle_ms)) ? Number(args.idleMs || args.idle_ms) : undefined,
    });
    return {
      success: result.matched,
      output: result.matched
        ? `Matched ${result.kind}${result.value ? ` ${result.value}` : ""} after ${result.elapsedMs}ms.`
        : `Timed out waiting for ${result.kind}${result.value ? ` ${result.value}` : ""} after ${result.elapsedMs}ms.`,
      data: result as unknown as Record<string, unknown>,
    };
  }

  private async screenshot(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.screenshot(context.workspaceId, {
      mode: String(args.mode || "viewport"),
      ref: typeof args.ref === "string" ? args.ref : typeof args.targetRef === "string" ? args.targetRef : undefined,
      x: Number.isFinite(Number(args.x)) ? Number(args.x) : undefined,
      y: Number.isFinite(Number(args.y)) ? Number(args.y) : undefined,
      width: Number.isFinite(Number(args.width)) ? Number(args.width) : undefined,
      height: Number.isFinite(Number(args.height)) ? Number(args.height) : undefined,
    });
    return {
      success: true,
      output: `Saved ${result.mode} screenshot: ${result.screenshotPath}`,
      data: result as unknown as Record<string, unknown>,
    };
  }

  private async evidence(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.evidence(context.workspaceId, {
      includeScreenshot: args.includeScreenshot === true || args.include_screenshot === true,
      includeVisibleText: args.includeVisibleText !== false && args.include_visible_text !== false,
      includeConsole: args.includeConsole !== false && args.include_console !== false,
      includeNetwork: args.includeNetwork !== false && args.include_network !== false,
    });
    return { success: true, output: result.output, data: result.data };
  }

  private async search(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const query = String(args.query || "").trim();
    const result = await this.manager.search(context.workspaceId, query, {
      engine: typeof args.engine === "string" ? args.engine : undefined,
      open: args.open !== false,
      limit: Number.isFinite(Number(args.limit)) ? Number(args.limit) : undefined,
      newTab: args.newTab === true || args.new_tab === true,
      tabId: typeof args.tabId === "string" ? args.tabId : undefined,
    });
    return { success: true, output: result.output, data: result.data };
  }

  private async tab(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.tab(context.workspaceId, {
      workspaceId: context.workspaceId,
      action: normalizeTabAction(args.action),
      tabId: typeof args.tabId === "string" ? args.tabId : undefined,
      url: typeof args.url === "string" ? args.url : undefined,
    });
    return {
      success: true,
      output: result.tabs.map((tab) => `${tab.id === result.activeTabId ? "*" : "-"} ${tab.title || "New tab"} ${tab.url}`).join("\n") || "No browser tabs.",
      data: {
        tabs: result.tabs,
        activeTabId: result.activeTabId,
      },
    };
  }

  private async downloads(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.downloadAction(context.workspaceId, {
      workspaceId: context.workspaceId,
      action: normalizeDownloadAction(args.action),
      downloadId: typeof args.downloadId === "string" ? args.downloadId : undefined,
    });
    return { success: true, output: result.output, data: result.data };
  }

  private async pdf(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.pdf(context.workspaceId, args.mode || "summary", typeof args.tabId === "string" ? args.tabId : undefined);
    return { success: true, output: result.output, data: result.data };
  }

  private async formAnalyze(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.formAnalyze(context.workspaceId, typeof args.tabId === "string" ? args.tabId : undefined);
    return { success: true, output: result.output, data: result.data };
  }

  private async formFill(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.formFill(context.workspaceId, {
      workspaceId: context.workspaceId,
      tabId: typeof args.tabId === "string" ? args.tabId : undefined,
      formId: typeof args.formId === "string" ? args.formId : undefined,
      fields: normalizeFormFields(args.fields),
    }, { agentApproved: context.browserExternalApproved === true });
    return { success: true, output: result.output, data: result.data };
  }

  private async formValidate(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.formValidate(context.workspaceId, {
      workspaceId: context.workspaceId,
      tabId: typeof args.tabId === "string" ? args.tabId : undefined,
      formId: typeof args.formId === "string" ? args.formId : undefined,
    });
    return { success: true, output: result.output, data: result.data };
  }

  private async formSubmit(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.formSubmit(context.workspaceId, {
      workspaceId: context.workspaceId,
      tabId: typeof args.tabId === "string" ? args.tabId : undefined,
      formId: typeof args.formId === "string" ? args.formId : undefined,
      includeScreenshot: args.includeScreenshot === true || args.include_screenshot === true,
    }, { agentApproved: context.browserExternalApproved === true });
    return { success: true, output: result.output, data: result.data };
  }

  private async workflow(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.workflow(context.workspaceId, {
      workspaceId: context.workspaceId,
      action: normalizeWorkflowAction(args.action),
      workflowId: typeof args.workflowId === "string" ? args.workflowId : undefined,
      name: typeof args.name === "string" ? args.name : undefined,
      description: typeof args.description === "string" ? args.description : undefined,
      newTab: args.newTab === true || args.new_tab === true,
    }, { agentApproved: context.browserExternalApproved === true });
    return { success: true, output: result.output, data: result.data };
  }

  private async workflowAssert(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.workflowAssert(context.workspaceId, {
      workspaceId: context.workspaceId,
      action: normalizeWorkflowAssertAction(args.action),
      workflowId: typeof args.workflowId === "string" ? args.workflowId : undefined,
      assertionId: typeof args.assertionId === "string" ? args.assertionId : undefined,
      kind: typeof args.kind === "string" ? args.kind as never : undefined,
      value: typeof args.value === "string" ? args.value : undefined,
      ref: typeof args.ref === "string" ? args.ref : undefined,
      formId: typeof args.formId === "string" ? args.formId : undefined,
    });
    return { success: true, output: result.output, data: result.data };
  }

  private async evidenceVault(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.evidenceVault(context.workspaceId, {
      workspaceId: context.workspaceId,
      action: normalizeEvidenceVaultAction(args.action),
      evidenceId: typeof args.evidenceId === "string" ? args.evidenceId : undefined,
      workflowId: typeof args.workflowId === "string" ? args.workflowId : undefined,
      runId: typeof args.runId === "string" ? args.runId : undefined,
      includeScreenshot: args.includeScreenshot === true || args.include_screenshot === true,
    });
    return { success: true, output: result.output, data: result.data };
  }

  private async diagnose(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.diagnose(context.workspaceId, {
      workspaceId: context.workspaceId,
      runId: typeof args.runId === "string" ? args.runId : undefined,
      workflowId: typeof args.workflowId === "string" ? args.workflowId : undefined,
    });
    return { success: true, output: result.output, data: result.data };
  }

  private async trace(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.trace(context.workspaceId, {
      action: String(args.action || "click"),
      ref: typeof args.ref === "string" ? args.ref : typeof args.targetRef === "string" ? args.targetRef : undefined,
      text: typeof args.text === "string" ? args.text : undefined,
      key: typeof args.key === "string" ? args.key : undefined,
      x: Number.isFinite(Number(args.x)) ? Number(args.x) : undefined,
      y: Number.isFinite(Number(args.y)) ? Number(args.y) : undefined,
      includeScreenshot: args.includeScreenshot === true || args.include_screenshot === true,
    }, { agentApproved: context.browserExternalApproved });
    return { success: true, output: result.finding, data: result as unknown as Record<string, unknown> };
  }

  private async verify(args: Record<string, unknown>, context: ResolvedBrowserToolContext) {
    const result = await this.manager.verify(context.workspaceId, {
      reload: args.reload !== false,
    });
    return { success: result.passed, output: result.output, data: result as unknown as Record<string, unknown> };
  }
}

const parseViewport = (value: unknown) => {
  if (!value || typeof value !== "object") return undefined;
  const data = value as Record<string, unknown>;
  const width = Number(data.width);
  const height = Number(data.height);
  return Number.isFinite(width) && Number.isFinite(height)
    ? { width: Math.max(320, Math.min(2560, width)), height: Math.max(320, Math.min(2000, height)) }
    : undefined;
};

const normalizeTabAction = (value: unknown) => {
  const action = String(value || "list").trim().toLowerCase();
  if (["list", "new", "switch", "close", "close_all_except"].includes(action)) return action as "list" | "new" | "switch" | "close" | "close_all_except";
  throw new Error("browser_tab action must be list, new, switch, close, or close_all_except.");
};

const normalizeDownloadAction = (value: unknown) => {
  const action = String(value || "list").trim().toLowerCase();
  if (["list", "allow_next", "cancel", "reveal"].includes(action)) return action as "list" | "allow_next" | "cancel" | "reveal";
  throw new Error("browser_downloads action must be list, allow_next, cancel, or reveal.");
};

const normalizeWorkflowAction = (value: unknown) => {
  const action = String(value || "list").trim().toLowerCase();
  if (["start_recording", "stop_recording", "list", "get", "replay", "delete", "rename"].includes(action)) {
    return action as "start_recording" | "stop_recording" | "list" | "get" | "replay" | "delete" | "rename";
  }
  throw new Error("browser_workflow action must be start_recording, stop_recording, list, get, replay, delete, or rename.");
};

const normalizeWorkflowAssertAction = (value: unknown) => {
  const action = String(value || "list").trim().toLowerCase();
  if (["add", "list", "remove", "run"].includes(action)) return action as "add" | "list" | "remove" | "run";
  throw new Error("browser_assert action must be add, list, remove, or run.");
};

const normalizeEvidenceVaultAction = (value: unknown) => {
  const action = String(value || "list").trim().toLowerCase();
  if (["save_current", "list", "get", "prune"].includes(action)) return action as "save_current" | "list" | "get" | "prune";
  throw new Error("browser_evidence_vault action must be save_current, list, get, or prune.");
};

const normalizeFormFields = (value: unknown) => {
  if (!Array.isArray(value)) throw new Error("browser_form_fill requires fields.");
  return value.slice(0, 40).map((item) => {
    const data = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const field = {
      fieldId: typeof data.fieldId === "string" ? data.fieldId : typeof data.field_id === "string" ? data.field_id : undefined,
      name: typeof data.name === "string" ? data.name : undefined,
      label: typeof data.label === "string" ? data.label : undefined,
      value: typeof data.value === "boolean" ? data.value : String(data.value ?? ""),
    };
    if (!field.fieldId && !field.name && !field.label) throw new Error("Each form field needs fieldId, name, or label.");
    return field;
  });
};
