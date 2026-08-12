import type { DesktopToolCall, ToolResult } from "../../shared/types";
import type { ComputerUseManager } from "./ComputerUseManager";

export interface ComputerToolContext {
  workspaceId?: string;
  signal: AbortSignal;
}

export class ComputerUseToolExecutor {
  constructor(private manager: ComputerUseManager) {}

  async execute(call: DesktopToolCall, context: ComputerToolContext): Promise<ToolResult> {
    const args = call.arguments;
    switch (call.name) {
      case "computer_capabilities":
        return this.manager.capabilities({ backend: readBackend(args) }, context.signal);
      case "computer_list_windows":
        return this.manager.listWindows({ backend: readBackend(args) }, context.signal);
      case "computer_find_apps":
        return this.manager.findApps({
          backend: readBackend(args),
          query: readString(args, "query", "app", "name"),
          limit: readNumber(args, "limit"),
        }, context.signal);
      case "computer_focus_window":
        return this.manager.focusWindow({ backend: readBackend(args), windowId: readString(args, "windowId", "window_id") }, context.signal);
      case "computer_snapshot":
        return this.manager.snapshot({
          backend: readBackend(args),
          windowId: readString(args, "windowId", "window_id"),
          depth: readNumber(args, "depth"),
          includeBoxes: args.includeBoxes === true || args.include_boxes === true,
          scope: readSnapshotScope(args),
          role: readString(args, "role"),
          editableOnly: args.editableOnly === true || args.editable_only === true,
        }, context.signal);
      case "computer_inspect":
        return this.manager.inspect({
          backend: readBackend(args),
          kind: readString(args, "kind"),
          windowId: readString(args, "windowId", "window_id"),
        }, context.signal);
      case "computer_act":
        return this.manager.act({
          backend: readBackend(args),
          windowId: readString(args, "windowId", "window_id"),
          action: String(args.action || ""),
          interactionMode: readInteractionMode(args),
          ref: readString(args, "ref"),
          targetRef: readString(args, "targetRef", "target_ref"),
          text: readString(args, "text"),
          key: readString(args, "key"),
          value: readString(args, "value"),
          x: readNumber(args, "x"),
          y: readNumber(args, "y"),
          deltaX: readNumber(args, "deltaX", "delta_x"),
          deltaY: readNumber(args, "deltaY", "delta_y"),
          durationMs: readNumber(args, "durationMs", "duration_ms"),
          includeScreenshot: args.includeScreenshot === true || args.include_screenshot === true,
          verifyValue: args.verifyValue !== false && args.verify_value !== false,
        }, context.signal);
      case "computer_wait":
        return this.manager.wait({
          backend: readBackend(args),
          for: readString(args, "for", "kind"),
          value: readString(args, "value", "text", "windowTitle", "window_title"),
          windowId: readString(args, "windowId", "window_id"),
          timeoutMs: readNumber(args, "timeoutMs", "timeout_ms"),
          role: readString(args, "role"),
          ref: readString(args, "ref"),
          count: readNumber(args, "count"),
          exact: args.exact === true,
        }, context.signal);
      case "computer_trace":
        return this.manager.trace({
          backend: readBackend(args),
          windowId: readString(args, "windowId", "window_id"),
          action: String(args.action || ""),
          interactionMode: readInteractionMode(args),
          ref: readString(args, "ref"),
          targetRef: readString(args, "targetRef", "target_ref"),
          text: readString(args, "text"),
          key: readString(args, "key"),
          value: readString(args, "value"),
          x: readNumber(args, "x"),
          y: readNumber(args, "y"),
          deltaX: readNumber(args, "deltaX", "delta_x"),
          deltaY: readNumber(args, "deltaY", "delta_y"),
          includeScreenshot: args.includeScreenshot === true || args.include_screenshot === true,
          verifyValue: args.verifyValue !== false && args.verify_value !== false,
        }, context.workspaceId, context.signal);
      case "computer_verify":
        return this.manager.verify({
          backend: readBackend(args),
          text: readString(args, "text", "expectedText", "expected_text"),
          windowTitle: readString(args, "windowTitle", "window_title"),
          windowId: readString(args, "windowId", "window_id"),
        }, context.signal);
      case "computer_screenshot":
        return this.manager.screenshot({
          backend: readBackend(args),
          mode: readString(args, "mode"),
          windowId: readString(args, "windowId", "window_id"),
          x: readNumber(args, "x"),
          y: readNumber(args, "y"),
          width: readNumber(args, "width"),
          height: readNumber(args, "height"),
        }, context.signal);
      case "computer_open_app":
        return this.manager.openApp({
          backend: readBackend(args),
          app: readString(args, "app"),
          path: readString(args, "path"),
          args: Array.isArray(args.args) ? args.args : undefined,
          interactionMode: readInteractionMode(args),
        }, context.signal);
      case "computer_clipboard":
        return this.manager.clipboardAction({
          action: readString(args, "action"),
          text: readString(args, "text"),
        });
      case "computer_stop":
        return this.manager.stop();
      default:
        return { success: false, error: `Unknown Computer Use tool ${call.name}` };
    }
  }
}

const readString = (args: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    if (typeof args[key] === "string") return args[key] as string;
  }
  return undefined;
};

const readNumber = (args: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
};

const readBackend = (args: Record<string, unknown>) => {
  const backend = readString(args, "backend");
  return backend === "privora_windows_native" || backend === "cua_driver" ? backend : undefined;
};

const readInteractionMode = (args: Record<string, unknown>) => {
  const mode = readString(args, "interactionMode", "interaction_mode");
  return mode === "allow_foreground" ? mode : "background_only";
};

const readSnapshotScope = (args: Record<string, unknown>) => {
  const scope = readString(args, "scope");
  return scope === "active_document" || scope === "matching_controls" ? scope : "window";
};
