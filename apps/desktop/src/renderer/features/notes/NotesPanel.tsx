import { useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Check, ExternalLink, FileText, FolderOpen, FolderSync, Globe2, HardDrive, MoreHorizontal, PanelRightClose, PanelRightOpen, Pin, PinOff, Plus, Save, Search, Trash2, X } from "lucide-react";
import clsx from "clsx";
import type { NoteOpenResult, NoteRecord, NotesPanelStateRecord, WorkspaceRecord } from "../../../shared/types";

loader.config({ monaco });

interface NotesPanelProps {
  workspace: WorkspaceRecord | null;
  active: boolean;
}

export function NotesPanel({ workspace, active }: NotesPanelProps) {
  const workspaceId = workspace?.id;
  const [state, setState] = useState<NotesPanelStateRecord>({ workspaceId, notes: [], openTabs: [] });
  const [activeNote, setActiveNote] = useState<NoteOpenResult | null>(null);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [listCollapsed, setListCollapsed] = useState(false);
  const [tabMenu, setTabMenu] = useState<{ noteId: string; x: number; y: number } | null>(null);
  const [listMenu, setListMenu] = useState<{ noteId: string; x: number; y: number } | null>(null);
  const latestContentRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const activeNoteId = activeNote?.note.id || state.activeNoteId;
  const grouped = useMemo(() => groupNotes(state.notes), [state.notes]);
  const orderedOpenTabs = useMemo(
    () => state.openTabs.map((note, index) => ({ note, index }))
      .sort((a, b) => Number(b.note.pinned) - Number(a.note.pinned) || a.index - b.index)
      .map(({ note }) => note),
    [state.openTabs],
  );
  const language = activeNote?.note.filePath ? languageForNote(activeNote.note.filePath) : "markdown";

  useEffect(() => {
    if (!active) return;
    void refresh();
  }, [active, workspaceId]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  useEffect(() => {
    if (!actionsOpen) return;
    const close = (event: MouseEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [actionsOpen]);

  useEffect(() => {
    if (!tabMenu && !listMenu) return;
    const close = () => {
      setTabMenu(null);
      setListMenu(null);
    };
    window.addEventListener("blur", close);
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("blur", close);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [listMenu, tabMenu]);

  async function refresh(query = filter) {
    const next = await window.privoraDesktop.listNotes({ workspaceId, query });
    setState(next);
    if (!activeNote && next.activeNoteId) {
      await openNote(next.activeNoteId);
    }
  }

  async function openNote(noteId: string) {
    await flushAutosave();
    const result = await window.privoraDesktop.openNote({ workspaceId, noteId });
    setActiveNote(result);
    latestContentRef.current = result.content;
    setStatus(result.warning || "");
    setRenaming(false);
    setActionsOpen(false);
    setState((current) => ({
      ...current,
      activeNoteId: result.note.id,
      openTabs: [result.note, ...current.openTabs.filter((note) => note.id !== result.note.id)],
    }));
  }

  async function createNote(scope: "global" | "workspace") {
    await flushAutosave();
    const result = await window.privoraDesktop.createNote({ workspaceId, scope, title: scope === "global" ? "Global note" : "Workspace note", content: "" });
    setActiveNote(result);
    latestContentRef.current = result.content;
    await refresh();
  }

  async function openFile() {
    await flushAutosave();
    const result = await window.privoraDesktop.openNoteFile({ workspaceId });
    if (!result) return;
    setActiveNote(result);
    latestContentRef.current = result.content;
    setStatus(result.warning || "");
    await refresh();
  }

  function scheduleAutosave(value: string) {
    latestContentRef.current = value;
    if (!activeNote || activeNote.readonly) return;
    setStatus("Unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void autosave();
    }, 800);
  }

  async function flushAutosave() {
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    await autosave();
  }

  async function autosave() {
    if (!activeNote || activeNote.readonly) return;
    saveTimerRef.current = null;
    const result = await window.privoraDesktop.updateNote({
      workspaceId,
      noteId: activeNote.note.id,
      content: latestContentRef.current,
    });
    setActiveNote(result);
    setStatus(result.note.scope === "file" ? "Unsaved file changes" : "Saved draft");
    await refresh();
  }

  async function save() {
    if (!activeNote) return;
    await flushAutosave();
    setSaving(true);
    try {
      const result = activeNote.note.filePath
        ? await window.privoraDesktop.saveNote({ workspaceId, noteId: activeNote.note.id })
        : await window.privoraDesktop.saveNoteAs({ workspaceId, noteId: activeNote.note.id });
      if (!result) return;
      setActiveNote(result);
      latestContentRef.current = result.content;
      setStatus("Saved");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function saveAs() {
    if (!activeNote) return;
    setActionsOpen(false);
    await flushAutosave();
    const result = await window.privoraDesktop.saveNoteAs({ workspaceId, noteId: activeNote.note.id });
    if (!result) return;
    setActiveNote(result);
    latestContentRef.current = result.content;
    setStatus("Saved");
    await refresh();
  }

  function beginRename() {
    if (!activeNote) return;
    setRenameValue(activeNote.note.title);
    setRenaming(true);
    setActionsOpen(false);
  }

  async function beginRenameFor(noteId: string) {
    await openNote(noteId);
    const note = state.notes.find((candidate) => candidate.id === noteId);
    setRenameValue(note?.title || "");
    setRenaming(true);
    setListMenu(null);
  }

  async function rename() {
    if (!activeNote) return;
    const title = renameValue.trim();
    if (!title) {
      setRenaming(false);
      return;
    }
    await flushAutosave();
    const result = await window.privoraDesktop.renameNote({ workspaceId, noteId: activeNote.note.id, title });
    setActiveNote(result);
    setRenaming(false);
    setStatus("Renamed");
    await refresh();
  }

  async function togglePinned() {
    if (!activeNote) return;
    await flushAutosave();
    const result = await window.privoraDesktop.updateNote({ workspaceId, noteId: activeNote.note.id, pinned: !activeNote.note.pinned });
    setActiveNote(result);
    setActionsOpen(false);
    await refresh();
  }

  async function toggleScope() {
    if (!activeNote || activeNote.note.scope === "file") return;
    await flushAutosave();
    const scope = activeNote.note.scope === "global" ? "workspace" : "global";
    const result = await window.privoraDesktop.updateNote({ workspaceId, noteId: activeNote.note.id, scope });
    setActiveNote(result);
    setActionsOpen(false);
    await refresh();
  }

  async function deleteNote() {
    if (!activeNote) return;
    await deleteNoteById(activeNote.note);
  }

  async function deleteNoteById(note: NoteRecord, deleteFile = false, permanent = false) {
    const message = note.filePath
      ? deleteFile
        ? permanent
          ? `Permanently delete "${note.title}" from disk? This cannot be undone.`
          : `Move "${note.title}" to the Recycle Bin and remove it from Privora Notes?`
        : `Remove "${note.title}" from Privora Notes? The external file will stay on disk.`
      : `Delete "${note.title}"? This Privora draft will be removed.`;
    if (!window.confirm(message)) return;
    const next = await window.privoraDesktop.deleteNote({ workspaceId, noteId: note.id, deleteFile, permanent });
    setState(next);
    setListMenu(null);
    if (activeNote?.note.id === note.id) {
      setActiveNote(null);
      if (next.activeNoteId) await openNote(next.activeNoteId);
    }
  }

  async function closeTab(noteId: string) {
    await closeTabs([noteId]);
  }

  async function closeTabs(noteIds: string[]) {
    if (activeNote && noteIds.includes(activeNote.note.id)) await flushAutosave();
    let next = state;
    for (const noteId of noteIds) next = await window.privoraDesktop.closeNoteTab({ workspaceId, noteId });
    setState(next);
    if (activeNote && noteIds.includes(activeNote.note.id)) {
      setActiveNote(null);
      if (next.activeNoteId) await openNote(next.activeNoteId);
    }
    setTabMenu(null);
  }

  async function toggleTabPinned(noteId: string) {
    const note = state.notes.find((candidate) => candidate.id === noteId);
    if (!note) return;
    const result = await window.privoraDesktop.updateNote({ workspaceId, noteId, pinned: !note.pinned });
    if (activeNote?.note.id === noteId) setActiveNote(result);
    setTabMenu(null);
    await refresh();
  }

  async function reveal() {
    if (!activeNote?.note.filePath) return;
    setActionsOpen(false);
    await window.privoraDesktop.revealNote({ workspaceId, noteId: activeNote.note.id });
  }

  return (
    <div className="notes-panel">
      <div className="notes-tabs" role="tablist" aria-label="Open notes" onWheel={scrollTabsHorizontally}>
        {state.openTabs.length === 0 ? (
          <button type="button" className="notes-tab-placeholder" onClick={() => createNote("workspace")}>
            <FileText size={15} />
            <span>New note</span>
          </button>
        ) : orderedOpenTabs.map((note) => (
          <button
            type="button"
            key={note.id}
            className={clsx("notes-tab", note.id === activeNoteId && "active")}
            onClick={() => openNote(note.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              setTabMenu(contextMenuPosition(note.id, event.clientX, event.clientY));
            }}
            title={note.filePath || note.title}
          >
            <NoteScopeIcon note={note} />
            <span>{note.title}</span>
            {note.pinned && <Pin size={11} className="notes-tab-pin" />}
            {note.dirty && <i />}
            <span
              role="button"
              tabIndex={0}
              className="notes-tab-close"
              onClick={(event) => {
                event.stopPropagation();
                void closeTab(note.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") void closeTab(note.id);
              }}
            >
              <X size={12} />
            </span>
          </button>
        ))}
        <button type="button" className="notes-icon-button" title="New workspace note" onClick={() => createNote("workspace")}>
          <Plus size={15} />
        </button>
      </div>
      {tabMenu && (() => {
        const note = state.openTabs.find((candidate) => candidate.id === tabMenu.noteId);
        if (!note) return null;
        return (
          <div className="tab-context-menu" style={{ left: tabMenu.x, top: tabMenu.y }} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => void toggleTabPinned(note.id)}>{note.pinned ? <PinOff size={14} /> : <Pin size={14} />}<span>{note.pinned ? "Unpin" : "Pin"}</span></button>
            <div />
            <button type="button" onClick={() => void closeTabs([note.id])}><X size={14} /><span>Close</span></button>
            <button type="button" disabled={state.openTabs.length <= 1} onClick={() => void closeTabs(state.openTabs.filter((candidate) => candidate.id !== note.id).map((candidate) => candidate.id))}><X size={14} /><span>Close others</span></button>
            <button type="button" onClick={() => void closeTabs(state.openTabs.map((candidate) => candidate.id))}><X size={14} /><span>Close all</span></button>
          </div>
        );
      })()}
      {listMenu && (() => {
        const note = state.notes.find((candidate) => candidate.id === listMenu.noteId);
        if (!note) return null;
        const open = state.openTabs.some((candidate) => candidate.id === note.id);
        return (
          <div className="tab-context-menu" style={{ left: listMenu.x, top: listMenu.y }} onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => { setListMenu(null); void openNote(note.id); }}><FileText size={14} /><span>Open</span></button>
            <button type="button" onClick={() => void toggleTabPinned(note.id)}>{note.pinned ? <PinOff size={14} /> : <Pin size={14} />}<span>{note.pinned ? "Unpin" : "Pin"}</span></button>
            <button type="button" onClick={() => void beginRenameFor(note.id)}><FileText size={14} /><span>Rename</span></button>
            {note.filePath && <button type="button" onClick={() => { setListMenu(null); void window.privoraDesktop.revealNote({ workspaceId, noteId: note.id }); }}><ExternalLink size={14} /><span>Reveal in Explorer</span></button>}
            <div />
            <button type="button" disabled={!open} onClick={() => void closeTabs([note.id])}><X size={14} /><span>Close tab</span></button>
            <button type="button" onClick={() => void deleteNoteById(note)}><Trash2 size={14} /><span>{note.filePath ? "Remove from Notes" : "Delete note"}</span></button>
            {note.filePath && <button type="button" onClick={() => void deleteNoteById(note, true)}><Trash2 size={14} /><span>Move file to Recycle Bin</span></button>}
            {note.filePath && <button type="button" className="danger" onClick={() => void deleteNoteById(note, true, true)}><Trash2 size={14} /><span>Delete permanently</span></button>}
          </div>
        );
      })()}

      <div className={clsx("notes-main", listCollapsed && "list-collapsed")}>
        <section className="notes-editor">
          <div className="notes-toolbar">
            <div className={clsx("notes-title", activeNote?.largeMode !== "normal" && "warning")} onDoubleClick={beginRename}>
              {renaming ? (
                <div className="notes-rename">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void rename();
                      if (event.key === "Escape") setRenaming(false);
                    }}
                    onBlur={() => setRenaming(false)}
                    aria-label="Note title"
                  />
                  <button type="button" title="Confirm rename" onMouseDown={(event) => event.preventDefault()} onClick={() => void rename()}>
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                <strong>{activeNote?.note.title || "Notes"}</strong>
              )}
              <span>
                {status || activeNote?.note.filePath || (activeNote && (activeNote.note.scope === "global" ? "Global draft" : "Workspace draft"))}
              </span>
            </div>
            <div className="notes-actions">
              <button type="button" title="Open text file" onClick={openFile}><FolderOpen size={15} /></button>
              <button type="button" title="Save" disabled={!activeNote || saving} onClick={save}><Save size={15} /></button>
              <button type="button" title={listCollapsed ? "Show notes list" : "Hide notes list"} onClick={() => setListCollapsed((collapsed) => !collapsed)}>
                {listCollapsed ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
              </button>
              <div className="notes-actions-menu" ref={actionsRef}>
                <button type="button" title="More note actions" aria-expanded={actionsOpen} onClick={() => setActionsOpen((open) => !open)}>
                  <MoreHorizontal size={16} />
                </button>
                {actionsOpen && (
                  <div className="notes-actions-popover">
                    <button type="button" onClick={() => { setActionsOpen(false); void createNote("global"); }}><Globe2 size={15} /><span>New global note</span></button>
                    <button type="button" disabled={!activeNote} onClick={() => void saveAs()}><HardDrive size={15} /><span>Save as</span></button>
                    <button type="button" disabled={!activeNote} onClick={beginRename}><FileText size={15} /><span>Rename</span></button>
                    <button type="button" disabled={!activeNote} onClick={() => void togglePinned()}>{activeNote?.note.pinned ? <PinOff size={15} /> : <Pin size={15} />}<span>{activeNote?.note.pinned ? "Unpin" : "Pin"}</span></button>
                    <button type="button" disabled={!activeNote || activeNote.note.scope === "file"} onClick={() => void toggleScope()}><FolderSync size={15} /><span>{activeNote?.note.scope === "global" ? "Move to workspace" : "Make global"}</span></button>
                    <button type="button" disabled={!activeNote?.note.filePath} onClick={() => void reveal()}><ExternalLink size={15} /><span>Reveal in Explorer</span></button>
                    <div className="notes-actions-separator" />
                    <button type="button" className="danger" disabled={!activeNote} onClick={() => { setActionsOpen(false); void deleteNote(); }}><Trash2 size={15} /><span>{activeNote?.note.filePath ? "Remove from Notes" : "Delete note"}</span></button>
                    {activeNote?.note.filePath && <button type="button" onClick={() => { setActionsOpen(false); void deleteNoteById(activeNote.note, true); }}><Trash2 size={15} /><span>Move file to Recycle Bin</span></button>}
                    {activeNote?.note.filePath && <button type="button" className="danger" onClick={() => { setActionsOpen(false); void deleteNoteById(activeNote.note, true, true); }}><Trash2 size={15} /><span>Delete file permanently</span></button>}
                  </div>
                )}
              </div>
            </div>
          </div>
          {activeNote ? (
            <div className="notes-monaco-wrap">
              <Editor
                key={activeNote.note.id}
                height="100%"
                path={`privora-note://${activeNote.note.id}/${activeNote.note.title}`}
                value={activeNote.content}
                language={language}
                theme="vs-dark"
                onMount={(editor) => {
                  editorRef.current = editor;
                  window.requestAnimationFrame(() => {
                    editor.layout();
                    editor.focus();
                  });
                }}
                onChange={(value) => scheduleAutosave(value || "")}
                options={{
                  readOnly: activeNote.readonly,
                  domReadOnly: activeNote.readonly,
                  minimap: { enabled: activeNote.largeMode === "normal" },
                  stickyScroll: { enabled: false },
                  fontSize: 14,
                  lineHeight: 22,
                  fontLigatures: true,
                  wordWrap: "on",
                  lineNumbersMinChars: 3,
                  scrollBeyondLastLine: false,
                  renderLineHighlight: "line",
                  padding: { top: 16, bottom: 20 },
                  automaticLayout: true,
                  contextmenu: true,
                  quickSuggestions: activeNote.largeMode === "normal",
                  occurrencesHighlight: activeNote.largeMode === "normal" ? "singleFile" : "off",
                }}
              />
            </div>
          ) : (
            <div className="notes-empty">
              <FileText size={38} />
              <strong>Open a note</strong>
              <span>Create a draft or open a text file from your PC.</span>
            </div>
          )}
        </section>

        <aside className="notes-list" aria-label="Notes list">
          <div className="notes-filter">
            <Search size={15} />
            <input
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                void refresh(event.target.value);
              }}
              placeholder="Search notes..."
            />
          </div>
          <NoteGroup title="Global" notes={grouped.global} activeNoteId={activeNoteId} onOpen={openNote} onContextMenu={(noteId, x, y) => setListMenu(contextMenuPosition(noteId, x, y))} />
          <NoteGroup title="Workspace" notes={grouped.workspace} activeNoteId={activeNoteId} onOpen={openNote} onContextMenu={(noteId, x, y) => setListMenu(contextMenuPosition(noteId, x, y))} />
          <NoteGroup title="Files" notes={grouped.file} activeNoteId={activeNoteId} onOpen={openNote} onContextMenu={(noteId, x, y) => setListMenu(contextMenuPosition(noteId, x, y))} />
        </aside>
      </div>
    </div>
  );
}

function NoteGroup({ title, notes, activeNoteId, onOpen, onContextMenu }: { title: string; notes: NoteRecord[]; activeNoteId?: string; onOpen: (noteId: string) => void; onContextMenu: (noteId: string, x: number, y: number) => void }) {
  return (
    <section className="notes-group">
      <div className="notes-group-title">{title}<span>{notes.length}</span></div>
      {notes.length === 0 ? <div className="notes-group-empty">No notes</div> : notes.map((note) => (
        <button
          type="button"
          key={note.id}
          className={clsx("notes-list-item", note.id === activeNoteId && "active")}
          onClick={() => onOpen(note.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            onContextMenu(note.id, event.clientX, event.clientY);
          }}
          title={note.filePath || note.title}
        >
          <NoteScopeIcon note={note} />
          <span>
            <strong>{note.title}</strong>
            <small>{note.excerpt || note.filePath || (note.scope === "global" ? "Global note" : "Workspace note")}</small>
          </span>
          {note.pinned && <Pin size={12} />}
        </button>
      ))}
    </section>
  );
}

function NoteScopeIcon({ note }: { note: NoteRecord }) {
  if (note.scope === "global") return <Globe2 size={14} />;
  if (note.scope === "file") return <HardDrive size={14} />;
  return <FileText size={14} />;
}

const groupNotes = (notes: NoteRecord[]) => ({
  global: notes.filter((note) => note.scope === "global"),
  workspace: notes.filter((note) => note.scope === "workspace"),
  file: notes.filter((note) => note.scope === "file"),
});

const languageForNote = (name: string) => {
  if (/\.json$/i.test(name)) return "json";
  if (/\.ya?ml$/i.test(name)) return "yaml";
  if (/\.md|\.markdown$/i.test(name)) return "markdown";
  if (/\.html?$/i.test(name)) return "html";
  if (/\.css$/i.test(name)) return "css";
  if (/\.tsx?$/i.test(name)) return "typescript";
  if (/\.jsx?$/i.test(name)) return "javascript";
  return "plaintext";
};

const scrollTabsHorizontally = (event: WheelEvent<HTMLDivElement>) => {
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  event.currentTarget.scrollLeft += event.deltaY;
  event.preventDefault();
};

const contextMenuPosition = (noteId: string, x: number, y: number) => ({
  noteId,
  x: Math.max(8, Math.min(x, window.innerWidth - 208)),
  y: Math.max(8, Math.min(y, window.innerHeight - 250)),
});
