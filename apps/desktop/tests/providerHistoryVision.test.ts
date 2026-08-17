import { describe, expect, it } from "vitest";
import { sanitizeProviderHistoryForModel } from "../src/main/agent/context";
import type { ProviderMessage } from "../src/main/agent/providers/types";

const history: ProviderMessage[] = [{
  role: "user",
  content: "describe this",
  parts: [
    { type: "text", text: "describe this" },
    { type: "image", name: "screen.png", mimeType: "image/png", data: "abc123" },
  ],
}];

describe("provider history image sanitization", () => {
  it("preserves image parts for vision-capable models", () => {
    const sanitized = sanitizeProviderHistoryForModel(history, "gemini-3.7-flash");
    expect(sanitized[0].parts?.some((part) => part.type === "image")).toBe(true);
  });

  it("omits stale image parts for text-only models", () => {
    const sanitized = sanitizeProviderHistoryForModel(history, "deepseek/deepseek-v4-flash");
    expect(sanitized[0].parts?.some((part) => part.type === "image")).toBe(false);
    expect(sanitized[0].content).toContain("does not support image input");
  });
});
