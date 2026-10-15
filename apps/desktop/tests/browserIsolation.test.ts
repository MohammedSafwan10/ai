import os from "node:os";
import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => os.tmpdir() }, BrowserWindow: class {}, WebContentsView: class {}, session: {}, shell: {} }));
import { BrowserSessionManager } from "../src/main/browser/BrowserSessionManager";
import { CausalJournal, networkEntryCounts } from "../src/main/browser/causalJournal";

const tab = (id: string, url = `https://example.com/${id}`) => ({
  id, workspaceId: "workspace", state: { url, title: id, tabs: [] as unknown[] }, refPrefix: undefined as string | undefined,
  refs: new Map<string, { ref: string; role: string; name: string; href?: string; x: number; y: number; width: number; height: number }>(), forms: [], network: new Map(), approvedAgentOrigins: new Set<string>(),
  createdAt: 1, updatedAt: 1, journal: new CausalJournal("workspace"),
  cdp: { enableNetwork: vi.fn(async () => {}), enableRuntime: vi.fn(async () => {}) },
  view: { webContents: { id: id === "a" ? 1 : 2, getURL: () => url, getTitle: () => id, isLoading: () => false, navigationHistory: { canGoBack: () => false, canGoForward: () => false }, executeJavaScript: vi.fn(async () => ({ lines: ['- link "Docs" [ref=b1]'], refs: [{ ref: "b1", role: "link", name: "Docs", href: "https://example.com/docs", x: 1, y: 1, width: 10, height: 10 }] })) } },
});
type Tab = ReturnType<typeof tab>;
type Internals = {
  sessions: Map<string, Tab>; workspaceTabs: Map<string, Tab[]>;
  collectInteractiveSnapshot: (session: Tab, options: {}) => Promise<string>;
  invalidatePageRefs: (session: Tab) => void;
  resolvePageLink: (session: Tab, input: { ref: string }) => Promise<unknown>;
  recordCdpNetwork: (session: Tab, method: string, params: Record<string, unknown>) => void;
  recordShieldsBlocked: (workspaceId: string, record: unknown, details: unknown) => void;
  updateState: (session: Tab, patch: Record<string, unknown>) => void;
  tabRecords: (workspaceId: string) => Array<{ id: string }>;
  captureEvidenceScreenshot: (workspaceId: string, session: Tab) => Promise<unknown>;
};
const manager = (tabs: Tab[]) => {
  const instance: BrowserSessionManager = Object.assign(Object.create(BrowserSessionManager.prototype), {
    sessions: new Map(tabs[0] ? [["workspace", tabs[0]]] : []), workspaceTabs: new Map(tabs.length ? [["workspace", tabs]] : []),
    downloads: new Map(), persistWorkspace: vi.fn(), emitState: vi.fn(),
    shields: { stateFor: () => ({ recentBlocked: [] }), recentBlocked: () => [] }, workflows: { panelState: () => ({}) },
  });
  return { instance, internal: instance as unknown as Internals };
};

describe("browser tab and reference isolation", () => {
  it("rejects old and cross-tab refs even when each page begins with b1", async () => {
    const a = tab("a"); const b = tab("b"); const { instance, internal } = manager([a, b]);
    const first = await internal.collectInteractiveSnapshot(a, {}); const old = [...a.refs.keys()][0];
    expect(first).toContain(`[ref=${old}]`);
    internal.invalidatePageRefs(a);
    await internal.collectInteractiveSnapshot(a, {}); await internal.collectInteractiveSnapshot(b, {});
    expect([...a.refs.keys()][0]).not.toBe(old);
    expect([...b.refs.keys()][0]).not.toBe([...a.refs.keys()][0]);
    await expect(internal.resolvePageLink(a, { ref: old })).rejects.toThrow("fresh browser_snapshot");
    await expect(instance.act("workspace", { action: "click", ref: old, tabId: a.id } as never, { agentApproved: true })).rejects.toThrow("fresh browser_snapshot");
  });

  it("discards a snapshot that completes after navigation", async () => {
    const a = tab("a"); const { internal } = manager([a]);
    const raw = await a.view.webContents.executeJavaScript();
    a.view.webContents.executeJavaScript.mockImplementationOnce(async () => { internal.invalidatePageRefs(a); return raw; });
    await expect(internal.collectInteractiveSnapshot(a, {})).rejects.toThrow("navigated during");
    expect(a.refs.size).toBe(0);
  });

  it("creates one tab in a fresh workspace and returns the created tab even if activation changes", async () => {
    const { instance, internal } = manager([]); let count = 0;
    const createTab = vi.fn(() => { const created = tab(`new-${++count}`); internal.workspaceTabs.set("workspace", [...(internal.workspaceTabs.get("workspace") ?? []), created]); internal.sessions.set("workspace", created); return created; });
    Object.assign(instance, { createTab, updateStateFromContents: (session: Tab) => { session.state.tabs = internal.tabRecords("workspace"); }, openUrl: vi.fn(async () => { internal.sessions.set("workspace", tab("other")); }) });
    const result = await instance.tab("workspace", { action: "new", url: "https://example.com/docs" } as never, { agentApproved: true });
    expect(createTab).toHaveBeenCalledTimes(1);
    expect(result.tabs.map((item) => item.id)).toEqual(["new-1"]);
    expect("createdTabId" in result && result.createdTabId).toBe("new-1");
  });

  it("updates background tab summaries without replacing the active page", () => {
    const a = tab("a"); const b = tab("b"); const { internal } = manager([a, b]);
    internal.updateState(b, { url: "https://example.com/background" });
    expect(a.state.url).toBe("https://example.com/a");
    expect(a.state.tabs).toHaveLength(2);
  });

  it("keeps document failures and verification bound to the explicit background tab", async () => {
    const a = tab("a"); const b = tab("b"); const { instance, internal } = manager([a, b]);
    internal.recordCdpNetwork(b, "Network.requestWillBeSent", { requestId: "same-id", request: { url: "https://example.com/b/missing", method: "GET" } });
    internal.recordCdpNetwork(b, "Network.responseReceived", { requestId: "same-id", response: { status: 404 } });
    internal.recordCdpNetwork(a, "Network.requestWillBeSent", { requestId: "same-id", request: { url: "https://example.com/a", method: "GET" } });
    internal.recordCdpNetwork(a, "Network.responseReceived", { requestId: "same-id", response: { status: 200 } });
    const checked = await instance.verify("workspace", { tabId: b.id, reload: false });
    expect(checked.tabId).toBe(b.id); expect(checked.failedRequests).toHaveLength(1);
    expect(checked.failedRequests[0].url).toBe("https://example.com/b/missing");
    expect((await instance.verify("workspace", { tabId: a.id, reload: false })).passed).toBe(true);
  });

  it("captures evidence screenshots from the requested tab", async () => {
    const a = tab("a"); const b = tab("b"); const { instance, internal } = manager([a, b]);
    const screenshot = vi.fn(async () => ({ screenshotPath: "b.png" })); Object.assign(instance, { screenshot });
    await internal.captureEvidenceScreenshot("workspace", b);
    expect(screenshot).toHaveBeenCalledWith("workspace", { mode: "viewport", tabId: b.id });
  });

  it("pins link navigation to its source tab despite a concurrent active-tab switch", async () => {
    const a = tab("a"); const b = tab("b"); const { instance, internal } = manager([a, b]);
    const openUrl = vi.fn(async () => ({ ...a.state, activeTabId: b.id, tabId: a.id }));
    Object.assign(instance, { openUrl, resolvePageLink: vi.fn(async () => { internal.sessions.set("workspace", b); return { text: "Docs", href: "https://example.com/docs" }; }) });
    const result = await instance.openLink("workspace", { href: "https://example.com/docs" } as never, { agentApproved: true });
    expect(openUrl.mock.calls[0]).toEqual(["workspace", "https://example.com/docs", expect.objectContaining({ tabId: a.id })]);
    expect(result.data.tabId).toBe(a.id);
  });

  it("extracts search results from the opened tab after activation switches elsewhere", async () => {
    vi.useFakeTimers();
    try {
      const a = tab("a"); const b = tab("b"); const { instance, internal } = manager([a, b]);
      const extractPage = vi.fn(async () => ({ links: [] }));
      Object.assign(instance, { extractPage, openUrl: vi.fn(async () => { internal.sessions.set("workspace", b); return { ...a.state, activeTabId: b.id, tabId: a.id }; }) });
      const pending = instance.search("workspace", "documentation", {}, { agentApproved: true });
      await vi.advanceTimersByTimeAsync(900); await pending;
      expect(extractPage.mock.calls[0]).toEqual([a, "links"]);
    } finally { vi.useRealTimers(); }
  });

  it("correlates a Shields block without counting it twice or blaming another tab", async () => {
    const a = tab("a"); const b = tab("b"); const { instance, internal } = manager([a, b]);
    const blocked = { id: "blocked", url: "https://telemetry.example.com/ping", timestamp: Date.now(), blockedReason: "tracker", ruleSource: "test" };
    Object.assign(instance, { shields: { stateFor: () => ({ recentBlocked: [] }), recentBlocked: (id: number) => id === b.view.webContents.id ? [blocked] : [] } });
    internal.recordShieldsBlocked("workspace", blocked, { webContentsId: b.view.webContents.id, method: "GET" });
    internal.recordCdpNetwork(b, "Network.requestWillBeSent", { requestId: "request", request: { url: blocked.url, method: "GET" } });
    internal.recordCdpNetwork(b, "Network.loadingFailed", { requestId: "request", errorText: "net::ERR_BLOCKED_BY_CLIENT" });
    expect(b.journal.recentNetwork()).toHaveLength(1);
    expect(networkEntryCounts(b.journal.recentNetwork())).toMatchObject({ failedRequestCount: 0, shieldsBlockedRequestCount: 1 });
    internal.recordShieldsBlocked("workspace", blocked, { webContentsId: 999, method: "GET" });
    expect(a.journal.recentNetwork()).toEqual([]);
    b.journal.recordConsole({ level: "error", message: `${blocked.url} net::ERR_BLOCKED_BY_CLIENT`, sourceId: blocked.url });
    expect((await instance.verify("workspace", { tabId: b.id, reload: false })).passed).toBe(true);
  });

  it("does not hide an uncorrelated blocked-client error or an actual HTTP failure", async () => {
    const a = tab("a"); const { instance, internal } = manager([a]);
    internal.recordCdpNetwork(a, "Network.requestWillBeSent", { requestId: "unmatched", request: { url: "https://example.com/resource", method: "GET" } });
    internal.recordCdpNetwork(a, "Network.loadingFailed", { requestId: "unmatched", errorText: "net::ERR_BLOCKED_BY_CLIENT" });
    expect((await instance.verify("workspace", { tabId: a.id, reload: false })).passed).toBe(false);
  });
});
