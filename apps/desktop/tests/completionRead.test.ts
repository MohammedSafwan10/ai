import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ChatMessageRecord, ThreadRecord } from "../src/shared/types";
const hooks = vi.hoisted(() => ({ effects: [] as Array<() => void | (() => void)> }));
vi.mock("react", () => ({ useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect) }));
import { useCompletionRead } from "../src/renderer/features/chat/useCompletionRead";

let focused: boolean; let modal: boolean; let atBottom: boolean; let endVisible: boolean;
let cleanup: (() => void) | void;
const markRead = vi.fn();
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(10_000); hooks.effects = [];
  focused = true; modal = false; atBottom = true; endVisible = true;
  markRead.mockReset(); markRead.mockResolvedValue(true);
  vi.stubGlobal("window", { setInterval, clearInterval, privoraDesktop: { markChatCompletionRead: markRead } });
  vi.stubGlobal("document", { hasFocus: () => focused, visibilityState: "visible", querySelector: () => modal ? {} : null });
  vi.stubGlobal("CSS", { escape: (value: string) => value });
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });
const start = () => {
  const scroller = { current: { getClientRects: () => [{}], clientHeight: 500, scrollHeight: 1000, get scrollTop() { return atBottom ? 500 : 0; }, getBoundingClientRect: () => ({ top: 0, bottom: 500 }), querySelector: () => ({ getBoundingClientRect: () => ({ bottom: endVisible ? 480 : -100 }) }) } };
  useCompletionRead({ id: "chat", unreadCompletionId: "answer" } as ThreadRecord, [{ id: "answer", status: "completed" } as ChatMessageRecord], scroller as never, false);
  cleanup = hooks.effects[0]();
};

it("does not clear while unfocused, in a modal, scrolled up, or with the result offscreen", async () => {
  focused = false; start(); await vi.advanceTimersByTimeAsync(2000); expect(markRead).not.toHaveBeenCalled();
  focused = true; modal = true; await vi.advanceTimersByTimeAsync(2000); expect(markRead).not.toHaveBeenCalled();
  modal = false; atBottom = false; await vi.advanceTimersByTimeAsync(2000); expect(markRead).not.toHaveBeenCalled();
  atBottom = true; endVisible = false; await vi.advanceTimersByTimeAsync(2000); expect(markRead).not.toHaveBeenCalled();
  endVisible = true; await vi.advanceTimersByTimeAsync(1500);
  expect(markRead).toHaveBeenCalledExactlyOnceWith({ threadId: "chat", completionId: "answer" });
});

it("retries if focus changed before the main process accepted the read", async () => {
  markRead.mockResolvedValueOnce(false).mockResolvedValue(true); start();
  await vi.advanceTimersByTimeAsync(3500);
  expect(markRead).toHaveBeenCalledTimes(2);
});
