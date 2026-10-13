import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessageRecord } from "../src/shared/types";

const hooks = vi.hoisted(() => ({
  refs: [] as Array<{ current: unknown }>, refIndex: 0,
  states: [] as unknown[], stateIndex: 0,
  deps: [] as Array<readonly unknown[] | undefined>, effectIndex: 0,
  effects: [] as Array<() => unknown>, scrollToIndex: vi.fn(),
}));

vi.mock("react", () => ({
  useRef: (value: unknown) => hooks.refs[hooks.refIndex++] ||= { current: value },
  useState: (value: unknown) => {
    const index = hooks.stateIndex++;
    if (!(index in hooks.states)) hooks.states[index] = value;
    return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === "function" ? next(hooks.states[index]) : next; }];
  },
  useEffect: (effect: () => unknown, deps?: readonly unknown[]) => {
    const index = hooks.effectIndex++;
    const previous = hooks.deps[index];
    if (!previous || !deps || deps.some((item, position) => !Object.is(item, previous[position]))) hooks.effects.push(effect);
    hooks.deps[index] = deps;
  },
}));
vi.mock("@tanstack/react-virtual", () => ({ useVirtualizer: () => ({ scrollToIndex: hooks.scrollToIndex }) }));
import { useMessageAutoScroll } from "../src/renderer/features/chat/useMessageAutoScroll";

describe("message scroll ownership", () => {
  let frames: Map<number, FrameRequestCallback>;
  let frameId: number;
  const loadOlder = vi.fn(async () => false);
  const render = (threadId: string, count: number, latestActivityKey: string, settingsOpen = false) => {
    hooks.refIndex = 0; hooks.stateIndex = 0; hooks.effectIndex = 0;
    return useMessageAutoScroll({ activeThreadId: threadId, messages: Array.from({ length: count }, (_, index) => ({ id: `${threadId}-${index}` }) as ChatMessageRecord), latestActivityKey, hasOlder: false, historyLoading: false, onLoadOlder: loadOlder, settingsOpen });
  };
  const flush = () => {
    for (const effect of hooks.effects.splice(0)) effect();
    for (const [id, callback] of [...frames]) { frames.delete(id); callback(0); }
  };

  beforeEach(() => {
    hooks.refs = []; hooks.states = []; hooks.deps = []; hooks.effects = []; hooks.scrollToIndex.mockClear();
    frames = new Map(); frameId = 0;
    vi.stubGlobal("window", {
      requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; },
      cancelAnimationFrame: (id: number) => frames.delete(id), setTimeout: () => 1, clearTimeout: () => {},
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("preserves manual scroll during streaming but starts a different chat at its latest message", () => {
    const current = render("first", 2, "initial");
    current.scrollerRef.current = { scrollHeight: 1000, scrollTop: 600, clientHeight: 400 } as HTMLDivElement;
    flush(); hooks.scrollToIndex.mockClear();
    current.handleMessageWheel({ deltaY: -80 } as Parameters<typeof current.handleMessageWheel>[0]);
    render("first", 2, "next-delta"); flush();
    expect(hooks.scrollToIndex).not.toHaveBeenCalled();
    render("second", 1, "new-chat"); flush();
    expect(hooks.scrollToIndex).toHaveBeenCalledWith(0, expect.objectContaining({ align: "end" }));
  });

  it("does not reset the user's position when reopening settings in the same chat", () => {
    const current = render("first", 2, "initial");
    current.scrollerRef.current = { scrollHeight: 1000, scrollTop: 600, clientHeight: 400 } as HTMLDivElement;
    flush(); hooks.scrollToIndex.mockClear();
    current.handleMessageWheel({ deltaY: -80 } as Parameters<typeof current.handleMessageWheel>[0]);
    render("first", 2, "initial", true); flush();
    render("first", 2, "initial", false); flush();
    expect(hooks.scrollToIndex).not.toHaveBeenCalled();
  });
});
