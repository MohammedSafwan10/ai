import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { BrowserNetworkPipeline } from "../src/main/browser/shields/BrowserNetworkPipeline";
import { ShieldsManager } from "../src/main/browser/shields/ShieldsManager";

const details = (input: Partial<Electron.OnBeforeRequestListenerDetails>): Electron.OnBeforeRequestListenerDetails => ({
  id: 1,
  url: "https://example.com/app.js",
  method: "GET",
  resourceType: "script",
  referrer: "https://example.com/",
  timestamp: Date.now(),
  uploadData: [],
  ...input,
});

describe("Privora Shields", () => {
  it("keeps external sites protected while local dev origins default off", () => {
    const manager = new ShieldsManager(path.join(os.tmpdir(), `privora-shields-${crypto.randomUUID()}`), { preloadFilters: false });

    expect(manager.stateFor("workspace", "https://news.example/").effectiveMode).toBe("standard");
    expect(manager.stateFor("workspace", "http://localhost:5173/").effectiveMode).toBe("off");
    expect(manager.stateFor("workspace", "http://127.0.0.1:8765/").effectiveMode).toBe("off");
  });

  it("lets per-site overrides win over defaults", () => {
    const manager = new ShieldsManager(path.join(os.tmpdir(), `privora-shields-${crypto.randomUUID()}`), { preloadFilters: false });

    manager.setSiteMode("workspace", "https://news.example", "off");
    expect(manager.stateFor("workspace", "https://news.example/story").effectiveMode).toBe("off");

    manager.setSiteMode("workspace", "http://localhost:5173", "standard");
    expect(manager.stateFor("workspace", "http://localhost:5173/app").effectiveMode).toBe("standard");
  });

  it("runs hard security blocks before Shields matching", () => {
    const shields = { evaluate: vi.fn(() => ({ blocked: false })) } as unknown as ShieldsManager;
    const pipeline = new BrowserNetworkPipeline({ workspaceId: "workspace", shields });

    expect(pipeline.handleBeforeRequest(details({ url: "file:///C:/secret.txt", resourceType: "mainFrame" }))).toEqual({ cancel: true });
    expect(shields.evaluate).not.toHaveBeenCalled();
  });

  it("never lets Shields block top-level main-frame navigation", () => {
    const shields = { evaluate: vi.fn(() => ({ blocked: true, record: { id: "b1" } })) } as unknown as ShieldsManager;
    const pipeline = new BrowserNetworkPipeline({ workspaceId: "workspace", shields });

    expect(pipeline.handleBeforeRequest(details({ url: "https://ads.example/", resourceType: "mainFrame" }))).toEqual({ cancel: false });
    expect(shields.evaluate).not.toHaveBeenCalled();
  });

  it("cancels matching subresource requests and reports compact block evidence", () => {
    const record = {
      id: "block-1",
      url: "https://tracker.example/pixel",
      displayUrl: "https://tracker.example/pixel",
      resourceType: "image",
      blockedReason: "Privora Shields blocked an ad/tracker request.",
      timestamp: Date.now(),
    };
    const onShieldsBlocked = vi.fn();
    const shields = { evaluate: vi.fn(() => ({ blocked: true, record })) } as unknown as ShieldsManager;
    const pipeline = new BrowserNetworkPipeline({ workspaceId: "workspace", shields, onShieldsBlocked });

    expect(pipeline.handleBeforeRequest(details({ url: record.url, resourceType: "image" }))).toEqual({ cancel: true });
    expect(onShieldsBlocked).toHaveBeenCalledWith(record, expect.objectContaining({ url: record.url }));
  });
});
