import type { AppSnapshot, PrivoraEventEnvelope, RequestUserInputRequestRecord } from "../../shared/types";

export type SyncSnapshot = { runtimeId: string; sequence: number; snapshot: AppSnapshot; pendingInputs: RequestUserInputRequestRecord[] };
export type ConnectionStatus = "checking" | "recovering" | "connected" | "reconnecting";
export type SyncUpdate = { type: "status"; status: ConnectionStatus } | { type: "snapshot"; value: SyncSnapshot } | { type: "event"; event: PrivoraEventEnvelope };
type Transport = {
  onPrivoraEvent: (callback: (event: PrivoraEventEnvelope) => void) => () => void;
  getSyncSnapshot: () => Promise<SyncSnapshot>;
  getRuntimeHealth: () => Promise<{ runtimeId: string; sequence: number }>;
};

/** One ordered stream for all desktop views. Recovery only reads state; it never repeats work. */
export class DesktopSync {
  private listeners = new Set<(update: SyncUpdate) => void>();
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private runtimeId = "";
  private sequence = 0;
  private pending: PrivoraEventEnvelope[] = [];
  private bytes = 0;
  private overflow = false;
  private recovering = false;
  private attempts = 0;
  private status: ConnectionStatus = "checking";
  constructor(private readonly api: Transport) {}

  subscribe(listener: (update: SyncUpdate) => void) {
    this.listeners.add(listener);
    listener({ type: "status", status: this.status });
    if (!this.unsubscribe) {
      this.unsubscribe = this.api.onPrivoraEvent(this.receive);
      void this.recover();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size) return;
      this.unsubscribe?.(); this.unsubscribe = undefined;
      clearTimeout(this.timer); this.generation++; this.recovering = false;
      this.pending = []; this.bytes = 0; this.runtimeId = ""; this.sequence = 0;
      this.status = "checking";
    };
  }
  private publish(update: SyncUpdate) { this.listeners.forEach((listener) => listener(update)); }
  private setStatus(status: ConnectionStatus) { this.status = status; this.publish({ type: "status", status }); }
  private receive = (event: PrivoraEventEnvelope) => {
    if (this.recovering) {
      if (this.overflow) return;
      this.bytes += JSON.stringify(event).length * 2;
      if (this.pending.length >= 512 || this.bytes > 4_000_000) { this.overflow = true; this.pending = []; return; }
      this.pending.push(event); return;
    }
    if (event.runtimeId !== this.runtimeId || event.sequence > this.sequence + 1) { void this.recover(); return; }
    if (event.sequence <= this.sequence) return;
    this.sequence = event.sequence;
    this.publish({ type: "event", event });
  };
  recover = async () => {
    if (!this.listeners.size || this.recovering) return;
    clearTimeout(this.timer);
    this.recovering = true; this.pending = []; this.bytes = 0; this.overflow = false;
    const generation = ++this.generation;
    this.setStatus(this.runtimeId ? "recovering" : this.attempts ? "reconnecting" : "checking");
    try {
      const value = await withDeadline(this.api.getSyncSnapshot());
      if (generation !== this.generation) return;
      if (this.overflow || this.pending.some((event) => event.runtimeId !== value.runtimeId)) throw new Error("State changed during recovery");
      const pending = this.pending.filter((event) => event.sequence > value.sequence).sort((a, b) => a.sequence - b.sequence);
      let sequence = value.sequence;
      for (const event of pending) {
        if (event.sequence <= sequence) continue;
        if (event.sequence !== sequence + 1) throw new Error("Missing events during recovery");
        sequence = event.sequence;
      }
      this.runtimeId = value.runtimeId; this.sequence = value.sequence;
      this.publish({ type: "snapshot", value });
      this.recovering = false; this.pending = []; this.bytes = 0; this.attempts = 0;
      pending.forEach(this.receive);
      this.setStatus("connected"); this.scheduleHealth();
    } catch {
      if (generation !== this.generation) return;
      // Continue buffering until the next snapshot starts; never apply partial recovery.
      this.setStatus("reconnecting");
      const delay = Math.min(15_000, 1000 * 2 ** Math.min(this.attempts++, 4));
      this.timer = setTimeout(() => { this.recovering = false; void this.recover(); }, delay);
    }
  };
  private scheduleHealth() { this.timer = setTimeout(() => void this.check(), 15_000); }
  private async check() {
    const generation = this.generation;
    try {
      const health = await withDeadline(this.api.getRuntimeHealth());
      if (generation !== this.generation || !this.listeners.size) return;
      if (health.runtimeId !== this.runtimeId || health.sequence !== this.sequence) { void this.recover(); return; }
      this.scheduleHealth();
    } catch { if (generation === this.generation) void this.recover(); }
  }
}

export async function withDeadline<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Desktop did not respond")), 5000); })]); }
  finally { clearTimeout(timer); }
}
let shared: DesktopSync | undefined;
export const getDesktopSync = () => shared ||= new DesktopSync(window.privoraDesktop);
