import { describe, expect, it } from "vitest";
import { computerActionHardBlockReason, redactComputerText } from "../src/main/computer/safety";

describe("Computer Use safety", () => {
  it("hard-blocks credential typing", () => {
    expect(computerActionHardBlockReason({ action: "type", text: "password: secret" })).toMatchObject({
      kind: "blocked_by_policy",
    });
  });

  it("hard-blocks irreversible clicks", () => {
    expect(computerActionHardBlockReason({ action: "click", text: "Delete account permanently" })).toMatchObject({
      kind: "blocked_by_policy",
    });
  });

  it("redacts sensitive desktop text", () => {
    const redacted = redactComputerText("email me at user@example.com password=secret card 4111 1111 1111 1111");
    expect(redacted).toContain("[redacted-email]");
    expect(redacted).toContain("password=[redacted]");
    expect(redacted).toContain("[redacted-card]");
  });
});
