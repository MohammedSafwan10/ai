import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalSessionManager } from "../src/main/terminal/sessionManager";

class FixtureSession {
  readonly kind = "process" as const;
  readonly tty = false;
  readonly pid = 123;
  write = vi.fn();
  closeStdin = vi.fn();
  resize = () => true;
  terminate = vi.fn(() => this.finish(null));
  private stdout: (chunk: string) => void = () => {};
  private stderr: (chunk: string) => void = () => {};
  private closed: (code: number | null) => void = () => {};
  private once = new Set<() => void>();
  onStdout(listener: (chunk: Buffer | string) => void) { this.stdout = listener; }
  onStderr(listener: (chunk: Buffer | string) => void) { this.stderr = listener; }
  onError(_listener: (error: Error) => void) {}
  onClose(listener: (code: number | null) => void) { this.closed = listener; }
  onceClose(listener: () => void) { this.once.add(listener); }
  offClose(listener: () => void) { this.once.delete(listener); }
  output(text: string, stream = "stdout") { (stream === "stdout" ? this.stdout : this.stderr)(text); }
  finish(code: number | null) { this.closed(code); for (const listener of [...this.once]) listener(); }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

const fixture = () => {
  const sessions: FixtureSession[] = [];
  const manager = new TerminalSessionManager({ kind: "process", spawn: () => { const session = new FixtureSession(); sessions.push(session); return session; } });
  const start = async () => {
    const result = manager.execCommand({ cwd: process.cwd(), argv: ["fixture-only"], signal: new AbortController().signal, yieldTimeMs: 250, onOutput: () => {} });
    await vi.advanceTimersByTimeAsync(250);
    return { result: await result, session: sessions.at(-1)! };
  };
  const poll = (processId: number, extra: { input?: string; signal?: AbortSignal; yieldTimeMs?: number; maxOutputChars?: number } = {}) =>
    manager.writeStdin({ processId, signal: new AbortController().signal, yieldTimeMs: 250, onOutput: () => {}, ...extra });
  return { manager, start, poll };
};

describe("terminal continuation boundaries", () => {
  it("consumes final unread output once, preserves both streams and retains nonzero exit failure on late polls", async () => {
    const { manager, start, poll } = fixture();
    const { result, session } = await start();
    session.output("late stdout\n"); session.output("late stderr\n", "stderr");
    session.finish(7);
    const first = await poll(result.sessionId!);
    expect(first).toMatchObject({ success: false, running: false, exitCode: 7, stdout: "late stdout\n", stderr: "late stderr\n" });
    expect(first.output).toContain("late stdout"); expect(first.output).toContain("late stderr");
    await vi.advanceTimersByTimeAsync(10000);
    const second = await poll(result.sessionId!);
    expect(second).toMatchObject({ success: false, exitCode: 7, output: "", stdout: "", stderr: "", processDurationMs: first.processDurationMs });
    expect(manager.readSession(result.sessionId!).output).toContain("late stdout");
    expect(manager.readSession(result.sessionId!).output).toContain("late stderr");
  });

  it("never replays consumed output or a stale stream while a session is running", async () => {
    const { start, poll } = fixture(); const { result, session } = await start();
    session.output(`first stdout\n${"x".repeat(16)}`);
    const first = poll(result.sessionId!); await vi.advanceTimersByTimeAsync(250);
    expect((await first).stdout).toBe("first stdout\n");
    const quiet = poll(result.sessionId!); await vi.advanceTimersByTimeAsync(250);
    expect(await quiet).toMatchObject({ output: "", stdout: "", stderr: "", running: true });
    session.output(`new stderr\n${"y".repeat(16)}`, "stderr");
    const next = poll(result.sessionId!); await vi.advanceTimersByTimeAsync(250);
    expect(await next).toMatchObject({ output: "new stderr\n", stdout: "", stderr: "new stderr\n" });
  });

  it("honors each poll budget, including after exit, without shrinking the retained history", async () => {
    const { manager, start, poll } = fixture(); const { result, session } = await start();
    const text = Array.from({ length: 500 }, (_, index) => `fixture-line-${index.toString().padStart(3, "0")}\n`).join("");
    session.output(text);
    const limited = poll(result.sessionId!, { maxOutputChars: 1000 }); await vi.advanceTimersByTimeAsync(250);
    const first = await limited;
    expect(first.omittedBytes).toBeGreaterThan(0); expect(first.output.length).toBeLessThan(1200);
    expect(first.output).toContain("fixture-line-000"); expect(first.output).not.toContain("fixture-line-250");
    expect(first.stdout.length).toBeLessThan(1200);
    expect(manager.readSession(result.sessionId!).output).toContain("fixture-line-250");
    session.output(text, "stderr"); session.finish(0);
    const final = await poll(result.sessionId!, { maxOutputChars: 500 });
    expect(final.output.length).toBeLessThan(700); expect(final.stderr.length).toBeLessThan(700); expect(final.omittedBytes).toBeGreaterThan(0);
    expect((await poll(result.sessionId!)).output).toBe("");
  });

  it("serializes reads and writes on one session while a different session remains independent", async () => {
    const { start, poll } = fixture(); const first = await start(); const other = await start();
    const pending = poll(first.result.sessionId!, { yieldTimeMs: 1000 });
    const queued = poll(first.result.sessionId!, { input: "after-first" });
    const independent = poll(other.result.sessionId!, { input: "other-session" });
    await vi.advanceTimersByTimeAsync(250);
    expect(first.session.write).not.toHaveBeenCalled();
    expect(other.session.write).toHaveBeenCalledWith("other-session"); await independent;
    first.session.output(`single read\n${"x".repeat(16)}`);
    await vi.advanceTimersByTimeAsync(750);
    expect((await pending).output).toBe("single read\n");
    expect(first.session.write).toHaveBeenCalledWith("after-first");
    await vi.advanceTimersByTimeAsync(250);
    expect((await queued).output).toBe("");
  });

  it("cancels a queued write without sending it, stopping its session or blocking later writes", async () => {
    const { start, poll } = fixture(); const { result, session } = await start();
    const first = poll(result.sessionId!, { yieldTimeMs: 1000 });
    const controller = new AbortController();
    const blocked = poll(result.sessionId!, { input: "must-not-send", signal: controller.signal });
    const cancelled = expect(blocked).rejects.toMatchObject({ name: "AbortError" });
    const following = poll(result.sessionId!, { input: "send-later" });
    controller.abort(); await cancelled;
    expect(session.write).not.toHaveBeenCalled(); expect(session.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000); await first;
    expect(session.write).toHaveBeenCalledExactlyOnceWith("send-later");
    await vi.advanceTimersByTimeAsync(250); await following;
  });

  it("does not replay a final chunk when an exited-session poll overtakes queued live-session polls", async () => {
    const { start, poll } = fixture(); const { result, session } = await start();
    const first = poll(result.sessionId!, { yieldTimeMs: 1000 });
    const queued = poll(result.sessionId!);
    await vi.advanceTimersByTimeAsync(0);
    session.output("final chunk\n"); session.finish(0);
    const late = await poll(result.sessionId!);
    const results = [await first, await queued, late];
    expect(results.filter((item) => item.output.includes("final chunk"))).toHaveLength(1);
    expect((await poll(result.sessionId!)).output).toBe("");
  });

  it("preserves unread command output across resize and explicit stop management actions", async () => {
    const { manager, start, poll } = fixture(); const { result, session } = await start();
    session.output(`before resize\n${"x".repeat(16)}`);
    const resized = await manager.resizeProcess({ processId: result.sessionId!, rows: 40, cols: 100 });
    expect(resized.output).toContain("Resized");
    const pending = poll(result.sessionId!); await vi.advanceTimersByTimeAsync(250);
    expect((await pending).output).toBe("before resize\n");
    session.output("before stop\n");
    const stopped = await manager.stopProcess({ processId: result.sessionId! });
    expect(stopped.output).toContain("Stopped session");
    expect((await poll(result.sessionId!)).output).toContain("before stop");
    expect((await poll(result.sessionId!)).output).toBe("");
  });

  it("stops an already-written process when cancellation arrives during the close-stdin delay", async () => {
    const { manager, start } = fixture(); const { result, session } = await start();
    const controller = new AbortController();
    const operation = manager.writeStdin({ processId: result.sessionId!, input: "already-sent", closeStdin: true,
      signal: controller.signal, yieldTimeMs: 250, onOutput: () => {} });
    const rejected = expect(operation).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(0);
    expect(session.write).toHaveBeenCalledWith("already-sent");
    controller.abort();
    expect(session.terminate).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(75); await rejected;
    expect(session.closeStdin).not.toHaveBeenCalled();
  });
});
