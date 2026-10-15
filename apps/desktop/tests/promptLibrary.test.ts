import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopStore } from "../src/main/db/store";
import { canRunSavedPrompt, insertSavedPrompt, preparationPrompt } from "../src/shared/promptLibrary";

let directory = "";
let store: DesktopStore | undefined;
const open = () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "privora-prompts-"));
  store = new DesktopStore(directory);
  return store;
};
afterEach(() => { store?.close(); store = undefined; if (directory) fs.rmSync(directory, { recursive: true, force: true }); directory = ""; });

describe("saved prompt library", () => {
  it("seeds the exact preparation prompt once and preserves edits and deletion across restart", () => {
    let db = open();
    expect(db.listSavedPrompts()).toHaveLength(1);
    expect(db.listSavedPrompts()[0]).toMatchObject(preparationPrompt);
    db.savePrompt({ ...preparationPrompt, content: "My edited preparation prompt" });
    db.close(); store = new DesktopStore(directory); db = store;
    expect(db.listSavedPrompts()[0].content).toBe("My edited preparation prompt");
    db.deleteSavedPrompt(preparationPrompt.id!);
    db.close(); store = new DesktopStore(directory);
    expect(store.listSavedPrompts()).toEqual([]);
  });
  it("organizes reusable prompts independently of workspaces and rejects invalid inputs", () => {
    const db = open();
    const saved = db.savePrompt({ title: "Review changes", category: "Development", workspaceType: "development", content: "Review the current diff." });
    expect(saved.id).toBeTruthy();
    expect(db.listSavedPrompts().find((item) => item.id === saved.id)).toMatchObject(saved);
    expect(() => db.savePrompt({ ...saved, title: " " })).toThrow();
    expect(() => db.savePrompt({ ...saved, content: "x".repeat(32_001) })).toThrow();
    expect(db.listSavedPrompts().find((item) => item.id === saved.id)).toEqual(saved);
  });
  it("appends without discarding a draft and blocks direct run with any conflicting state", () => {
    expect(insertSavedPrompt("Existing work", "Saved prompt")).toBe("Existing work\n\nSaved prompt");
    expect(insertSavedPrompt("", "Saved prompt")).toBe("Saved prompt");
    const ready = { disabled: false, running: false, submitting: false, blocked: false, draft: "", attachments: 0, mentions: 0 };
    expect(canRunSavedPrompt(ready)).toBe(true);
    for (const patch of [{ disabled: true }, { running: true }, { submitting: true }, { blocked: true }, { draft: "Keep this" }, { attachments: 1 }, { mentions: 1 }]) {
      expect(canRunSavedPrompt({ ...ready, ...patch })).toBe(false);
    }
  });
});
