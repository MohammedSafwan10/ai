import { describe, expect, it, vi } from "vitest";
import { BrowserToolExecutor } from "../src/main/browser/browserTools";
import type { DesktopToolCall } from "../src/shared/types";

const browserCall = (name: DesktopToolCall["name"], args: Record<string, unknown>): DesktopToolCall => ({
  id: "browser-test",
  name,
  arguments: args,
});

describe("browser tool executor", () => {
  it("passes approved external browser opens through as user-scoped navigation", async () => {
    const openUrl = vi.fn(async () => ({
      workspaceId: "workspace",
      url: "https://example.com/",
      title: "Example Domain",
      canGoBack: false,
      canGoForward: false,
      loading: false,
      viewport: { width: 1280, height: 900 },
      local: false,
      consoleErrorCount: 0,
      failedRequestCount: 0,
      lastFinding: "Opened https://example.com/",
    }));
    const executor = new BrowserToolExecutor({ openUrl } as never);

    await executor.execute(browserCall("browser_open", { url: "https://example.com" }), {
      workspaceId: "workspace",
      workspaceRoot: "D:/work",
      signal: new AbortController().signal,
      browserExternalApproved: true,
    });

    expect(openUrl).toHaveBeenCalledWith("workspace", "https://example.com", expect.objectContaining({
      scope: "user",
      rememberAgentApproval: true,
      throwOnLoadFailure: true,
    }));
  });

  it("routes browser search with bounded options", async () => {
    const search = vi.fn(async () => ({
      output: "1. Result — https://example.com",
      data: { results: [{ text: "Result", href: "https://example.com" }] },
    }));
    const executor = new BrowserToolExecutor({ search } as never);

    await executor.execute(browserCall("browser_search", { query: "privora", engine: "duckduckgo", limit: 3 }), {
      workspaceId: "workspace",
      workspaceRoot: "D:/work",
      signal: new AbortController().signal,
    });

    expect(search).toHaveBeenCalledWith("workspace", "privora", expect.objectContaining({
      engine: "duckduckgo",
      open: true,
      limit: 3,
      newTab: false,
    }));
  });

  it("routes browser search newTab and tabId options", async () => {
    const search = vi.fn(async () => ({ output: "ok", data: {} }));
    const executor = new BrowserToolExecutor({ search } as never);

    await executor.execute(browserCall("browser_search", { query: "privora", newTab: true, tabId: "tab-1" }), {
      workspaceId: "workspace",
      workspaceRoot: "D:/work",
      signal: new AbortController().signal,
    });

    expect(search).toHaveBeenCalledWith("workspace", "privora", expect.objectContaining({
      newTab: true,
      tabId: "tab-1",
    }));
  });

  it("routes browser tab actions through the manager", async () => {
    const tab = vi.fn(async () => ({
      workspaceId: "workspace",
      url: "",
      title: "Privora Browser",
      loading: false,
      canGoBack: false,
      canGoForward: false,
      visible: true,
      agentActive: false,
      consoleErrorCount: 0,
      failedRequestCount: 0,
      viewport: { width: 900, height: 680 },
      viewportPreset: "responsive",
      tabs: [{ id: "tab-1", title: "Docs", url: "https://example.com", loading: false, canGoBack: false, canGoForward: false, createdAt: 1, updatedAt: 2 }],
      activeTabId: "tab-1",
      downloads: [],
      forms: [],
      updatedAt: 3,
    }));
    const executor = new BrowserToolExecutor({ tab } as never);

    const result = await executor.execute(browserCall("browser_tab", { action: "close_all_except", tabId: "tab-1" }), {
      workspaceId: "workspace",
      workspaceRoot: "D:/work",
      signal: new AbortController().signal,
    });

    expect(result.success).toBe(true);
    expect(tab).toHaveBeenCalledWith("workspace", expect.objectContaining({ action: "close_all_except", tabId: "tab-1" }));
  });

  it("routes browser download and pdf tools", async () => {
    const downloadAction = vi.fn(async () => ({ output: "No browser downloads recorded.", data: { downloads: [] } }));
    const pdf = vi.fn(async () => ({ output: "PDF summary:\nhello", data: { text: "hello" } }));
    const executor = new BrowserToolExecutor({ downloadAction, pdf } as never);
    const context = { workspaceId: "workspace", workspaceRoot: "D:/work", signal: new AbortController().signal };

    await executor.execute(browserCall("browser_downloads", { action: "list" }), context);
    await executor.execute(browserCall("browser_pdf", { mode: "summary", tabId: "tab-1" }), context);

    expect(downloadAction).toHaveBeenCalledWith("workspace", expect.objectContaining({ action: "list" }));
    expect(pdf).toHaveBeenCalledWith("workspace", "summary", "tab-1");
  });

  it("routes browser form tools through the manager", async () => {
    const formAnalyze = vi.fn(async () => ({ output: "f1", data: { forms: [] } }));
    const formFill = vi.fn(async () => ({ output: "filled", data: { filledCount: 1 } }));
    const formValidate = vi.fn(async () => ({ output: "valid", data: { valid: true } }));
    const formSubmit = vi.fn(async () => ({ output: "submitted", data: { valid: true } }));
    const executor = new BrowserToolExecutor({ formAnalyze, formFill, formValidate, formSubmit } as never);
    const context = { workspaceId: "workspace", workspaceRoot: "D:/work", signal: new AbortController().signal, browserExternalApproved: true };

    await executor.execute(browserCall("browser_form_analyze", { tabId: "tab-1" }), context);
    await executor.execute(browserCall("browser_form_fill", { formId: "f1", fields: [{ fieldId: "f1-c1", value: "Safwan" }] }), context);
    await executor.execute(browserCall("browser_form_validate", { formId: "f1" }), context);
    await executor.execute(browserCall("browser_form_submit", { formId: "f1", includeScreenshot: true }), context);

    expect(formAnalyze).toHaveBeenCalledWith("workspace", "tab-1");
    expect(formFill).toHaveBeenCalledWith("workspace", expect.objectContaining({
      formId: "f1",
      fields: [expect.objectContaining({ fieldId: "f1-c1", value: "Safwan" })],
    }), { agentApproved: true });
    expect(formValidate).toHaveBeenCalledWith("workspace", expect.objectContaining({ formId: "f1" }));
    expect(formSubmit).toHaveBeenCalledWith("workspace", expect.objectContaining({ formId: "f1", includeScreenshot: true }), { agentApproved: true });
  });

  it("reports browser wait timeouts as failed tool results", async () => {
    const wait = vi.fn(async () => ({
      matched: false,
      kind: "text",
      value: "Ready",
      elapsedMs: 500,
      url: "http://localhost:5173/",
    }));
    const executor = new BrowserToolExecutor({ wait } as never);

    const result = await executor.execute(browserCall("browser_wait", { for: "text", value: "Ready", timeoutMs: 500 }), {
      workspaceId: "workspace",
      workspaceRoot: "D:/work",
      signal: new AbortController().signal,
    });

    expect(result.success).toBe(false);
    expect(result.output).toContain("Timed out waiting for text Ready");
  });
});
