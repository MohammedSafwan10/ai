import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NotesStore } from "../src/main/notes/NotesStore";

const tempRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), "privora-notes-"));

describe("NotesStore", () => {
  it("creates global and workspace drafts with scoped listing", () => {
    const store = new NotesStore(tempRoot());
    const global = store.create({ scope: "global", title: "Global", content: "shared" });
    const workspace = store.create({ scope: "workspace", workspaceId: "w1", title: "Workspace", content: "local" });

    expect(store.list("w1").notes.map((note) => note.id)).toEqual(expect.arrayContaining([global.note.id, workspace.note.id]));
    expect(store.list("w2").notes.map((note) => note.id)).toContain(global.note.id);
    expect(store.list("w2").notes.map((note) => note.id)).not.toContain(workspace.note.id);
  });

  it("autosaves drafts separately from the main index", () => {
    const root = tempRoot();
    const store = new NotesStore(root);
    const note = store.create({ scope: "global", title: "Draft", content: "one" });
    store.update({ noteId: note.note.id, content: "two" });

    const reopened = new NotesStore(root).open({ noteId: note.note.id });
    expect(reopened.content).toBe("two");
    expect(fs.existsSync(path.join(root, "notes", "drafts", `${note.note.id}.md`))).toBe(true);
  });

  it("opens and saves file-backed notes without deleting the external file record", () => {
    const root = tempRoot();
    const external = path.join(root, "note.md");
    fs.writeFileSync(external, "hello", "utf8");
    const store = new NotesStore(root);

    const opened = store.openFile({ filePath: external, workspaceId: "w1" });
    expect(opened.content).toBe("hello");

    store.update({ noteId: opened.note.id, workspaceId: "w1", content: "changed" });
    expect(fs.readFileSync(external, "utf8")).toBe("hello");
    const saved = store.save({ noteId: opened.note.id, workspaceId: "w1" });
    expect(saved.note.dirty).toBe(false);
    expect(fs.readFileSync(external, "utf8")).toBe("changed");
  });

  it("converts drafts to file-backed notes with save as", () => {
    const root = tempRoot();
    const target = path.join(root, "saved.txt");
    const store = new NotesStore(root);
    const note = store.create({ scope: "workspace", workspaceId: "w1", title: "Save me", content: "saved text" });

    const saved = store.save({ noteId: note.note.id, workspaceId: "w1", filePath: target });
    expect(saved.note.scope).toBe("file");
    expect(saved.note.filePath).toBe(target);
    expect(fs.readFileSync(target, "utf8")).toBe("saved text");
  });

  it("permanently deletes an external file only through the explicit file operation", () => {
    const root = tempRoot();
    const external = path.join(root, "delete-me.md");
    fs.writeFileSync(external, "temporary", "utf8");
    const store = new NotesStore(root);
    const opened = store.openFile({ filePath: external });

    store.deleteExternalFile(opened.note.id);

    expect(fs.existsSync(external)).toBe(false);
  });

  it("rejects binary files", () => {
    const root = tempRoot();
    const binary = path.join(root, "asset.bin");
    fs.writeFileSync(binary, Buffer.from([0, 1, 2, 3]));
    const store = new NotesStore(root);
    expect(() => store.openFile({ filePath: binary })).toThrow(/binary/i);
  });

  it("reports large note modes", () => {
    const root = tempRoot();
    const store = new NotesStore(root);
    const note = store.create({ scope: "global", title: "Large", content: "x".repeat((10 * 1024 * 1024) + 4) });
    const opened = store.open({ noteId: note.note.id });
    expect(opened.largeMode).toBe("large");
    expect(opened.readonly).toBe(false);
  });
});
