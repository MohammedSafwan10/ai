import os from "node:os";
import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir() }, BrowserWindow: class {}, WebContentsView: class {}, session: {}, shell: {} }));
import { BrowserSessionManager } from "../src/main/browser/BrowserSessionManager";
describe("native browser view occlusion", () => {
  it("detaches views for dialogs and blocks tool-driven reattachment until dismissal", () => {
    const view = { webContents: { getURL: () => "https://example.com" }, setBounds: vi.fn() };
    const active = { id: "active", workspaceId: "workspace", view, visible: true, attached: true, bounds: { x: 0, y: 100, width: 600, height: 400 }, state: {} };
    const background = { ...active, id: "background", attached: false, view: { ...view, setBounds: vi.fn() } };
    const window = { isDestroyed: () => false, contentView: { addChildView: vi.fn(), removeChildView: vi.fn() } };
    const manager: BrowserSessionManager = Object.assign(Object.create(BrowserSessionManager.prototype), {
      sessions: new Map([["workspace", active]]), workspaceTabs: new Map([["workspace", [active, background]]]),
      nativeViewsOccluded: false, getMainWindow: () => window, ensureSession: () => active, updateState: vi.fn(),
    });
    manager.setOccluded(true);
    expect(window.contentView.removeChildView).toHaveBeenCalledWith(view);
    expect(active.attached).toBe(false);
    manager.setVisible("workspace", true);
    expect(window.contentView.addChildView).not.toHaveBeenCalled();
    manager.setOccluded(false);
    expect(window.contentView.addChildView).toHaveBeenCalledExactlyOnceWith(view);
    expect(background.attached).toBe(false);
    expect(view.setBounds).toHaveBeenCalledWith(active.bounds);
  });
  it("does not reveal a browser that was hidden while a dialog was open", () => {
    const view = { webContents: { getURL: () => "https://example.com" }, setBounds: vi.fn() };
    const tab = { id: "tab", workspaceId: "workspace", view, visible: false, attached: false, bounds: { x: 0, y: 0, width: 600, height: 400 } };
    const add = vi.fn();
    const manager: BrowserSessionManager = Object.assign(Object.create(BrowserSessionManager.prototype), {
      sessions: new Map([["workspace", tab]]), workspaceTabs: new Map([["workspace", [tab]]]),
      nativeViewsOccluded: true, getMainWindow: () => ({ isDestroyed: () => false, contentView: { addChildView: add } }),
    });
    manager.setOccluded(false);
    expect(add).not.toHaveBeenCalled();
  });
});
