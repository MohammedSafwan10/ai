import type { ComposerDraftRecord } from "../../../shared/composerDraft";

export interface DraftStorage {
  getComposerDraft(threadId: string): Promise<ComposerDraftRecord | null>;
  saveComposerDraft(threadId: string, draft: ComposerDraftRecord): Promise<void>;
  clearComposerDraft(threadId: string, revision: string): Promise<void>;
}
const empty = (): ComposerDraftRecord => ({ revision: crypto.randomUUID(), text: "", attachments: [], contextMentions: [], pastedBlocks: [] });

/** A session survives UI unmount while imports/submission promises finish for its chat. */
export class ComposerDraftSession {
  private listeners = new Set<() => void>();
  private changed = false;
  private savedRevision?: string;
  private pendingClear?: string;
  private writes: Promise<void> = Promise.resolve();
  private snapshot = { draft: empty(), loading: true, error: "" };
  constructor(readonly threadId: string | null, private storage: DraftStorage) { void this.load(); }
  getSnapshot = () => this.snapshot;
  get hasSubscribers() { return this.listeners.size > 0; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<typeof this.snapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach((listener) => listener()); }
  load = async () => {
    if (!this.threadId) { this.publish({ loading: false }); return; }
    try {
      const saved = await this.storage.getComposerDraft(this.threadId);
      if (!this.changed) { this.savedRevision = saved?.revision; this.publish({ draft: saved ?? empty(), loading: false, error: "" }); }
    } catch { if (!this.changed) this.publish({ loading: true, error: "Could not restore this chat’s draft. Retry before editing." }); }
  };
  update<K extends keyof Omit<ComposerDraftRecord, "revision">>(key: K, update: ComposerDraftRecord[K] | ((previous: ComposerDraftRecord[K]) => ComposerDraftRecord[K])) {
    const previous = this.snapshot.draft;
    const value = typeof update === "function" ? (update as (previous: ComposerDraftRecord[K]) => ComposerDraftRecord[K])(previous[key]) : update;
    this.replace({ ...previous, [key]: value });
  }
  replace(draft: Omit<ComposerDraftRecord, "revision">) {
    this.changed = true;
    const next = { ...draft, revision: crypto.randomUUID() };
    this.publish({ draft: next, loading: false, error: "" });
    if (!this.threadId) return;
    this.writes = this.writes.then(async () => {
      // Coalesce synchronous edits, but always retain the latest complete snapshot.
      if (this.snapshot.draft.revision !== next.revision) return;
      try { await this.storage.saveComposerDraft(this.threadId!, next); this.savedRevision = next.revision; }
      catch { this.publish({ error: "Draft could not be saved. Keep this chat open and retry." }); }
    });
  }
  retry = () => { if (this.pendingClear) void this.accepted(this.pendingClear); else if (this.snapshot.loading) void this.load(); else this.replace(this.snapshot.draft); };
  async accepted(revision: string) {
    // An accepted send must not erase edits made while it was pending.
    await this.writes;
    if (this.threadId) {
      const storedRevision = this.snapshot.draft.revision === revision ? this.savedRevision ?? revision : revision;
      try { await this.storage.clearComposerDraft(this.threadId, storedRevision); if (this.savedRevision === storedRevision) this.savedRevision = undefined; this.pendingClear = undefined; }
      catch { this.pendingClear = revision; this.publish({ error: "Message was sent, but its saved draft could not be cleared. Do not send it again." }); return false; }
    }
    if (this.snapshot.draft.revision !== revision) return false;
    this.changed = true;
    this.publish({ draft: empty(), error: "" });
    return true;
  }
}

const caches = new WeakMap<DraftStorage, Map<string, ComposerDraftSession>>();
export function composerDraftSession(threadId: string | null, storage: DraftStorage) {
  if (!threadId) return new ComposerDraftSession(null, storage);
  let cache = caches.get(storage);
  if (!cache) { cache = new Map(); caches.set(storage, cache); }
  const session = cache.get(threadId) ?? new ComposerDraftSession(threadId, storage);
  cache.delete(threadId); cache.set(threadId, session);
  // Retain recent chat sessions so late imports update the current view on return.
  for (const [key, candidate] of cache) {
    if (cache.size <= 32) break;
    if (candidate !== session && !candidate.hasSubscribers) cache.delete(key);
  }
  return session;
}
