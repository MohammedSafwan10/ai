import { describe, expect, it } from "vitest";
import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import { adjustForHiddenRow } from "../src/renderer/features/chat/scrollAnchoring";

describe("chat resize anchoring", () => {
  const item = (start: number, end: number): VirtualItem => ({ index: 3, key: "message", start, end, size: end - start, lane: 0 });
  const viewport = (scrollOffset: number | null) => ({ scrollOffset }) as Virtualizer<HTMLDivElement, Element>;
  it.each([500, -500])("does not shift a visible message when tool details resize by %i px", (delta) => {
    expect(adjustForHiddenRow(item(100, 1800), delta, viewport(800))).toBe(false);
    expect(adjustForHiddenRow(item(800, 1800), delta, viewport(800))).toBe(false);
    expect(adjustForHiddenRow(item(1000, 1800), delta, viewport(800))).toBe(false);
  });
  it("compensates for measured rows entirely above the viewport", () => {
    expect(adjustForHiddenRow(item(100, 700), 200, viewport(800))).toBe(true);
    expect(adjustForHiddenRow(item(100, 800), -200, viewport(800))).toBe(true);
    expect(adjustForHiddenRow(item(100, 700), 200, viewport(null))).toBe(false);
  });
  it("uses the visible index while prepended measurements batch scroll adjustments", () => {
    const instance = { scrollOffset: 800, scrollElement: { scrollTop: 2300 } } as Virtualizer<HTMLDivElement, Element>;
    expect(adjustForHiddenRow({ ...item(2000, 2200), index: 49 }, 200, instance)).toBe(true);
    expect(adjustForHiddenRow({ ...item(2200, 3000), index: 50 }, -500, instance)).toBe(false);
  });
});
