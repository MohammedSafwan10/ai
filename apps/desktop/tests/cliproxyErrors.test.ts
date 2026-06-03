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
});
