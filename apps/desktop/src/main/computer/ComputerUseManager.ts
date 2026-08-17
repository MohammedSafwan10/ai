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
    if (!this.state.enabled) return computerUseDisabled();
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
    if (!this.state.enabled) return computerUseDisabled();
    const backend = this.resolveBackend(input.backend);
    const apps = await backend.findApps({ query: input.query, limit: input.limit }, signal);
    return {
      success: true,
      output: apps.map((app) => [
        app.name,
        `[${app.source}]`,
        app.executablePath || app.shortcutPath || app.installLocation || "",
        app.verified ? `[verified:${app.verificationMethod || "filesystem"}]` : "[unverified]",
      ].filter(Boolean).join(" ")).join("\n") || "No installed app candidates found.",
      data: { backend: backend.id, apps },
    };
  }

  async focusWindow(input: { backend?: ComputerUseBackendId; windowId?: string }, signal?: AbortSignal): Promise<ToolResult> {
    if (!this.state.enabled) return computerUseDisabled();
    if (!input.windowId) return failure("Window id is required.", "stale_target");
    const backend = this.resolveBackend(input.backend);
    const result = await backend.focusWindow(String(input.windowId), signal);
    if (result.success && !result.window) {
      const windows = await backend.listWindows(signal).catch(() => []);
      result.window = windows.find((window) => window.id === input.windowId) || windows.find((window) => window.focused);
    }
    return this.wrapAction(result);
  }

  async snapshot(input: { backend?: ComputerUseBackendId; windowId?: string; depth?: number; includeBoxes?: boolean; scope?: "window" | "active_document" | "matching_controls"; role?: string; editableOnly?: boolean } = {}, signal?: AbortSignal): Promise<ToolResult> {
    if (!this.state.enabled) return computerUseDisabled();
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
    if (kind === "capabilities") return this.capabilities(input, signal);
    if (!this.state.enabled) return computerUseDisabled();
    if (kind === "windows") return this.listWindows(input, signal);
    if (kind === "screenshot") return this.screenshot({ ...input, mode: "window" }, signal);
    return this.snapshot({ ...input, depth: kind === "uia" ? 4 : 2 }, signal);
  }

  async act(input: ComputerUseActionInput, signal?: AbortSignal): Promise<ToolResult> {
    if (!this.state.enabled) return failure("Computer Use mode is off. Turn it on in the composer tools menu before controlling desktop apps.", "blocked_by_policy");
    const lockedInput = this.targetLockedInput(input);
    if (requiresTargetWindow(lockedInput) && !lockedInput.windowId) {
      return failure("Computer Use needs a target window. List, wait for, or snapshot the intended app first.", "stale_target");
    }
    const target = await this.resolveActionTarget(lockedInput, signal);
    if (requiresTrustedTarget(lockedInput) && !target) {
      const ref = String(lockedInput.ref || lockedInput.targetRef || "");
      return this.wrapAction({
        backend: lockedInput.backend || this.state.backend,
        action: lockedInput.action,
        success: false,
        finding: "The UI element reference is stale and no trusted identity is available for safe remapping.",
        diagnosis: { kind: "stale_target", message: "The UI element reference is stale and no trusted identity is available for safe remapping.", capability: "uia_direct" },
        inputCapability: "uia_direct",
        globalInputUsed: false,
        referenceStatus: "stale",
        oldRef: ref || undefined,
        referenceReason: "The ref was absent from the fresh tree and no cached semantic identity remained.",
        startedAt: Date.now(),
        endedAt: Date.now(),
      });
    }
    const hardBlock = computerActionHardBlockReason(lockedInput, target);
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
      const backend = this.resolveBackend(lockedInput.backend);
      const result = await backend.act(lockedInput, signal);
      const isVerifiedMutation = ["type", "set_value"].includes(String(lockedInput.action || "").toLowerCase())
        && lockedInput.verifyValue !== false
        // A UIA mutation may complete before a later focus-restoration check
        // fails. Independently verify that mutation instead of preserving an
        // optimistic in-process ValuePattern result.
        && (result.success || result.verification?.verified === true);
      const expected = String(lockedInput.text ?? lockedInput.value ?? "");
      const canVerifyFromPublicSnapshot = expected.length <= 700 && redactComputerText(expected, 800) === expected;
      if (isVerifiedMutation && canVerifyFromPublicSnapshot) {
        // Re-read every editable control so verification still targets the mutated
        // document when the user changes tabs while a background action is running.
        const snapshot = await backend.snapshot({ windowId: lockedInput.windowId, depth: 5, scope: "matching_controls", editableOnly: true }, signal).catch(() => null);
        const nodes = snapshot ? flattenSnapshotNodes(snapshot.nodes) : [];
        const preferredRef = result.newRef || String(lockedInput.ref || lockedInput.targetRef || "");
        const observedNode = nodes.find((node) => node.ref === preferredRef) || nodes.find((node) => node.ref === snapshot?.activeDocumentRef) || nodes[0];
        const observed = String(observedNode?.value || "");
        const verified = normalizeExactComputerValue(observed) === normalizeExactComputerValue(expected);
        result.verification = { verified, requestedValue: expected, observedValue: observed };
        if (!verified) {
          result.success = false;
          result.finding = "The control accepted the mutation, but an independent fresh snapshot did not match the requested value.";
          result.diagnosis = { kind: "validation_failed", message: result.finding, capability: result.inputCapability || "uia_direct" };
        }
      }
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

  async wait(input: { backend?: ComputerUseBackendId; for?: string; value?: string; windowId?: string; timeoutMs?: number; role?: string; ref?: string; count?: number; exact?: boolean }, signal?: AbortSignal): Promise<ToolResult> {
    if (!this.state.enabled) return computerUseDisabled();
    const kind = String(input.for || "text").toLowerCase();
    const expected = String(input.value || "");
    const timeoutMs = Math.max(250, Math.min(30_000, Number(input.timeoutMs) || 5_000));
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (signal?.aborted) throw new Error("Computer Use wait was stopped.");
      const backend = this.resolveBackend(input.backend);
      if (kind === "window_title" && input.windowId) {
        const targetSnapshot = await backend.snapshot({ windowId: input.windowId, depth: 4 }, signal).catch(() => null);
        const semanticTitle = [targetSnapshot?.window?.title, targetSnapshot?.text].filter(Boolean).join("\n");
        if (semanticTitle.toLowerCase().includes(expected.toLowerCase())) {
          if (targetSnapshot?.window) this.updateState({ activeWindow: targetSnapshot.window });
          return { success: true, output: `Matched target window title "${expected}" from a fresh semantic snapshot.`, data: { elapsedMs: Date.now() - started, snapshot: targetSnapshot } };
        }
      }
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
      if (["editable_text", "element", "active_tab", "tab_count"].includes(kind)) {
        const snapshot = await backend.snapshot({
          windowId: input.windowId,
          depth: 5,
          scope: kind === "editable_text" ? "active_document" : "window",
          role: kind === "element" ? input.role : undefined,
          editableOnly: kind === "editable_text",
        }, signal).catch(() => null);
        const match = snapshot ? semanticWaitMatch(snapshot, { kind, expected, role: input.role, ref: input.ref, count: input.count, exact: input.exact === true }) : null;
        if (match?.matched) {
          return { success: true, output: match.message, data: { elapsedMs: Date.now() - started, snapshot, match } };
        }
      }
      await delay(180);
    }
    return failure(`Timed out waiting for ${kind}${expected ? ` "${expected}"` : ""}.`, "timeout");
  }

  async verify(input: { backend?: ComputerUseBackendId; text?: string; windowTitle?: string; windowId?: string }, signal?: AbortSignal): Promise<ToolResult> {
    if (!this.state.enabled) return computerUseDisabled();
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
    if (!this.state.enabled) return computerUseDisabled();
    return this.captureScreenshotArtifact(undefined, input.backend, input.windowId, signal, input);
  }

  async openApp(input: { backend?: ComputerUseBackendId; app?: string; path?: string; args?: unknown; interactionMode?: "background_only" | "allow_foreground" }, signal?: AbortSignal): Promise<ToolResult> {
    if (!this.state.enabled) return failure("Computer Use mode is off. Turn it on in the composer tools menu before opening desktop apps.", "blocked_by_policy");
    const args = Array.isArray(input.args) ? input.args.map((item) => String(item)) : [];
    return this.wrapAction(await this.resolveBackend(input.backend).openApp({ app: input.app, path: input.path, args, interactionMode: input.interactionMode || "background_only" }, signal));
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
    const evidence = {
      inputCapability: result.inputCapability,
      globalInputUsed: result.globalInputUsed,
      foregroundBefore: result.foregroundBefore,
      foregroundAfter: result.foregroundAfter,
      focusRestored: result.focusRestored,
      referenceStatus: result.referenceStatus,
      oldRef: result.oldRef,
      newRef: result.newRef,
      referenceReason: result.referenceReason,
      requestedValue: result.verification?.requestedValue,
      observedValue: result.verification?.observedValue,
      verified: result.verification?.verified,
    };
    return {
      success: result.success,
      output: result.finding,
      error: result.success ? undefined : result.diagnosis?.message || result.finding,
      // Keep compact evidence beside the complete action record so model
      // context can inspect the outcome without expanding the full payload.
      data: { result, diagnosis: result.diagnosis, ...evidence },
    };
  }

  private targetLockedInput(input: ComputerUseActionInput): ComputerUseActionInput {
    if (input.windowId || !requiresTargetWindow(input)) return input;
    return { ...input, windowId: this.state.activeWindow?.id };
  }

  private async resolveActionTarget(input: ComputerUseActionInput, signal?: AbortSignal) {
    const ref = String(input.ref || input.targetRef || "");
    if (!ref) return undefined;
    const backend = this.resolveBackend(input.backend);
    const cached = backend.resolveCachedNode?.(ref, input.windowId);
    const snapshot = await backend.snapshot({ windowId: input.windowId, depth: 5 }, signal);
    return findSnapshotNode(snapshot.nodes, ref) || cached;
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

const computerUseDisabled = () =>
  failure("Computer Use mode is off. Turn it on in the composer tools menu before inspecting or controlling desktop apps.", "blocked_by_policy");

const findSnapshotNode = (nodes: ComputerSnapshotRecord["nodes"], ref: string): ComputerSnapshotRecord["nodes"][number] | undefined => {
  for (const node of nodes) {
    if (node.ref === ref) return node;
    const child = findSnapshotNode(node.children || [], ref);
    if (child) return child;
  }
  return undefined;
};

const semanticWaitMatch = (
  snapshot: ComputerSnapshotRecord,
  input: { kind: string; expected: string; role?: string; ref?: string; count?: number; exact: boolean },
) => {
  const nodes = flattenSnapshotNodes(snapshot.nodes);
  const normalizedExpected = normalizeComputerValue(input.expected);
  const matchesText = (value: string | undefined) => {
    const normalized = normalizeComputerValue(value || "");
    return input.exact ? normalized === normalizedExpected : normalized.includes(normalizedExpected);
  };
  if (input.kind === "active_tab") {
    const title = snapshot.activeTab?.title || "";
    return { matched: Boolean(title && matchesText(title)), message: `Active tab matched "${input.expected}".` };
  }
  if (input.kind === "tab_count") {
    const count = nodes.filter((node) => node.role.replace(/^ControlType\./i, "").toLowerCase() === "tabitem").length;
    const expectedCount = Math.max(0, Number(input.count ?? input.expected) || 0);
    return { matched: input.exact ? count === expectedCount : count >= expectedCount, message: `Observed ${count} tab(s); required ${input.exact ? "exactly" : "at least"} ${expectedCount}.`, count };
  }
  const candidates = nodes.filter((node) => {
    if (input.ref && node.ref !== input.ref) return false;
    if (input.role && node.role.replace(/^ControlType\./i, "").toLowerCase() !== input.role.replace(/^ControlType\./i, "").toLowerCase()) return false;
    if (input.kind === "editable_text" && !["document", "edit"].includes(node.role.replace(/^ControlType\./i, "").toLowerCase())) return false;
    return true;
  });
  const node = candidates.find((candidate) => matchesText(candidate.value) || matchesText(candidate.name));
  return { matched: Boolean(node), message: node ? `Matched ${node.role} ${node.ref}.` : `No matching ${input.kind} evidence yet.`, ref: node?.ref };
};

const flattenSnapshotNodes = (nodes: ComputerSnapshotRecord["nodes"]): ComputerSnapshotRecord["nodes"] =>
  nodes.flatMap((node) => [node, ...flattenSnapshotNodes(node.children || [])]);

const normalizeComputerValue = (value: string) => value.replace(/\r\n/g, "\n").trim().toLowerCase();
const normalizeExactComputerValue = (value: string) => value.replace(/\r\n/g, "\n");

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

const requiresTrustedTarget = (input: ComputerUseActionInput) =>
  [
    "click",
    "double_click",
    "focus",
    "invoke",
    "select",
    "set_value",
    "type",
    "drag",
  ].includes(String(input.action || "").toLowerCase()) || (
    String(input.action || "").toLowerCase() === "press" && input.interactionMode !== "allow_foreground"
  );

const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const safePathSegment = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "global";
