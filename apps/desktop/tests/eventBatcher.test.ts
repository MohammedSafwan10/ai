import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBatcher } from "../src/renderer/state/eventBatcher";

const setup = () => {
  vi.useFakeTimers();
  let nextFrame = 0;
  const frames = new Map<number, () => void>();
  const batches: number[][] = [];
  const batcher = new EventBatcher<number>({
    requestFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelFrame: (id) => { frames.delete(id); },
    setTimer: (callback, delay) => Number(setTimeout(callback, delay)),
    clearTimer: (id) => clearTimeout(id),
  }, (events) => batches.push(events));
  return { batcher, batches, frames };
};
afterEach(() => vi.useRealTimers());
describe("renderer event queue under background throttling", () => {
  it("drains when animation frames never fire and does not replay on the next frame", () => {
    const { batcher, batches, frames } = setup();
    batcher.enqueue(1); batcher.enqueue(2);
    vi.advanceTimersByTime(100);
    expect(batches).toEqual([[1, 2]]); expect(frames.size).toBe(0);
    batcher.enqueue(3);
    [...frames.values()][0]();
    vi.advanceTimersByTime(100);
    expect(batches).toEqual([[1, 2], [3]]);
  });
  it("bounds queued updates even when both frames and timers are suspended", () => {
    const { batcher, batches } = setup();
    const traffic = Array.from({ length: 10_000 }, (_, index) => index);
    traffic.forEach((event) => batcher.enqueue(event));
    expect(batches.length).toBeGreaterThan(0);
    expect(batches.every((batch) => batch.length <= 64)).toBe(true);
    batcher.flush();
    expect(batches.flat()).toEqual(traffic);
  });
  it("releases pending updates and scheduled work on teardown", () => {
    const { batcher, batches, frames } = setup();
    batcher.enqueue(1); batcher.clear();
    vi.runAllTimers();
    expect(batches).toEqual([]); expect(frames.size).toBe(0);
  });
});
