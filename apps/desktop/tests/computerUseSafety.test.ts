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

  it("hard-blocks sensitive resolved targets and secret-shaped values", () => {
    expect(computerActionHardBlockReason({ action: "click", ref: "c2" }, { ref: "c2", role: "Password", name: "", sensitive: true })).toMatchObject({
      kind: "blocked_by_policy",
    });
    expect(computerActionHardBlockReason({ action: "type", text: "sk-testsecret123456" })).toMatchObject({
      kind: "blocked_by_policy",
    });
    expect(computerActionHardBlockReason({ action: "type", text: "4111 1111 1111 1111" })).toMatchObject({
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
