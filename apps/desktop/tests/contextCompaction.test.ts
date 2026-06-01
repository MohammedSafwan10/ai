import { describe, expect, it } from "vitest";
import { compactProviderHistory } from "../src/main/agent/context";
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
});
