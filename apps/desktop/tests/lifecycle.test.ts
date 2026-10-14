import { describe, expect, it, vi } from "vitest";
import { interceptWindowClose, stopWorkForShutdown, unfinishedSecurityJobs } from "../src/main/lifecycle";
import type { SecurityJobRecord } from "../src/shared/securityWorkspace";

const job = (id: string, state: SecurityJobRecord["state"]): SecurityJobRecord => ({ id, remoteJobId: id, workspaceId: "workspace", threadId: "thread", environmentId: "kali", idempotencyKey: id, projectId: "workspace", state, sequence: 0, outputPreview: "", commandPreview: "test", exitCode: null, error: null, createdAt: 1, updatedAt: 1 });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; }); return { promise, resolve }; };

describe("application shutdown", () => {
  it("keeps the window present while a quit decision is pending or cancelled", async () => {
    const decision = deferred();
    let prevented = false;
    const hide = vi.fn();
    const quit = vi.fn(async () => { expect(prevented).toBe(true); await decision.promise; return false; });
    interceptWindowClose({ preventDefault: () => { prevented = true; } }, { exiting: false, keepRunningInTray: false, hide, requestQuit: quit });
    expect(prevented).toBe(true);
    expect(hide).not.toHaveBeenCalled();
    decision.resolve();
    await quit.mock.results[0].value;
    expect(hide).not.toHaveBeenCalled();
    const prevent = vi.fn();
    interceptWindowClose({ preventDefault: prevent }, { exiting: true, keepRunningInTray: false, hide, requestQuit: quit });
    expect(prevent).not.toHaveBeenCalled();
    expect(quit).toHaveBeenCalledOnce();
  });
  it("counts unconfirmed jobs as unfinished and excludes all terminal outcomes", () => {
    const states: SecurityJobRecord["state"][] = ["submitting", "queued", "running", "stop_requested", "unknown", "succeeded", "failed", "cancelled", "timed_out"];
    expect(unfinishedSecurityJobs(states.map((state) => job(state, state))).map((item) => item.state)).toEqual(states.slice(0, 5));
  });
  it("awaits both remote cancellation and local cleanup before returning", async () => {
    const remote = deferred(); const local = deferred(); const jobs = [job("one", "running")];
    const stop = vi.fn();
    const shutdown = stopWorkForShutdown({ stopLocal: stop, waitForLocalIdle: () => local.promise, listRemoteJobs: () => jobs, cancelRemoteJob: async () => { await remote.promise; jobs[0].state = "cancelled"; } });
    let settled = false; void shutdown.then(() => { settled = true; });
    await Promise.resolve(); expect(stop).toHaveBeenCalledOnce(); expect(settled).toBe(false);
    remote.resolve(); await new Promise<void>((resolve) => setImmediate(resolve)); expect(settled).toBe(false);
    local.resolve(); expect(await shutdown).toEqual([]);
  });
  it("also cancels a job submitted during aborted local cleanup", async () => {
    const jobs = [job("one", "running")];
    const cancel = vi.fn(async (id: string) => { jobs.find((item) => item.id === id)!.state = "cancelled"; });
    expect(await stopWorkForShutdown({ stopLocal: () => {}, waitForLocalIdle: async () => { jobs.push(job("late", "queued")); }, listRemoteJobs: () => jobs, cancelRemoteJob: cancel })).toEqual([]);
    expect(cancel.mock.calls.map(([id]) => id)).toEqual(["one", "late"]);
  });
  it("returns lost-connection jobs honestly and waits for other cancellations", async () => {
    const jobs = [job("lost", "unknown"), job("ok", "running")];
    const result = await stopWorkForShutdown({ stopLocal: () => {}, waitForLocalIdle: async () => {}, listRemoteJobs: () => jobs, cancelRemoteJob: async (id) => { if (id === "lost") throw new Error("offline"); jobs[1].state = "cancelled"; } });
    expect(result).toEqual([jobs[0]]);
  });
});
