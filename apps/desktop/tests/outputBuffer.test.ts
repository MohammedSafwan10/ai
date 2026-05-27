import { describe, expect, it } from "vitest";
import { HeadTailOutputBuffer, compactTextForModel } from "../src/main/terminal/outputBuffer";

describe("terminal output buffer", () => {
  it("keeps head and tail when output exceeds the byte cap", () => {
    const buffer = new HeadTailOutputBuffer(10);
    buffer.push("hello");
    buffer.push(" middle ");
    buffer.push("world");

    const output = buffer.toString();
    expect(output).toContain("hello");
    expect(output).toContain("world");
    expect(output).toContain("omitted");
    expect(buffer.stats().omittedBytes).toBeGreaterThan(0);
  });

  it("compacts model text with a readable omission marker", () => {
    const text = `${"a".repeat(20)}${"b".repeat(20)}${"c".repeat(20)}`;
    const compacted = compactTextForModel(text, 24) || "";
    expect(compacted).toContain("omitted");
    expect(compacted.startsWith("a")).toBe(true);
    expect(compacted.endsWith("c".repeat(12))).toBe(true);
  });
});
