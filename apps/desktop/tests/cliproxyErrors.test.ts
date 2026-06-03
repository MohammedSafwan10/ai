import { describe, expect, it } from "vitest";
import { normalizeCliproxyError } from "../src/main/agent/providers/cliproxy";

describe("CLIProxy error normalization", () => {
  it("explains expired upstream authentication without dumping JSON", () => {
    const message = normalizeCliproxyError(JSON.stringify({
      error: {
        message: "Provided authentication token is expired. Please try signing in again.",
        type: "authentication_error",
        code: "auth_unavailable",
      },
    }));

    expect(message).toContain("CLIProxy could not authenticate");
    expect(message).toContain("cliproxy -codex-login");
    expect(message).not.toContain("{\"error\"");
  });

  it("explains invalidated OAuth tokens", () => {
    const message = normalizeCliproxyError(JSON.stringify({
      error: {
        message: "Encountered invalidated oauth token for user, failing request",
        type: "authentication_error",
        code: "auth_unavailable",
      },
    }));

    expect(message).toContain("remove stale Codex auth files");
  });

  it("explains Cloudflare challenge responses from ChatGPT upstream", () => {
    const message = normalizeCliproxyError(JSON.stringify({
      error: {
        message: "<html><script src=\"/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1\"></script><noscript>Enable JavaScript and cookies to continue</noscript></html>",
        type: "permission_error",
        code: "insufficient_quota",
      },
    }));

    expect(message).toContain("Cloudflare challenge");
    expect(message).toContain("Open ChatGPT");
    expect(message).not.toContain("<html>");
  });

  it("explains upstream connection timeouts", () => {
    const message = normalizeCliproxyError(JSON.stringify({
      error: {
        message: "upstream connect error or disconnect/reset before headers. retried and the latest reset reason: connection timeout",
        type: "server_error",
        code: "internal_server_error",
      },
    }));

    expect(message).toContain("upstream Codex connection timed out");
  });
});
