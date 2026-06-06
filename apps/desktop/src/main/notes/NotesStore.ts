import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { TextDecoder } from "node:util";
import type {
  NoteLargeMode,
  NoteOpenResult,
  NoteRecord,
  NoteScope,
  NotesPanelStateRecord,
} from "../../shared/types";

const NORMAL_LIMIT_BYTES = 10 * 1024 * 1024;
const READONLY_LIMIT_BYTES = 25 * 1024 * 1024;
const PREVIEW_LIMIT_BYTES = 25 * 1024 * 1024;
const EXCERPT_LIMIT = 180;
const GLOBAL_PANEL_KEY = "__global__";

interface NotesIndexFile {
  notes: NoteRecord[];
  panels: Array<{ key: string; openNoteIds: string[]; activeNoteId?: string }>;
}

const now = () => Date.now();

export class NotesStore {
  private data: NotesIndexFile;

  constructor(private userDataPath: string) {
    fs.mkdirSync(this.notesRoot(), { recursive: true });
    fs.mkdirSync(this.draftsRoot(), { recursive: true });
    this.data = this.readIndex();
    this.writeIndex();
  }

  list(workspaceId?: string, query = ""): NotesPanelStateRecord {
    const normalizedQuery = query.trim().toLowerCase();
    const visible = this.data.notes
      .filter((note) => this.visibleInWorkspace(note, workspaceId))
      .map((note) => ({ ...note, excerpt: this.excerpt(note) }))
      .filter((note) => {
        if (!normalizedQuery) return true;
        return [note.title, note.filePath, note.excerpt].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
      })
      .sort(compareNotes);
    const panel = this.panel(workspaceId);
    const openTabs = panel.openNoteIds
      .map((id) => this.get(id))
      .filter((note): note is NoteRecord => Boolean(note))
      .filter((note) => this.visibleInWorkspace(note, workspaceId));
    return {
      workspaceId,
      notes: visible,
      openTabs,
      activeNoteId: openTabs.some((note) => note.id === panel.activeNoteId) ? panel.activeNoteId : openTabs[0]?.id,
    };
  }

  create(input: { workspaceId?: string; scope: NoteScope; title?: string; content?: string; pinned?: boolean }): NoteOpenResult {
    if (input.scope === "workspace" && !input.workspaceId) throw new Error("Workspace notes need an active workspace.");
    if (input.scope === "file") throw new Error("Use Open file or Save As to create a file-backed note.");
    const createdAt = now();
    const id = randomUUID();
    const content = input.content || "";
    const note: NoteRecord = {
      id,
      scope: input.scope,
      workspaceId: input.scope === "workspace" ? input.workspaceId : undefined,
      title: sanitizeTitle(input.title || "Untitled note"),
      dirty: false,
      pinned: input.pinned === true,
      createdAt,
      updatedAt: createdAt,
      lastOpenedAt: createdAt,
      sizeBytes: Buffer.byteLength(content, "utf8"),
    };
    this.writeDraft(id, content);
    this.data.notes.push(note);
    this.openTab(input.workspaceId, id);
    this.writeIndex();
    return this.open({ noteId: id, workspaceId: input.workspaceId });
  }

  open(input: { noteId: string; workspaceId?: string }): NoteOpenResult {
    const note = this.require(input.noteId);
    note.lastOpenedAt = now();
    this.openTab(input.workspaceId, note.id);
    this.writeIndex();
    return this.openResult(note);
  }

  openFile(input: { filePath: string; workspaceId?: string }): NoteOpenResult {
    const absolutePath = normalizeAbsolutePath(input.filePath);
    this.assertSupportedPath(absolutePath);
    const content = readTextFile(absolutePath);
    const stat = fs.statSync(absolutePath);
    const existing = this.data.notes.find((note) => note.scope === "file" && note.filePath === absolutePath);
    const timestamp = now();
    const note = existing || {
      id: randomUUID(),
      scope: "file" as const,
      title: path.basename(absolutePath),
      filePath: absolutePath,
      dirty: false,
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastOpenedAt: timestamp,
      sizeBytes: stat.size,
    };
    note.title = note.title || path.basename(absolutePath);
    note.filePath = absolutePath;
    note.dirty = false;
    note.updatedAt = timestamp;
    note.lastOpenedAt = timestamp;
    note.sizeBytes = stat.size;
    this.writeDraft(note.id, content);
    if (!existing) this.data.notes.push(note);
    this.openTab(input.workspaceId, note.id);
    this.writeIndex();
    return this.openResult(note);
  }

  update(input: { noteId: string; workspaceId?: string; title?: string; content?: string; scope?: "global" | "workspace"; pinned?: boolean }): NoteOpenResult {
    const note = this.require(input.noteId);
    if (input.scope) {
      if (input.scope === "workspace" && !input.workspaceId) throw new Error("Workspace notes need an active workspace.");
      if (note.scope !== "file") {
        note.scope = input.scope;
        note.workspaceId = input.scope === "workspace" ? input.workspaceId : undefined;
      }
    }
    if (typeof input.title === "string") note.title = sanitizeTitle(input.title);
    if (typeof input.pinned === "boolean") note.pinned = input.pinned;
    if (typeof input.content === "string") {
      if (Buffer.byteLength(input.content, "utf8") > READONLY_LIMIT_BYTES) throw new Error("This note is too large to edit inside Privora.");
      this.writeDraft(note.id, input.content);
      note.sizeBytes = Buffer.byteLength(input.content, "utf8");
      note.dirty = note.scope === "file";
    }
    note.updatedAt = now();
    this.writeIndex();
    return this.open({ noteId: note.id, workspaceId: input.workspaceId });
  }

  save(input: { noteId: string; workspaceId?: string; filePath?: string }): NoteOpenResult {
    const note = this.require(input.noteId);
    const content = this.readDraft(note.id);
    const targetPath = input.filePath ? normalizeAbsolutePath(input.filePath) : note.filePath;
    if (targetPath) {
      this.assertSupportedPath(targetPath);
      atomicWrite(targetPath, content);
      const timestamp = now();
      note.scope = "file";
      note.workspaceId = undefined;
      note.filePath = targetPath;
      note.title = note.title && note.title !== "Untitled note" ? note.title : path.basename(targetPath);
      note.dirty = false;
      note.sizeBytes = Buffer.byteLength(content, "utf8");
      note.updatedAt = timestamp;
      note.lastOpenedAt = timestamp;
    } else {
      note.dirty = false;
      note.sizeBytes = Buffer.byteLength(content, "utf8");
      note.updatedAt = now();
    }
    this.writeIndex();
    return this.open({ noteId: note.id, workspaceId: input.workspaceId });
  }

  rename(input: { noteId: string; workspaceId?: string; title: string }): NoteOpenResult {
    return this.update({ noteId: input.noteId, workspaceId: input.workspaceId, title: input.title });
  }

  delete(input: { noteId: string; workspaceId?: string }) {
    const note = this.require(input.noteId);
    this.data.notes = this.data.notes.filter((candidate) => candidate.id !== note.id);
    this.data.panels.forEach((panel) => {
      panel.openNoteIds = panel.openNoteIds.filter((id) => id !== note.id);
      if (panel.activeNoteId === note.id) panel.activeNoteId = panel.openNoteIds[0];
    });
    fs.rmSync(this.draftPath(note.id), { force: true });
    this.writeIndex();
    return this.list(input.workspaceId);
  }

  deleteExternalFile(noteId: string) {
    const note = this.require(noteId);
    if (!note.filePath) throw new Error("Only file-backed notes have an external file.");
    this.assertSupportedPath(note.filePath);
    const stat = fs.lstatSync(note.filePath);
    if (!stat.isFile()) throw new Error("Privora Notes only permanently deletes regular files.");
    fs.unlinkSync(note.filePath);
  }

  closeTab(input: { noteId: string; workspaceId?: string }): NotesPanelStateRecord {
    const panel = this.panel(input.workspaceId);
    panel.openNoteIds = panel.openNoteIds.filter((id) => id !== input.noteId);
    if (panel.activeNoteId === input.noteId) panel.activeNoteId = panel.openNoteIds[0];
    this.writeIndex();
    return this.list(input.workspaceId);
  }

  private openResult(note: NoteRecord): NoteOpenResult {
    const content = this.readDraft(note.id);
    const size = Buffer.byteLength(content, "utf8");
    const largeMode: NoteLargeMode = size > READONLY_LIMIT_BYTES ? "readonly" : size > NORMAL_LIMIT_BYTES ? "large" : "normal";
    const readonly = largeMode === "readonly";
    return {
      note: { ...note, sizeBytes: size, excerpt: summarize(content) },
      content: size > PREVIEW_LIMIT_BYTES ? content.slice(0, PREVIEW_LIMIT_BYTES) : content,
      largeMode,
      readonly,
      truncated: size > PREVIEW_LIMIT_BYTES,
      warning: largeMode === "large"
        ? "Large note mode: some editor features are reduced for smooth typing."
        : largeMode === "readonly"
          ? "This note is too large to edit safely inside Privora."
          : undefined,
    };
  }

  private visibleInWorkspace(note: NoteRecord, workspaceId?: string) {
    return note.scope === "global" || note.scope === "file" || (note.scope === "workspace" && note.workspaceId === workspaceId);
  }

  private get(noteId: string) {
    return this.data.notes.find((note) => note.id === noteId) || null;
  }

  private require(noteId: string) {
    const note = this.get(noteId);
    if (!note) throw new Error("Note not found.");
    return note;
  }

  private panel(workspaceId?: string) {
    const key = workspaceId || GLOBAL_PANEL_KEY;
    let panel = this.data.panels.find((candidate) => candidate.key === key);
    if (!panel) {
      panel = { key, openNoteIds: [] };
      this.data.panels.push(panel);
    }
    return panel;
  }

  private openTab(workspaceId: string | undefined, noteId: string) {
    const panel = this.panel(workspaceId);
    panel.openNoteIds = [noteId, ...panel.openNoteIds.filter((id) => id !== noteId)].slice(0, 12);
    panel.activeNoteId = noteId;
  }

  private excerpt(note: NoteRecord) {
    return summarize(this.readDraft(note.id, 4096));
  }

  private readDraft(noteId: string, maxBytes?: number) {
    const filePath = this.draftPath(noteId);
    if (!fs.existsSync(filePath)) return "";
    const buffer = fs.readFileSync(filePath);
    return decodeText(maxBytes ? buffer.subarray(0, maxBytes) : buffer);
  }

  private writeDraft(noteId: string, content: string) {
    atomicWrite(this.draftPath(noteId), content);
  }

  private assertSupportedPath(filePath: string) {
    if (!path.isAbsolute(filePath)) throw new Error("Notes need an absolute file path.");
    const normalized = filePath.toLowerCase();
    const root = path.parse(filePath).root.toLowerCase();
    const protectedRoots = [
      path.join(root, "windows").toLowerCase(),
      path.join(root, "program files").toLowerCase(),
      path.join(root, "program files (x86)").toLowerCase(),
    ];
    if (protectedRoots.some((protectedRoot) => normalized === protectedRoot || normalized.startsWith(`${protectedRoot}${path.sep}`))) {
      throw new Error("Privora Notes will not write inside protected system folders.");
    }
  }

  private readIndex(): NotesIndexFile {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.indexPath(), "utf8")) as Partial<NotesIndexFile>;
      return {
        notes: Array.isArray(parsed.notes) ? parsed.notes.map(normalizeNote).filter(Boolean) as NoteRecord[] : [],
        panels: Array.isArray(parsed.panels) ? parsed.panels.map(normalizePanel).filter(Boolean) as NotesIndexFile["panels"] : [],
      };
    } catch {
      return { notes: [], panels: [] };
    }
  }

  private writeIndex() {
    atomicWrite(this.indexPath(), `${JSON.stringify(this.data, null, 2)}\n`);
  }

  private notesRoot() {
    return path.join(this.userDataPath, "notes");
  }

  private draftsRoot() {
    return path.join(this.notesRoot(), "drafts");
  }

  private indexPath() {
    return path.join(this.notesRoot(), "notes-index-v1.json");
  }

  private draftPath(noteId: string) {
    return path.join(this.draftsRoot(), `${noteId}.md`);
  }
}

const readTextFile = (filePath: string) => {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error("Choose a text file.");
  if (stat.size > PREVIEW_LIMIT_BYTES) {
    const buffer = fs.readFileSync(filePath).subarray(0, PREVIEW_LIMIT_BYTES);
    return decodeText(buffer);
  }
  return decodeText(fs.readFileSync(filePath));
};

const decodeText = (buffer: Buffer) => {
  if (buffer.includes(0)) throw new Error("Binary files cannot be opened as notes.");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new Error("This file is not valid UTF-8 text.");
  }
};

const atomicWrite = (filePath: string, content: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
};

const normalizeAbsolutePath = (filePath: string) => path.resolve(filePath);

const sanitizeTitle = (title: string) => {
  const cleaned = title.trim().replace(/\s+/g, " ").slice(0, 120);
  return cleaned || "Untitled note";
};

const summarize = (content: string) =>
  content.replace(/\s+/g, " ").trim().slice(0, EXCERPT_LIMIT);

const compareNotes = (a: NoteRecord, b: NoteRecord) =>
  Number(b.pinned) - Number(a.pinned) || b.lastOpenedAt - a.lastOpenedAt || b.updatedAt - a.updatedAt || a.title.localeCompare(b.title);

const normalizeNote = (note: Partial<NoteRecord>): NoteRecord | null => {
  if (!note.id || !note.title || !["global", "workspace", "file"].includes(String(note.scope))) return null;
  const timestamp = Number(note.updatedAt || note.createdAt || now());
  return {
    id: String(note.id),
    scope: note.scope as NoteScope,
    workspaceId: typeof note.workspaceId === "string" ? note.workspaceId : undefined,
    title: sanitizeTitle(String(note.title)),
    filePath: typeof note.filePath === "string" ? note.filePath : undefined,
    dirty: note.dirty === true,
    pinned: note.pinned === true,
    createdAt: Number(note.createdAt || timestamp),
    updatedAt: timestamp,
    lastOpenedAt: Number(note.lastOpenedAt || timestamp),
    sizeBytes: Number(note.sizeBytes || 0),
  };
};

const normalizePanel = (panel: { key?: unknown; openNoteIds?: unknown; activeNoteId?: unknown }) => {
  if (typeof panel.key !== "string") return null;
  return {
    key: panel.key,
    openNoteIds: Array.isArray(panel.openNoteIds) ? panel.openNoteIds.map(String).slice(0, 12) : [],
    activeNoteId: typeof panel.activeNoteId === "string" ? panel.activeNoteId : undefined,
  };
};
