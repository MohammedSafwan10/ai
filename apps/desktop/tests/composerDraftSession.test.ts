import { describe, expect, it, vi } from "vitest";
import { ComposerDraftSession, composerDraftSession, type DraftStorage } from "../src/renderer/features/chat/composerDraftSession";
import type { ComposerDraftRecord } from "../src/shared/composerDraft";

const fixture = () => {
  const records = new Map<string, ComposerDraftRecord>();
  const storage: DraftStorage = {
    getComposerDraft: vi.fn(async (id) => structuredClone(records.get(id) ?? null)),
    saveComposerDraft: vi.fn(async (id, draft) => { records.set(id, structuredClone(draft)); }),
    clearComposerDraft: vi.fn(async (id, revision) => { if (records.get(id)?.revision === revision) records.delete(id); }),
  };
  return { records, storage };
};
const ready = async (session: ComposerDraftSession) => vi.waitFor(() => expect(session.getSnapshot().loading).toBe(false));

describe("persistent composer draft session", () => {
  it("restores exact drafts across new sessions and isolates chats", async () => {
    const { records, storage } = fixture(); const a = new ComposerDraftSession("a", storage); await ready(a);
    a.update("text", "Unsent\n  exact spacing");
    a.update("pastedBlocks", [{ id: "paste", label: "Pasted", text: "long paste", createdAt: 1 }]);
    await vi.waitFor(() => expect(records.get("a")?.pastedBlocks).toHaveLength(1));
    const b = new ComposerDraftSession("b", storage); await ready(b); expect(b.getSnapshot().draft.text).toBe("");
    const restored = new ComposerDraftSession("a", storage); await ready(restored);
    expect(restored.getSnapshot().draft.text).toBe("Unsent\n  exact spacing"); expect(restored.getSnapshot().draft.pastedBlocks[0].text).toBe("long paste");
  });
  it("keeps newer edits when an earlier send completes and clears only an accepted version", async () => {
    const { records, storage } = fixture(); const session = new ComposerDraftSession("a", storage); await ready(session);
    session.update("text", "send me"); const sent = session.getSnapshot().draft.revision;
    session.update("text", "new work typed during send");
    expect(await session.accepted(sent)).toBe(false);
    expect(records.get("a")?.text).toBe("new work typed during send");
    expect(await session.accepted(session.getSnapshot().draft.revision)).toBe(true);
    expect(records.has("a")).toBe(false); expect(session.getSnapshot().draft.text).toBe("");
  });
  it("retains a late attachment import when the user switches away and returns", async () => {
    const { storage } = fixture(); const a = composerDraftSession("a", storage); await ready(a);
    composerDraftSession("b", storage);
    const returned = composerDraftSession("a", storage); expect(returned).toBe(a);
    a.update("attachments", [{ id: "image", name: "test.png", artifactId: "image.bin", url: "privora-attachment://image.bin", mimeType: "image/png", size: 4, createdAt: 1 }]);
    expect(returned.getSnapshot().draft.attachments[0].name).toBe("test.png");
  });
  it("does not overwrite restored data on a read failure and keeps unsaved text after a save failure", async () => {
    const { storage } = fixture(); vi.mocked(storage.getComposerDraft).mockRejectedValueOnce(new Error("offline"));
    const session = new ComposerDraftSession("a", storage);
    await vi.waitFor(() => expect(session.getSnapshot().error).toContain("restore"));
    expect(storage.saveComposerDraft).not.toHaveBeenCalled();
    session.retry(); await ready(session);
    vi.mocked(storage.saveComposerDraft).mockRejectedValueOnce(new Error("disk full"));
    session.update("text", "do not lose this");
    await vi.waitFor(() => expect(session.getSnapshot().error).toContain("could not be saved"));
    expect(session.getSnapshot().draft.text).toBe("do not lose this");
  });
  it("does not let delayed hydration overwrite an explicitly restored edit", async () => {
    const { storage } = fixture(); let release!: (value: ComposerDraftRecord | null) => void;
    vi.mocked(storage.getComposerDraft).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const session = new ComposerDraftSession("a", storage); session.update("text", "edited message");
    release(null); await Promise.resolve();
    expect(session.getSnapshot().draft.text).toBe("edited message");
  });
  it("retries failed draft clearing without saving an already-sent prompt again", async () => {
    const { records, storage } = fixture(); const session = new ComposerDraftSession("a", storage); await ready(session);
    session.update("text", "sent prompt");
    vi.mocked(storage.clearComposerDraft).mockRejectedValueOnce(new Error("busy"));
    expect(await session.accepted(session.getSnapshot().draft.revision)).toBe(false);
    session.retry();
    await vi.waitFor(() => expect(session.getSnapshot().draft.text).toBe(""));
    expect(records.has("a")).toBe(false);
  });
});
