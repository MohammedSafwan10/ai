import type { WebContents } from "electron";

export interface BrowserSnapshotOptions {
  depth?: number;
  includeBoxes?: boolean;
  targetRef?: string;
}

export class BrowserCdpClient {
  private attached = false;
  private accessibilityEnabled = false;
  private networkEnabled = false;
  private runtimeEnabled = false;

  constructor(private contents: WebContents) {}

  isAttached() {
    return this.attached && this.contents.debugger.isAttached();
  }

  attach() {
    if (this.contents.isDestroyed()) throw new Error("Browser page is not available.");
    if (!this.contents.debugger.isAttached()) {
      this.contents.debugger.attach("1.3");
      this.accessibilityEnabled = false;
      this.networkEnabled = false;
      this.runtimeEnabled = false;
    }
    this.attached = true;
  }

  detach() {
    if (!this.contents.isDestroyed() && this.contents.debugger.isAttached()) {
      this.contents.debugger.detach();
    }
    this.attached = false;
    this.accessibilityEnabled = false;
    this.networkEnabled = false;
    this.runtimeEnabled = false;
  }

  async enableNetwork() {
    this.attach();
    if (this.networkEnabled) return;
    await this.send("Network.enable");
    this.networkEnabled = true;
  }

  async enableRuntime() {
    this.attach();
    if (this.runtimeEnabled) return;
    await this.send("Runtime.enable");
    this.runtimeEnabled = true;
  }

  async snapshot(options: BrowserSnapshotOptions = {}) {
    this.attach();
    if (!this.accessibilityEnabled) {
      await this.send("Accessibility.enable");
      this.accessibilityEnabled = true;
    }
    const result = await this.send("Accessibility.getFullAXTree", {});
    const nodes = Array.isArray((result as { nodes?: unknown[] }).nodes)
      ? (result as { nodes: unknown[] }).nodes
      : [];
    return formatAccessibilitySnapshot(nodes, options);
  }

  async domSnapshot() {
    this.attach();
    const result = await this.send("DOMSnapshot.captureSnapshot", {
      computedStyles: ["display", "visibility", "opacity", "pointer-events", "z-index", "position"],
      includeDOMRects: true,
      includePaintOrder: true,
    });
    return JSON.stringify(result).slice(0, 20_000);
  }

  async evaluate<T = unknown>(expression: string) {
    this.attach();
    await this.enableRuntime();
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    }) as { result?: { value?: T }; exceptionDetails?: unknown };
    if (result.exceptionDetails) throw new Error("Browser script evaluation failed.");
    return result.result?.value as T;
  }

  private send(method: string, params?: Record<string, unknown>) {
    return this.contents.debugger.sendCommand(method, params);
  }
}

interface AxNode {
  nodeId?: string;
  role?: { value?: string };
  name?: { value?: string };
  value?: { value?: string | number | boolean };
  ignored?: boolean;
  childIds?: string[];
  properties?: Array<{ name?: string; value?: { value?: unknown } }>;
}

const formatAccessibilitySnapshot = (rawNodes: unknown[], options: BrowserSnapshotOptions) => {
  const nodes = rawNodes as AxNode[];
  const byId = new Map(nodes.map((node) => [node.nodeId || "", node]));
  const childIds = new Set(nodes.flatMap((node) => node.childIds || []));
  const root = nodes.find((node) => node.nodeId && !childIds.has(node.nodeId)) || nodes[0];
  if (!root) return "(empty accessibility tree)";
  const lines: string[] = [];
  const maxDepth = Math.max(1, Math.min(8, Number(options.depth) || 5));
  let refCounter = 0;
  const visit = (node: AxNode, depth: number) => {
    if (depth > maxDepth || node.ignored) return;
    const role = stringValue(node.role?.value);
    const name = stringValue(node.name?.value);
    const value = stringValue(node.value?.value);
    const interesting = role && role !== "generic" && role !== "none" && (name || value || isInteractiveRole(role));
    let ref = "";
    if (interesting && isInteractiveRole(role)) ref = ` [ref=b${++refCounter}]`;
    if (interesting) {
      const label = [role, name ? JSON.stringify(name) : "", value && value !== name ? `value=${JSON.stringify(value)}` : ""]
        .filter(Boolean)
        .join(" ");
      lines.push(`${"  ".repeat(depth)}- ${label}${ref}`);
    }
    (node.childIds || []).forEach((childId) => {
      const child = byId.get(childId);
      if (child) visit(child, interesting ? depth + 1 : depth);
    });
  };
  visit(root, 0);
  return lines.slice(0, 240).join("\n") || "(no accessible content)";
};

const isInteractiveRole = (role: string) =>
  ["button", "link", "textbox", "searchbox", "combobox", "checkbox", "radio", "switch", "slider", "tab", "menuitem", "option"].includes(role);

const stringValue = (value: unknown) =>
  value === undefined || value === null ? "" : String(value).replace(/\s+/g, " ").trim().slice(0, 220);
