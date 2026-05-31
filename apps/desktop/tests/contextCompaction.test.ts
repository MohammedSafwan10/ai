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
});
