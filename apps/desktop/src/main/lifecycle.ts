import type { SecurityJobRecord } from "../shared/securityWorkspace";

export const interceptWindowClose = (event: { preventDefault(): void }, options: {
  exiting: boolean; keepRunningInTray: boolean; hide(): void; requestQuit(): Promise<unknown>;
}) => {
  if (options.exiting) return;
  event.preventDefault();
  if (options.keepRunningInTray) options.hide();
  else void options.requestQuit();
};

export const unfinishedSecurityJobs = (jobs: SecurityJobRecord[]) =>
  jobs.filter((job) => !["succeeded", "failed", "cancelled", "timed_out"].includes(job.state));

export const remoteTaskCounts = (jobs: SecurityJobRecord[]) => {
  const unfinished = unfinishedSecurityJobs(jobs);
  return { active: unfinished.filter((job) => job.state !== "unknown").length, unconfirmed: unfinished.filter((job) => job.state === "unknown").length };
};

export interface ShutdownWork {
  stopLocal(): void | Promise<void>;
  waitForLocalIdle(): Promise<void>;
  listRemoteJobs(): SecurityJobRecord[];
  cancelRemoteJob(id: string): Promise<unknown>;
}

/** Complete cancellation and local cleanup before any database close or updater exit. */
export const stopWorkForShutdown = async (work: ShutdownWork): Promise<SecurityJobRecord[]> => {
  await work.stopLocal();
  const attempted = new Set<string>();
  const cancelJobs = async () => {
    const jobs = unfinishedSecurityJobs(work.listRemoteJobs()).filter((job) => !attempted.has(job.id));
    jobs.forEach((job) => attempted.add(job.id));
    // A network failure is an unconfirmed job, not a reason to silently exit.
    await Promise.allSettled(jobs.map((job) => work.cancelRemoteJob(job.id)));
  };
  await cancelJobs();
  await work.waitForLocalIdle();
  // A submission may have completed after Stop was requested. Cancel it as well.
  await cancelJobs();
  return unfinishedSecurityJobs(work.listRemoteJobs());
};
