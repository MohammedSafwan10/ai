import type { SecurityJobRecord } from "../../shared/securityWorkspace";

/** Uncertainty remains saved; repeating Stop must not repeat the same toast. */
export class KaliStopNotices {
  private readonly previous = new Map<string, string>();

  update(threadId: string, previouslyUnknown: Set<string>, unresolved: SecurityJobRecord[]) {
    if (!unresolved.length) { this.previous.delete(threadId); return null; }
    const signature = unresolved.map((job) => job.id).sort().join(",");
    const fresh = unresolved.filter((job) => !previouslyUnknown.has(job.id));
    if (!fresh.length && this.previous.get(threadId) === signature) return null;
    this.previous.delete(threadId);
    this.previous.set(threadId, signature);
    if (this.previous.size > 128) this.previous.delete(this.previous.keys().next().value!);
    return fresh.length ? {
      type: "notification.created" as const, tone: "error" as const,
      message: `Could not confirm that ${fresh.length} Kali job(s) stopped. Check Security details for their saved status.`,
    } : {
      type: "notification.created" as const, tone: "info" as const,
      message: `${unresolved.length} earlier Kali job(s) still have unconfirmed status. This does not confirm they are running. Check Security details.`,
    };
  }
}
