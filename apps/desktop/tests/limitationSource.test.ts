import { describe, expect, it } from "vitest";
import { toolFailureLabel } from "../src/shared/toolFailure";
import { buildSecuritySystemPrompt } from "../src/main/kali/systemPrompt";
import type { ToolEventRecord } from "../src/shared/types";
const tool = (patch: Partial<ToolEventRecord> = {}): ToolEventRecord => ({ id: "id", callId: "call", threadId: "chat", messageId: "message", name: "kali_exec", title: "Run", status: "failed", risk: "risky", args: {}, result: { success: false, error: "Connection timed out" }, createdAt: 1, updatedAt: 1, ...patch });
describe("limitation source", () => {
  it("distinguishes real app restrictions from command errors", () => {
    expect(toolFailureLabel(tool())).toBe("Tool failure");
    expect(toolFailureLabel(tool({ result: { success: false, error: "Not available", data: { blockedByEnvironment: true } } }))).toBe("App restriction");
    expect(toolFailureLabel(tool({ risk: "blocked" }))).toBe("App restriction");
    expect(toolFailureLabel(tool({ status: "done", result: { success: true } }))).toBeNull();
    expect(toolFailureLabel(tool({ status: "awaiting_approval" }))).toBeNull();
  });
  it("retains actual operator scope without blanket authorization", () => {
    const prompt = buildSecuritySystemPrompt({ environmentId: "kali", objective: "Inspect fixture", scope: "Only local fixture.test" }, null, "", "default", "yolo");
    expect(prompt).toContain("Only local fixture.test");
    expect(prompt).toContain("Current access mode: Full access");
    expect(prompt).toContain("without repeatedly asking");
    expect(prompt).toContain("Do not invent blanket authorization");
    expect(prompt).toContain("Distinguish research from active testing");
  });
});
