import { describe, expect, it } from "vitest";
import {
  COMPACTION_SUMMARY_PREFIX,
  buildCompactedProviderHistory,
  compactProviderHistory,
} from "../src/main/agent/context";
import type { ProviderMessage } from "../src/main/agent/providers/types";

describe("provider history compaction", () => {
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

  it("builds handoff replacement history with retained recent user messages and one summary", () => {
    const history: ProviderMessage[] = [
      { role: "user", content: "old request", parts: [{ type: "text", text: "old request" }] },
      { role: "assistant", content: "old answer", parts: [{ type: "text", text: "old answer" }] },
      { role: "user", content: "latest important request", parts: [{ type: "text", text: "latest important request" }] },
    ];

    const compacted = buildCompactedProviderHistory(history, "Progress: changed src/app.ts. Next: run tests.");

    expect(compacted.at(-1)?.content).toContain(COMPACTION_SUMMARY_PREFIX);
    expect(compacted.at(-1)?.content).toContain("Progress: changed src/app.ts");
    expect(compacted.filter((message) => message.content.includes(COMPACTION_SUMMARY_PREFIX))).toHaveLength(1);
    expect(compacted.some((message) => message.content.includes("latest important request"))).toBe(true);
    expect(compacted.every((message) => !(message.parts || []).some((part) => part.type === "function_response"))).toBe(true);
  });
});
