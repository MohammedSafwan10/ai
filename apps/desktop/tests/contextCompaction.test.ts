import { describe, expect, it } from "vitest";
import {
  COMPACTION_SUMMARY_PREFIX,
  buildCompactedProviderHistory,
  buildDeterministicCompactionSummary,
  compactProviderHistory,
  estimateProviderHistoryTokens,
  messagesToProviderHistory,
} from "../src/main/agent/context";
import type { ProviderMessage } from "../src/main/agent/providers/types";
import type { ChatMessageRecord } from "../src/shared/types";

describe("provider history compaction", () => {
  it("reconstructs inline steer messages at their saved assistant text offsets", () => {
    const assistant: ChatMessageRecord = {
      id: "assistant",
      threadId: "thread",
      role: "assistant",
      content: "Before steer. After steer.",
      status: "completed",
      createdAt: 1,
      updatedAt: 3,
    };
    const steer: ChatMessageRecord = {
      id: "steer",
      threadId: "thread",
      role: "user",
      content: "Change direction",
      status: "completed",
      steeredTurnId: "assistant",
      steerTextOffset: 13,
      steerStreamOrder: 2,
      createdAt: 2,
      updatedAt: 2,
    };

    expect(messagesToProviderHistory([assistant, steer]).map((message) => [message.role, message.content])).toEqual([
      ["assistant", "Before steer."],
      ["user", "Change direction"],
      ["assistant", " After steer."],
    ]);
  });

  it("summarizes older messages while preserving recent context", () => {
    const history: ProviderMessage[] = Array.from({ length: 30 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `message-${index} ${"x".repeat(900)}`,
      parts: [{ type: "text", text: `message-${index} ${"x".repeat(900)}` }],
    }));

    const compacted = compactProviderHistory(history, 2500);

    expect(compacted.length).toBeLessThan(history.length);
    expect(compacted[0].content).toContain("older messages compacted");
    expect(compacted.at(-1)?.content).toContain("message-29");
  });

  it("does not leave orphan tool outputs in provider history", () => {
    const older: ProviderMessage[] = Array.from({ length: 4 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `old-${index}`,
      parts: [{ type: "text", text: `old-${index}` }],
    }));
    const history: ProviderMessage[] = [
      ...older,
      {
        role: "user",
        content: "",
        parts: [{
          type: "function_response",
          id: "call_older",
          name: "desktop_read_file",
          response: { success: true, output: "file text" },
        }],
      },
    ];

    const compacted = compactProviderHistory(history, 10_000);
    const flatParts = compacted.flatMap((message) => message.parts || []);

    expect(flatParts.some((part) => part.type === "function_response" && part.id === "call_older")).toBe(false);
    expect(compacted.some((message) => message.content.includes("Tool result preserved from compacted history"))).toBe(true);
  });

  it("places the handoff before exact recent conversation so the latest request stays last", () => {
    const history: ProviderMessage[] = [
      { role: "user", content: "old request", parts: [{ type: "text", text: "old request" }] },
      { role: "assistant", content: "old answer", parts: [{ type: "text", text: "old answer" }] },
      { role: "user", content: "latest important request", parts: [{ type: "text", text: "latest important request" }] },
    ];

    const compacted = buildCompactedProviderHistory(history, "Progress: changed src/app.ts. Next: run tests.");

    expect(compacted[0]?.content).toContain(COMPACTION_SUMMARY_PREFIX);
    expect(compacted[0]?.content).toContain("Progress: changed src/app.ts");
    expect(compacted.filter((message) => message.content.includes(COMPACTION_SUMMARY_PREFIX))).toHaveLength(1);
    expect(compacted.some((message) => message.content.includes("latest important request"))).toBe(true);
    expect(compacted.at(-1)?.content).toBe("latest important request");
    expect(compacted.some((message) => message.role === "assistant" && message.content === "old answer")).toBe(true);
  });

  it("retains complete recent tool pairs and repairs a pair split by the token boundary", () => {
    const call: ProviderMessage = {
      role: "assistant",
      content: "Checking the file",
      parts: [{ type: "function_call", id: "call_1", name: "desktop_read_file", arguments: { path: "src/app.ts", payload: "x".repeat(2_000) } }],
    };
    const response: ProviderMessage = {
      role: "user",
      content: "",
      parts: [{ type: "function_response", id: "call_1", name: "desktop_read_file", response: { success: true, output: "important result" } }],
    };

    const complete = buildCompactedProviderHistory([call, response], "A sufficiently detailed handoff summary for the recent tool operation.", 10_000);
    expect(complete.flatMap((message) => message.parts || []).filter((part) => part.type === "function_call")).toHaveLength(1);
    expect(complete.flatMap((message) => message.parts || []).filter((part) => part.type === "function_response")).toHaveLength(1);

    const split = buildCompactedProviderHistory([call, response], "A sufficiently detailed handoff summary for the recent tool operation.", 220);
    expect(split.flatMap((message) => message.parts || []).some((part) => part.type === "function_response")).toBe(false);
    expect(split.some((message) => message.content.includes("Tool result preserved from compacted history"))).toBe(true);
  });

  it("keeps the original goal in deterministic fallback even when it falls outside the recent tail", () => {
    const history: ProviderMessage[] = [
      { role: "user", content: "ORIGINAL UNIQUE GOAL", parts: [{ type: "text", text: "ORIGINAL UNIQUE GOAL" }] },
      ...Array.from({ length: 60 }, (_, index): ProviderMessage => ({
        role: index % 2 === 0 ? "assistant" : "user",
        content: `recent-${index}`,
        parts: [{ type: "text", text: `recent-${index}` }],
      })),
    ];

    const summary = buildDeterministicCompactionSummary(history);
    expect(summary).toContain("Original goal:");
    expect(summary).toContain("ORIGINAL UNIQUE GOAL");
    expect(summary).toContain("recent-59");
  });

  it("reserves a conservative token estimate for image context", () => {
    const tokens = estimateProviderHistoryTokens([{
      role: "user",
      content: "inspect this",
      parts: [{ type: "image", name: "screen.png", mimeType: "image/png", data: "base64-data" }],
    }]);
    expect(tokens).toBeGreaterThanOrEqual(2_048);
  });
});
