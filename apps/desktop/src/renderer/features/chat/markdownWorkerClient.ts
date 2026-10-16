import type { MarkdownBlock } from "./markdownProjection";

export type MarkdownRequest = { type: "project"; key: string; generation: number; text: string; active: boolean } | { type: "dispose"; key: string };
export type MarkdownResponse = { key: string; generation: number; blocks?: MarkdownBlock[]; failed?: boolean };
type Pending = Extract<MarkdownRequest, { type: "project" }>;
type Consumer = { generation: number; receive: (blocks: MarkdownBlock[] | null) => void };

/** One shared worker, one in-flight job, and only the newest queued update per mounted message. */
export class MarkdownWorkerClient {
  private pending = new Map<string, Pending>();
  private consumers = new Map<string, Consumer>();
  private inFlight: Pending | null = null;
  private failed = false;
  constructor(private worker: Pick<Worker, "postMessage" | "terminate"> & {
    onmessage: ((event: MessageEvent<MarkdownResponse>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
  }) {
    worker.onmessage = ({ data }) => {
      if (this.inFlight?.key !== data.key || this.inFlight.generation !== data.generation) return;
      this.inFlight = null;
      const consumer = this.consumers.get(data.key);
      if (consumer?.generation === data.generation) consumer.receive(data.failed ? null : data.blocks || []);
      this.pump();
    };
    worker.onerror = () => this.fail();
  }
  update(key: string, text: string, active: boolean, receive: Consumer["receive"]) {
    if (this.failed) { receive(null); return; }
    const generation = (this.consumers.get(key)?.generation || 0) + 1;
    this.consumers.set(key, { generation, receive });
    this.pending.set(key, { type: "project", key, generation, text, active });
    this.pump();
  }
  dispose(key: string) {
    this.pending.delete(key); this.consumers.delete(key);
    if (!this.failed) {
      try { this.worker.postMessage({ type: "dispose", key } satisfies MarkdownRequest); }
      catch { this.fail(); }
    }
  }
  private pump() {
    if (this.failed || this.inFlight) return;
    const next = this.pending.values().next().value;
    if (!next) return;
    this.pending.delete(next.key); this.inFlight = next;
    try { this.worker.postMessage(next); } catch { this.fail(); }
  }
  private fail() {
    this.failed = true; this.inFlight = null; this.pending.clear(); this.worker.terminate();
    const consumers = [...this.consumers.values()];
    this.consumers.clear();
    for (const consumer of consumers) consumer.receive(null);
  }
}

let client: MarkdownWorkerClient | undefined;
export const markdownWorker = () => client ??= new MarkdownWorkerClient(new Worker(new URL("./markdown.worker.ts", import.meta.url), { type: "module" }));
