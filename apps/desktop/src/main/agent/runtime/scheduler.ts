import type { DesktopToolCall, ToolResult } from "../../../shared/types";

interface ScheduledToolExecution {
  call: DesktopToolCall;
  promise: Promise<ScheduledToolResult>;
}

interface ScheduledToolResult {
  call: DesktopToolCall;
  result: ToolResult;
  response: ToolResult;
}

export class ToolExecutionScheduler {
  private barrier: Promise<void> = Promise.resolve();
  private openParallel: Promise<unknown>[] = [];
  private entries: ScheduledToolExecution[] = [];

  schedule(call: DesktopToolCall, parallelSafe: boolean, runner: (call: DesktopToolCall) => Promise<ScheduledToolResult>) {
    const run = () => runner(call);
    let promise: Promise<ScheduledToolResult>;

    if (parallelSafe) {
      promise = this.barrier.then(run);
      this.openParallel.push(promise.catch(() => undefined));
    } else {
      const waitForReads = Promise.allSettled(this.openParallel);
      promise = this.barrier
        .then(() => waitForReads)
        .then(run);
      this.openParallel = [];
      this.barrier = promise.catch(() => undefined).then(() => undefined);
    }

    this.entries.push({ call, promise });
    return promise;
  }

  async drainOrdered() {
    const results: Array<{ id: string; name: string; response: ToolResult; call: DesktopToolCall; result: ToolResult }> = [];
    for (const entry of this.entries) {
      const scheduled = await entry.promise;
      results.push({
        id: scheduled.call.id,
        name: scheduled.call.name,
        response: scheduled.response,
        call: scheduled.call,
        result: scheduled.result,
      });
    }
    return results;
  }
}
