import { describe, expect, it } from "vitest";
import { browserOriginDecision, normalizeBrowserUrl, redactHeaders, redactSensitiveText, shouldRestorePersistedBrowserUrl } from "../src/main/browser/browserSecurity";

describe("browser security", () => {
  it("normalizes bare localhost urls", () => {
    expect(normalizeBrowserUrl("localhost:5173")).toBe("http://localhost:5173/");
  });

  it("treats plain address text as a web search", () => {
    expect(normalizeBrowserUrl("hi")).toBe("https://duckduckgo.com/?q=hi");
  });

  it("blocks unsupported browser schemes", () => {
    expect(() => normalizeBrowserUrl("file:///C:/secret.txt")).toThrow(/cannot be opened/i);
    expect(() => normalizeBrowserUrl("javascript:alert(1)")).toThrow(/cannot be opened/i);
  });

  it("allows agent control for localhost but not external origins", () => {
    expect(browserOriginDecision("http://127.0.0.1:3000", "agent")).toMatchObject({
      allowed: true,
      local: true,
    });
    expect(browserOriginDecision("https://example.com", "agent")).toMatchObject({
      allowed: false,
      local: false,
      origin: "https://example.com",
    });
  });

  it("does not restore persisted local dev urls on startup", () => {
    expect(shouldRestorePersistedBrowserUrl("http://localhost:8765/app.html")).toBe(false);
    expect(shouldRestorePersistedBrowserUrl("http://127.0.0.1:5173/")).toBe(false);
    expect(shouldRestorePersistedBrowserUrl("https://example.com/docs")).toBe(true);
  });

  it("redacts sensitive headers and text", () => {
    expect(redactHeaders({ Authorization: "Bearer secret", Cookie: "session=abc", Accept: "text/html" })).toEqual({
      Authorization: "[redacted]",
      Cookie: "[redacted]",
      Accept: "text/html",
    });
    expect(redactSensitiveText("token=abc123 password: hunter2 email test@example.com")).toContain("[redacted]");
    expect(redactSensitiveText("token=abc123 password: hunter2 email test@example.com")).toContain("[email]");
  });
});
