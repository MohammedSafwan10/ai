import { describe, expect, it } from "vitest";
import { KaliStopNotices } from "../src/main/kali/stopNotices";
import type { SecurityJobRecord } from "../src/shared/securityWorkspace";

const job = (id: string) => ({ id, state: "unknown" }) as SecurityJobRecord;
describe("Kali Stop notifications", () => {
  it("identifies earlier uncertainty and suppresses repeated Stop warnings", () => {
    const notices = new KaliStopNotices();
    const jobs = [job("old")];
    expect(notices.update("thread", new Set(["old"]), jobs)).toMatchObject({ tone: "info", message: expect.stringContaining("earlier") });
    expect(notices.update("thread", new Set(["old"]), jobs)).toBeNull();
    expect(jobs[0].state).toBe("unknown");
  });
  it("still reports newly unconfirmed work and resets after confirmation", () => {
    const notices = new KaliStopNotices();
    notices.update("thread", new Set(["old"]), [job("old")]);
    expect(notices.update("thread", new Set(["old"]), [job("old"), job("new")])).toMatchObject({ tone: "error", message: expect.stringContaining("1 Kali job") });
    expect(notices.update("thread", new Set(), [])).toBeNull();
    expect(notices.update("thread", new Set(), [job("new")])?.tone).toBe("error");
  });
  it("keeps threads independent and ignores returned ordering", () => {
    const notices = new KaliStopNotices();
    const jobs = [job("a"), job("b")];
    expect(notices.update("one", new Set(), jobs)).not.toBeNull();
    expect(notices.update("one", new Set(["a", "b"]), [...jobs].reverse())).toBeNull();
    expect(notices.update("two", new Set(), jobs)).not.toBeNull();
  });
  it("warns again when an earlier unknown job became active before another Stop", () => {
    const notices = new KaliStopNotices();
    notices.update("thread", new Set(["old"]), [job("old")]);
    expect(notices.update("thread", new Set(), [job("old")])?.tone).toBe("error");
    expect(notices.update("thread", new Set(["old"]), [job("old")])).toBeNull();
  });
});
