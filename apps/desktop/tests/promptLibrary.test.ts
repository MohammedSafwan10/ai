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
  it("paginates a large library without returning prompt bodies and keeps search literal", () => {
    const db = open();
    for (let index = 0; index < 1200; index++) db.savePrompt({ title: `Prompt ${String(index).padStart(4, "0")}`, category: index % 2 ? "Security" : "Development", workspaceType: index % 2 ? "security" : "development", content: `Long stored instructions ${"x".repeat(2000)} ${index === 800 ? "specific needle 10%_literal" : ""}`, pinned: index === 900 });
    const first = db.querySavedPrompts({ limit: 50, sort: "name" });
    expect(first.total).toBe(1201);
    expect(first.items).toHaveLength(50);
    expect(first.items[0].title).toBe("Prompt 0900");
    expect(first.items.every((item) => !("content" in item))).toBe(true);
    const second = db.querySavedPrompts({ limit: 50, offset: 50, sort: "name" });
    expect(second.items.some((item) => first.items.some((other) => other.id === item.id))).toBe(false);
    const match = db.querySavedPrompts({ query: "10%_literal" });
    expect(match.total).toBe(1);
    expect(match.items[0].title).toBe("Prompt 0800");
    expect(db.getSavedPrompt(match.items[0].id)?.content).toContain("specific needle");
    expect(db.querySavedPrompts({ scope: "security", category: "Development" }).total).toBe(0);
    expect(db.querySavedPrompts({ pinnedOnly: true }).items).toHaveLength(1);
    expect(db.querySavedPrompts({ query: "' OR 1=1 --" }).total).toBe(0);
    expect(() => db.querySavedPrompts({ limit: 1000 })).toThrow();
  });
  it("renames, pins and moves prompts without changing their text or identity", () => {
    const db = open();
    const original = db.listSavedPrompts()[0];
    const updated = db.updatePromptMetadata({ id: original.id, title: "Preparation", pinned: true, category: "Favorites" });
    expect(updated).toMatchObject({ id: original.id, content: original.content, createdAt: original.createdAt, title: "Preparation", pinned: true, category: "Favorites" });
    db.close(); store = new DesktopStore(directory);
    expect(store.querySavedPrompts({ pinnedOnly: true }).items[0].id).toBe(original.id);
    expect(store.getSavedPrompt(original.id)?.title).toBe("Preparation");
    expect(() => store!.updatePromptMetadata({ id: "missing", title: "Name" })).toThrow("not found");
    expect(() => store!.updatePromptMetadata({ id: original.id, title: " " })).toThrow();
  });
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
