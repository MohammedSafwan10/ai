import { clipboard } from "electron";
import fs from "node:fs";
import path from "node:path";
import type {
  ComputerSnapshotRecord,
  ComputerUseActionInput,
  ComputerUseActionResultRecord,
  ComputerUseBackendId,
  ComputerUseStateRecord,
  ComputerUseTraceRecord,
  ToolResult,
} from "../../shared/types";
import { CuaComputerUseBackend } from "./cuaBackend";
import { computerActionHardBlockReason, redactComputerText } from "./safety";
import type { ComputerUseBackend } from "./types";
import { WindowsNativeComputerUseBackend } from "./windowsNativeBackend";

const MAX_RECENT_TRACES = 20;
const DEFAULT_BACKEND: ComputerUseBackendId = "privora_windows_native";

export class ComputerUseManager {
  private backends = new Map<ComputerUseBackendId, ComputerUseBackend>();
  private state: ComputerUseStateRecord = {
    enabled: false,
    backend: DEFAULT_BACKEND,
    active: false,
    recentTraces: [],
    updatedAt: Date.now(),
  };

  constructor(
    private userDataPath: string,
    private onState?: (state: ComputerUseStateRecord) => void,
  ) {
    this.backends.set("privora_windows_native", new WindowsNativeComputerUseBackend());
    this.backends.set("cua_driver", new CuaComputerUseBackend());
  }

  setEnabled(enabled: boolean) {
    this.state = { ...this.state, enabled, updatedAt: Date.now() };
    this.emit();
  }

  getState() {
    return this.state;
  }

  async capabilities(input: { backend?: ComputerUseBackendId } = {}, signal?: AbortSignal): Promise<ToolResult> {
    const backend = this.resolveBackend(input.backend);
    const capabilities = await backend.capabilities(signal);
    return {
      success: true,
      output: [
        `Computer Use backend: ${capabilities.backend}`,
        `Available: ${capabilities.available ? "yes" : "no"}`,
        `Capabilities: ${capabilities.capabilities.join(", ") || "none"}`,
        `Limitations: ${capabilities.limitations.join(" ")}`,
      ].join("\n"),
      data: { capabilities, enabled: this.state.enabled },
    };
  }

  async listWindows(input: { backend?: ComputerUseBackendId } = {}, signal?: AbortSignal): Promise<ToolResult> {
    const backend = this.resolveBackend(input.backend);
    const windows = await backend.listWindows(signal);
    const activeWindow = windows.find((item) => item.focused) || windows[0];
    this.updateState({ activeWindow });
    return {
      success: true,
      output: windows.map((window) => `${window.focused ? "*" : " "} ${window.title || "(untitled)"} - ${window.processName} [${window.id}]`).join("\n") || "No visible top-level windows found.",
      data: { backend: backend.id, windows },
    };
  }

  async findApps(input: { backend?: ComputerUseBackendId; query?: string; limit?: number } = {}, signal?: AbortSignal): Promise<ToolResult> {
    const backend = this.resolveBackend(input.backend);
    const apps = await backend.findApps({ query: input.query, limit: input.limit }, signal);
    return {
      success: true,
      output: apps.map((app) => [
        app.name,
        `[${app.source}]`,
        app.executablePath || app.shortcutPath || app.installLocation || "",
      ].filter(Boolean).join(" ")).join("\n") || "No installed app candidates found.",
      data: { backend: backend.id, apps },
    };
  }

  async focusWindow(input: { backend?: ComputerUseBackendId; windowId?: string }, signal?: AbortSignal): Promise<ToolResult> {
    if (!input.windowId) return failure("Window id is required.", "stale_target");
    const backend = this.resolveBackend(input.backend);
    const result = await backend.focusWindow(String(input.windowId), signal);
    if (result.success && !result.window) {
      const windows = await backend.listWindows(signal).catch(() => []);
      result.window = windows.find((window) => window.id === input.windowId) || windows.find((window) => window.focused);
    }
    return this.wrapAction(result);
  }

  async snapshot(input: { backend?: ComputerUseBackendId; windowId?: string; depth?: number; includeBoxes?: boolean } = {}, signal?: AbortSignal): Promise<ToolResult> {
    const snapshot = await this.resolveBackend(input.backend).snapshot(input, signal);
    this.updateState({ activeWindow: snapshot.window, lastFinding: snapshot.diagnosis?.message || `Captured ${snapshot.nodes.length} root node(s).` });
    return {
      success: !snapshot.diagnosis || snapshot.diagnosis.kind === "ok",
      output: formatSnapshot(snapshot),
      data: { snapshot },
      error: snapshot.diagnosis && snapshot.diagnosis.kind !== "ok" ? snapshot.diagnosis.message : undefined,
    };
  }

  async inspect(input: { backend?: ComputerUseBackendId; kind?: string; windowId?: string }, signal?: AbortSignal): Promise<ToolResult> {
    const kind = String(input.kind || "active_window").toLowerCase();
    if (kind === "windows") return this.listWindows(input, signal);
    if (kind === "capabilities") return this.capabilities(input, signal);
    if (kind === "screenshot") return this.screenshot({ ...input, mode: "window" }, signal);
    return this.snapshot({ ...input, depth: kind === "uia" ? 4 : 2 }, signal);
  }

  async act(input: ComputerUseActionInput, signal?: AbortSignal): Promise<ToolResult> {
    if (!this.state.enabled) return failure("Computer Use mode is off. Turn it on in the composer tools menu before controlling desktop apps.", "blocked_by_policy");
    const lockedInput = this.targetLockedInput(input);
    if (requiresTargetWindow(lockedInput) && !lockedInput.windowId) {
      return failure("Computer Use needs a target window before using foreground input. Focus, wait for, or snapshot the intended app first.", "stale_target");
    }
    const hardBlock = computerActionHardBlockReason(lockedInput);
    if (hardBlock) {
      const result: ComputerUseActionResultRecord = {
        backend: lockedInput.backend || this.state.backend,
        action: lockedInput.action,
        success: false,
        finding: hardBlock.message,
        diagnosis: hardBlock,
        startedAt: Date.now(),
        endedAt: Date.now(),
      };
      this.updateState({ lastAction: String(input.action || ""), lastFinding: hardBlock.message });
      return this.wrapAction(result);
    }
    this.updateState({ active: true, lastAction: String(lockedInput.action || "") });
    try {
      const result = await this.resolveBackend(lockedInput.backend).act(lockedInput, signal);
      this.updateState({ active: false, lastFinding: result.finding });
      return this.wrapAction(result);
    } finally {
      this.updateState({ active: false });
    }
  }

  async trace(input: ComputerUseActionInput, workspaceId: string | undefined, signal?: AbortSignal): Promise<ToolResult> {
    if (!this.state.enabled) return failure("Computer Use mode is off. Turn it on in the composer tools menu before tracing desktop apps.", "blocked_by_policy");
    const startedAt = Date.now();
    const traceId = crypto.randomUUID();
    const lockedInput = this.targetLockedInput(input);
    const before = await this.resolveBackend(lockedInput.backend).snapshot({ windowId: lockedInput.windowId, depth: 2 }, signal).catch(() => undefined);
    const actionResult = await this.act(lockedInput, signal);
    const after = await this.resolveBackend(lockedInput.backend).snapshot({ windowId: lockedInput.windowId, depth: 2 }, signal).catch(() => undefined);
    const artifactPaths: string[] = [];
    if (lockedInput.includeScreenshot === true) {
      const screenshot = await this.captureScreenshotArtifact(workspaceId, lockedInput.backend, lockedInput.windowId, signal).catch(() => null);
      if (screenshot?.data?.artifactPath) artifactPaths.push(String(screenshot.data.artifactPath));
    }
    const resultData = actionResult.data?.result as ComputerUseActionResultRecord | undefined;
    const trace: ComputerUseTraceRecord = {
      id: traceId,
      backend: lockedInput.backend || this.state.backend,
      action: lockedInput.action,
      before,
      after,
      result: resultData || {
        backend: lockedInput.backend || this.state.backend,
        action: lockedInput.action,
        success: actionResult.success,
        finding: actionResult.output || actionResult.error || "Action completed.",
        startedAt,
        endedAt: Date.now(),
      },
      finding: actionResult.output || actionResult.error || "Action completed.",
      diagnosis: resultData?.diagnosis,
      artifactPaths,
      startedAt,
      endedAt: Date.now(),
    };
    this.addTrace(trace);
    return {
      success: actionResult.success,
      output: trace.finding,
      error: actionResult.error,
      data: { trace },
    };
  }

  async wait(input: { backend?: ComputerUseBackendId; for?: string; value?: string; windowId?: string; timeoutMs?: number }, signal?: AbortSignal): Promise<ToolResult> {
    const kind = String(input.for || "text").toLowerCase();
    const expected = String(input.value || "");
    const timeoutMs = Math.max(250, Math.min(30_000, Number(input.timeoutMs) || 5_000));
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (signal?.aborted) throw new Error("Computer Use wait was stopped.");
      const backend = this.resolveBackend(input.backend);
      const windows = kind === "window_title" || kind === "focused_window"
        ? await backend.listWindows(signal)
        : [];
      const matchingWindow = windows.find((window) => window.title.toLowerCase().includes(expected.toLowerCase()));
      if (kind === "window_title" && matchingWindow) {
        this.updateState({ activeWindow: matchingWindow });
        return { success: true, output: `Matched window title "${expected}".`, data: { elapsedMs: Date.now() - started, window: matchingWindow } };
      }
      const focusedWindow = windows.find((window) => window.focused && (!expected || window.title.toLowerCase().includes(expected.toLowerCase())));
      if (kind === "focused_window" && focusedWindow) {
        this.updateState({ activeWindow: focusedWindow });
        return { success: true, output: "Focused window matched.", data: { elapsedMs: Date.now() - started, window: focusedWindow } };
      }
      if (kind === "text") {
        const snapshot = await this.resolveBackend(input.backend).snapshot({ windowId: input.windowId, depth: 3 }, signal).catch(() => null);
        if (snapshot?.text.toLowerCase().includes(expected.toLowerCase())) {
          return { success: true, output: `Matched text "${expected}".`, data: { elapsedMs: Date.now() - started, snapshot } };
        }
      }
      await delay(180);
    }
    return failure(`Timed out waiting for ${kind}${expected ? ` "${expected}"` : ""}.`, "timeout");
  }

  async verify(input: { backend?: ComputerUseBackendId; text?: string; windowTitle?: string; windowId?: string }, signal?: AbortSignal): Promise<ToolResult> {
    if (input.windowTitle) return this.wait({ backend: input.backend, for: "window_title", value: input.windowTitle, windowId: input.windowId, timeoutMs: 1_000 }, signal);
    if (input.text) return this.wait({ backend: input.backend, for: "text", value: input.text, windowId: input.windowId, timeoutMs: 1_000 }, signal);
    const snapshot = await this.resolveBackend(input.backend).snapshot({ windowId: input.windowId, depth: 2 }, signal);
    return {
      success: !snapshot.diagnosis || snapshot.diagnosis.kind === "ok",
      output: snapshot.diagnosis?.message || "Current desktop window is inspectable.",
      data: { snapshot },
    };
  }

  async screenshot(input: { backend?: ComputerUseBackendId; mode?: string; windowId?: string; x?: number; y?: number; width?: number; height?: number }, signal?: AbortSignal): Promise<ToolResult> {
    return this.captureScreenshotArtifact(undefined, input.backend, input.windowId, signal, input);
  }

  async openApp(input: { backend?: ComputerUseBackendId; app?: string; path?: string; args?: unknown }, signal?: AbortSignal): Promise<ToolResult> {
    if (!this.state.enabled) return failure("Computer Use mode is off. Turn it on in the composer tools menu before opening desktop apps.", "blocked_by_policy");
    const args = Array.isArray(input.args) ? input.args.map((item) => String(item)) : [];
    return this.wrapAction(await this.resolveBackend(input.backend).openApp({ app: input.app, path: input.path, args }, signal));
  }

  async clipboardAction(input: { action?: string; text?: string }): Promise<ToolResult> {
    if (!this.state.enabled) return failure("Computer Use mode is off. Turn it on in the composer tools menu before using the desktop clipboard.", "blocked_by_policy");
    const action = String(input.action || "get_text").toLowerCase();
    if (action === "get_text") {
      const text = redactComputerText(clipboard.readText(), 2_000);
      return { success: true, output: text || "(clipboard is empty)", data: { text, redacted: true } };
    }
    if (action === "set_text") {
      const hardBlock = computerActionHardBlockReason({ action: "type", text: input.text || "" });
      if (hardBlock) return failure(hardBlock.message, hardBlock.kind);
      clipboard.writeText(String(input.text || ""));
      return { success: true, output: "Clipboard text updated.", data: { bytes: Buffer.byteLength(String(input.text || ""), "utf8") } };
    }
    if (action === "clear") {
      clipboard.clear();
      return { success: true, output: "Clipboard cleared." };
    }
    return failure(`Unknown clipboard action ${action}.`, "blocked_by_policy");
  }

  async stop(): Promise<ToolResult> {
    this.backends.forEach((backend) => backend.stop());
    this.updateState({ active: false, lastFinding: "Computer Use stopped." });
    return { success: true, output: "Computer Use stopped." };
  }

  private resolveBackend(id?: ComputerUseBackendId) {
    const backendId = id || this.state.backend;
    const backend = this.backends.get(backendId);
    if (!backend) throw new Error(`Unknown Computer Use backend ${backendId}.`);
    return backend;
  }

  private wrapAction(result: ComputerUseActionResultRecord): ToolResult {
    this.updateState({
      lastAction: String(result.action || ""),
      lastFinding: result.finding,
      ...(result.window ? { activeWindow: result.window } : {}),
    });
    return {
      success: result.success,
      output: result.finding,
      error: result.success ? undefined : result.diagnosis?.message || result.finding,
      data: { result },
    };
  }

  private targetLockedInput(input: ComputerUseActionInput): ComputerUseActionInput {
    if (input.windowId || !requiresTargetWindow(input)) return input;
    return { ...input, windowId: this.state.activeWindow?.id };
  }

  private async captureScreenshotArtifact(
    workspaceId: string | undefined,
    backendId: ComputerUseBackendId | undefined,
    windowId: string | undefined,
    signal: AbortSignal | undefined,
    bounds: { x?: number; y?: number; width?: number; height?: number } = {},
  ): Promise<ToolResult> {
    const root = path.join(this.userDataPath, "computer-artifacts", safePathSegment(workspaceId || "global"));
    fs.mkdirSync(root, { recursive: true });
    const artifactPath = path.join(root, `${Date.now()}-${crypto.randomUUID()}.png`);
    const result = await this.resolveBackend(backendId).screenshot({ ...bounds, windowId, artifactPath }, signal);
    this.updateState({ lastFinding: result.finding });
    return {
      success: result.success,
      output: result.finding,
      error: result.success ? undefined : result.diagnosis?.message,
      data: { result, artifactPath },
    };
  }

  private addTrace(trace: ComputerUseTraceRecord) {
    this.state = {
      ...this.state,
      recentTraces: [trace, ...this.state.recentTraces].slice(0, MAX_RECENT_TRACES),
      lastAction: String(trace.action),
      lastFinding: trace.finding,
      updatedAt: Date.now(),
    };
    this.emit();
  }

  private updateState(patch: Partial<ComputerUseStateRecord>) {
    this.state = { ...this.state, ...patch, updatedAt: Date.now() };
    this.emit();
  }

  private emit() {
    this.onState?.(this.state);
  }
}

const formatSnapshot = (snapshot: ComputerSnapshotRecord) => {
  const lines = [
    snapshot.window ? `Window: ${snapshot.window.title || "(untitled)"} - ${snapshot.window.processName} [${snapshot.window.id}]` : "Window: (unknown)",
    snapshot.diagnosis ? `Diagnosis: ${snapshot.diagnosis.message}` : `Mode: ${snapshot.mode}`,
    snapshot.text || snapshot.nodes.map((node) => `${node.ref} ${node.role} ${node.name}`.trim()).join("\n"),
  ].filter(Boolean);
  return lines.join("\n").slice(0, 12_000);
};

const failure = (message: string, kind: string): ToolResult => ({
  success: false,
  error: message,
  output: message,
  data: { diagnosis: { kind, message } },
});

const requiresTargetWindow = (input: ComputerUseActionInput) =>
  [
    "click",
    "double_click",
    "focus",
    "invoke",
    "select",
    "set_value",
    "type",
    "press",
    "scroll",
    "drag",
  ].includes(String(input.action || "").toLowerCase());

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const safePathSegment = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "global";
