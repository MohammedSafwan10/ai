import { afterEach, describe, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({ cleanup: undefined as (() => void) | undefined }));
vi.mock("react", () => ({
  useRef: () => ({ current: null }),
  useLayoutEffect: (effect: () => () => void) => { fixture.cleanup = effect(); },
}));
import { useBrowserOcclusion } from "../src/renderer/features/browser/useBrowserOcclusion";
afterEach(() => { fixture.cleanup?.(); vi.unstubAllGlobals(); });
describe("browser modal observer", () => {
  it("keeps native views hidden until every visible modal closes", () => {
    const report = vi.fn(async (_value: boolean) => {});
    let modalCount = 0;
    let changed!: () => void;
    const observer = { observe: vi.fn(), disconnect: vi.fn() };
    vi.stubGlobal("window", { privoraDesktop: { setBrowserOccluded: report } });
    vi.stubGlobal("document", { body: {}, querySelectorAll: () => Array.from({ length: modalCount }, () => ({ getClientRects: () => [1] })) });
    vi.stubGlobal("MutationObserver", class { constructor(callback: () => void) { changed = callback; } observe = observer.observe; disconnect = observer.disconnect; });
    useBrowserOcclusion(false);
    modalCount = 2; changed();
    modalCount = 1; changed();
    expect(report.mock.calls.map(([value]) => value)).toEqual([false, true]);
    modalCount = 0; changed();
    expect(report.mock.calls.map(([value]) => value)).toEqual([false, true, false]);
    fixture.cleanup?.();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });
  it("keeps views suppressed for a closed pane even without a DOM dialog", () => {
    const report = vi.fn(async (_value: boolean) => {});
    vi.stubGlobal("window", { privoraDesktop: { setBrowserOccluded: report } });
    vi.stubGlobal("document", { body: {}, querySelectorAll: () => [] });
    vi.stubGlobal("MutationObserver", class { observe() {} disconnect() {} });
    useBrowserOcclusion(true);
    expect(report).toHaveBeenCalledExactlyOnceWith(true);
  });
});
