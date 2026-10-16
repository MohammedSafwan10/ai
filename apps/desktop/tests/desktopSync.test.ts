import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopSync, type SyncSnapshot, type SyncUpdate } from "../src/renderer/state/desktopSync";
import type { PrivoraEventEnvelope } from "../src/shared/types";
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const snapshot = (sequence: number, runtimeId = "A") => ({ runtimeId, sequence, snapshot: {}, pendingInputs: [] }) as unknown as SyncSnapshot;
const event = (sequence: number, runtimeId = "A") => ({ runtimeId, sequence, payload: { type: "notification.created", tone: "info", message: "test" } }) as PrivoraEventEnvelope;
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function setup() {
  vi.useFakeTimers();
  let receive!: (event: PrivoraEventEnvelope) => void;
  const requests: ReturnType<typeof deferred<SyncSnapshot>>[] = [];
  const unsub = vi.fn();
  const api = { onPrivoraEvent: vi.fn((callback: typeof receive) => { receive = callback; return unsub; }), getSyncSnapshot: vi.fn(() => { const request = deferred<SyncSnapshot>(); requests.push(request); return request.promise; }), getRuntimeHealth: vi.fn(async () => ({ runtimeId: "A", sequence: 0 })) };
  const sync = new DesktopSync(api); const updates: SyncUpdate[] = [];
  const stop = sync.subscribe((update) => updates.push(update));
  return { sync, api, requests, updates, stop, unsub, receive: (value: PrivoraEventEnvelope) => receive(value) };
}
afterEach(() => vi.useRealTimers());
describe("desktop state recovery", () => {
  it("subscribes before reading and replays only events newer than the snapshot once", async () => {
    const s = setup();
    expect(s.api.onPrivoraEvent.mock.invocationCallOrder[0]).toBeLessThan(s.api.getSyncSnapshot.mock.invocationCallOrder[0]);
    s.receive(event(4)); s.receive(event(5)); s.receive(event(5)); s.requests[0].resolve(snapshot(4)); await settle();
    expect(s.updates.filter((u) => u.type === "event").map((u) => u.event.sequence)).toEqual([5]);
    s.receive(event(5)); expect(s.updates.filter((u) => u.type === "event")).toHaveLength(1);
    s.stop();
  });
  it("recovers global gaps and resets sequence after a backend restart", async () => {
    const s = setup(); s.requests[0].resolve(snapshot(50)); await settle();
    s.receive(event(52)); expect(s.requests).toHaveLength(2);
    s.requests[1].resolve(snapshot(52)); await settle();
    s.receive(event(1, "B")); s.requests[2].resolve(snapshot(1, "B")); await settle(); s.receive(event(2, "B"));
    expect(s.updates.filter((u) => u.type === "event").map((u) => u.event.sequence)).toEqual([2]); s.stop();
  });
  it("does not publish a partial snapshot if buffered events have a gap", async () => {
    const s = setup(); s.receive(event(3)); s.requests[0].resolve(snapshot(1)); await settle();
    expect(s.updates.some((u) => u.type === "snapshot")).toBe(false);
    await vi.advanceTimersByTimeAsync(1000); s.requests[1].resolve(snapshot(3)); await settle();
    expect(s.updates.filter((u) => u.type === "snapshot")).toHaveLength(1); s.stop();
  });
  it("bounds stalled recovery, then retries from saved state without executing work", async () => {
    const s = setup(); for (let i = 1; i <= 600; i++) s.receive(event(i));
    s.requests[0].resolve(snapshot(0)); await settle();
    expect(s.updates.some((u) => u.type === "snapshot")).toBe(false);
    await vi.advanceTimersByTimeAsync(1000); s.requests[1].resolve(snapshot(600)); await settle();
    expect(s.updates.at(-1)).toEqual({ type: "status", status: "connected" }); s.stop();
  });
  it("uses health watermarks to detect lost final events while quiet chats stay connected", async () => {
    const s = setup(); s.requests[0].resolve(snapshot(0)); await settle();
    await vi.advanceTimersByTimeAsync(15000); expect(s.requests).toHaveLength(1);
    s.api.getRuntimeHealth.mockResolvedValue({ runtimeId: "A", sequence: 1 });
    await vi.advanceTimersByTimeAsync(15000); expect(s.requests).toHaveLength(2); s.stop();
  });
  it("ignores late responses after unmount and clears retries and subscriptions", async () => {
    const s = setup(); s.stop(); const count = s.updates.length;
    s.requests[0].resolve(snapshot(0)); await settle(); await vi.advanceTimersByTimeAsync(60000);
    expect(s.updates).toHaveLength(count); expect(s.unsub).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("times out an unresponsive backend and ignores its eventual stale response", async () => {
    const s = setup(); await vi.advanceTimersByTimeAsync(6000); expect(s.requests).toHaveLength(2);
    s.requests[1].resolve(snapshot(4)); await settle(); s.requests[0].resolve(snapshot(0)); await settle();
    expect(s.updates.filter((u) => u.type === "snapshot").map((u) => u.value.sequence)).toEqual([4]); s.stop();
  });
});
