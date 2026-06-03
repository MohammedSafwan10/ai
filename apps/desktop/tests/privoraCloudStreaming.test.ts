import { describe, expect, it, vi } from "vitest";
import { emitProgressiveText } from "../src/main/agent/providers/privoraCloud";

describe("Privora Cloud progressive text reveal", () => {
  it("emits long hosted responses in multiple UI deltas", async () => {
    vi.useFakeTimers();
    const deltas: string[] = [];
    const promise = emitProgressiveText("alpha ".repeat(80), (delta) => deltas.push(delta), new AbortController().signal);

    await vi.runAllTimersAsync();
    await promise;
    vi.useRealTimers();

    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join("")).toBe("alpha ".repeat(80));
  });
});
