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
    switch (call.name) {
      case "browser_open":
        return this.open(args, resolvedContext);
      case "browser_snapshot":
        return this.snapshot(args, resolvedContext);
      case "browser_act":
        return this.act(args, resolvedContext);
      case "browser_inspect":
        return this.inspect(args, resolvedContext);
      case "browser_extract":
        return this.extract(args, resolvedContext);
      case "browser_wait":
        return this.wait(args, resolvedContext);
      case "browser_screenshot":
        return this.screenshot(args, resolvedContext);
      case "browser_evidence":
        return this.evidence(args, resolvedContext);
      case "browser_search":
        return this.search(args, resolvedContext);
      case "browser_tab":
        return this.tab(args, resolvedContext);
      case "browser_downloads":
        return this.downloads(args, resolvedContext);
      case "browser_pdf":
        return this.pdf(args, resolvedContext);
      case "browser_form_analyze":
        return this.formAnalyze(args, resolvedContext);
      case "browser_form_fill":
        return this.formFill(args, resolvedContext);
      case "browser_form_validate":
        return this.formValidate(args, resolvedContext);
      case "browser_form_submit":
        return this.formSubmit(args, resolvedContext);
      case "browser_trace":
        return this.trace(args, resolvedContext);
      case "browser_verify":
        return this.verify(args, resolvedContext);
      default:
        return { success: false, error: `Unknown browser tool ${call.name}` };
    }
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
      data: result as unknown as Record<string, unknown>,
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
      data: result as unknown as Record<string, unknown>,
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
