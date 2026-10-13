import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { DesktopStore } from "../src/main/db/store";
import type { ThreadRecord } from "../src/shared/types";

it("repairs previously stored agent title markers on every load while preserving manual titles", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "privora-title-store-"));
  let store = new DesktopStore(directory);
  try {
    const agent = store.createThread(null);
    const fallback = store.createThread(null);
    const manual = store.createThread(null);
    store.close();
    const db = new DatabaseSync(path.join(directory, "privora-desktop.sqlite"));
    const save = (thread: ThreadRecord, titleSource: ThreadRecord["titleSource"], title: string) => db.prepare("UPDATE threads SET payload = ? WHERE id = ?").run(JSON.stringify({ ...thread, titleSource, title }), thread.id);
    save(agent, "agent", "Local runner fixture check</thread_title>");
    save(fallback, "fallback", "<thread_title>Local fixture validation</thread_title>");
    save(manual, "user", "Document </thread_title> syntax");
    db.close();
    store = new DesktopStore(directory);
    expect(store.getThread(agent.id)?.title).toBe("Local runner fixture check");
    expect(store.getThread(fallback.id)?.title).toBe("Local fixture validation");
    expect(store.getThread(manual.id)?.title).toBe("Document </thread_title> syntax");
    const titles = new Map(store.listThreads().map((thread) => [thread.id, thread.title]));
    expect(titles.get(agent.id)).toBe("Local runner fixture check");
    expect(titles.get(manual.id)).toBe("Document </thread_title> syntax");
    expect(store.snapshot(agent.id, null).threads.find((thread) => thread.id === agent.id)?.title).toBe("Local runner fixture check");
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
