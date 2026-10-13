import { describe, expect, it } from "vitest";
import { HeadTailOutputBuffer, compactTextForModel } from "../src/main/terminal/outputBuffer";

describe("terminal output buffer", () => {
  it("preserves UTF-8 across the internal head/tail boundary without truncation", () => {
    const buffer = new HeadTailOutputBuffer(8);
    buffer.push("€€");
    expect(buffer.toString()).toBe("€€");
    expect(buffer.stats()).toEqual({ retainedBytes: 6, omittedBytes: 0 });
  });

  it("waits for a complete UTF-8 character across streamed byte chunks", () => {
    const bytes = Buffer.from("A😀€漢Z");
    const buffer = new HeadTailOutputBuffer(30);
    for (let index = 0; index < bytes.length; index += 1) {
      buffer.push(bytes.subarray(index, index + 1));
      expect(buffer.toString()).not.toContain("\uFFFD");
    }
    expect(buffer.toString()).toBe("A😀€漢Z");
  });

  it("does not manufacture replacement characters at truncated UTF-8 boundaries", () => {
    const bytes = Buffer.from("€😀漢".repeat(10));
    for (let budget = 1; budget < 25; budget += 1) {
      const buffer = new HeadTailOutputBuffer(budget);
      for (const byte of bytes) buffer.push(Buffer.from([byte]));
      expect(buffer.toString()).not.toContain("\uFFFD");
      expect(buffer.toString()).toContain("omitted");
      expect(buffer.stats().retainedBytes).toBeLessThanOrEqual(budget);
    }
  });

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

  it("does not split visible lines around the omission marker", () => {
    const buffer = new HeadTailOutputBuffer(34);
    for (let index = 1; index <= 12; index += 1) {
      buffer.push(`line-${String(index).padStart(3, "0")}\n`);
    }

    const output = buffer.toString();
    expect(output).toContain("omitted");
    expect(output).toContain("line-001");
    expect(output).toContain("line-012");
    expect(output).not.toMatch(/line-\n\n\[\.\.\./);
    expect(output).not.toMatch(/\.\.\.\]\n\n-\d/);
    output.split("\n").forEach((line) => {
      if (!line || line.includes("omitted")) return;
      expect(line).toMatch(/^line-\d{3}$/);
    });
  });

  it("compacts model text with a readable omission marker", () => {
    const text = `${"a".repeat(20)}${"b".repeat(20)}${"c".repeat(20)}`;
    const compacted = compactTextForModel(text, 24) || "";
    expect(compacted).toContain("omitted");
    expect(compacted.startsWith("a")).toBe(true);
    expect(compacted.endsWith("c".repeat(12))).toBe(true);
  });
});
