import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, ChevronLeft, ChevronRight, Copy, Maximize2, Minimize2, Pencil, Pin, Play, Plus, Search, Trash2, X } from "lucide-react";
import type { SavedPrompt, SavePromptInput, PromptPage, PromptQuery } from "../../../shared/promptLibrary";
import "./promptLibrary.css";

const blank = (): SavePromptInput => ({ title: "", category: "General", workspaceType: "all", content: "", pinned: false });
const editable = (prompt: SavedPrompt): SavePromptInput => ({ id: prompt.id, title: prompt.title, category: prompt.category, workspaceType: prompt.workspaceType, content: prompt.content, pinned: prompt.pinned });
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const PAGE_SIZE = 50;

export function PromptLibrary({ currentDraft, remoteEnvironment, canRun, onInsert, onRun, onClose }: {
  currentDraft: string; remoteEnvironment: boolean; canRun: boolean;
  onInsert: (text: string) => void; onRun: (text: string) => Promise<boolean>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [page, setPage] = useState<PromptPage>({ items: [], total: 0, categories: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SavedPrompt | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState<NonNullable<PromptQuery["scope"]>>("all");
  const [sort, setSort] = useState<NonNullable<PromptQuery["sort"]>>("updated");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<SavePromptInput | null>(null);
  const [original, setOriginal] = useState<SavePromptInput | null>(null);
  const [discard, setDiscard] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = Boolean(editor && JSON.stringify(editor) !== JSON.stringify(original));
  const selectPrompt = (id: string) => { if (dirty) { setError("Save your changes or cancel editing before selecting another prompt."); return; } setEditor(null); setOriginal(null); setSelectedId(id); setError(null); };
  const beginEdit = (value: SavePromptInput) => {
    if (dirty) { setError("Save your changes or cancel editing first."); return; }
    setEditor(value); setOriginal(value); setDiscard(false); setRenaming(false); setError(null);
  };
  const close = () => { if (busy) return; if (dirty) { setDiscard(true); return; } onClose(); };
  const resetPage = () => { setOffset(0); setLoading(true); setSelected(null); };
  const reload = () => setRevision((value) => value + 1);

  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  useEffect(() => { if (query === search) return; const timer = setTimeout(() => { setSearch(query); setOffset(0); setLoading(true); }, 180); return () => clearTimeout(timer); }, [query, search]);
  useEffect(() => {
    let cancelled = false; setLoading(true); setSelected(null);
    void window.privoraDesktop.querySavedPrompts({ query: search, category, scope, sort, pinnedOnly, offset, limit: PAGE_SIZE }).then((next) => {
      if (cancelled) return;
      if (offset && offset >= next.total) { setOffset(Math.max(0, Math.floor((next.total - 1) / PAGE_SIZE) * PAGE_SIZE)); return; }
      setPage(next); setSelectedId((id) => next.items.some((item) => item.id === id) ? id : next.items[0]?.id ?? null);
    }).catch((failure) => { if (!cancelled) { setPage({ items: [], total: 0, categories: [] }); setSelectedId(null); setError(errorText(failure)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [search, category, scope, sort, pinnedOnly, offset, revision]);
  useEffect(() => {
    let cancelled = false; setSelected(null); setCopied(false); setDeleting(false); setRenaming(false);
    if (loading || !selectedId) { setDetailLoading(false); return; }
    setDetailLoading(true);
    void window.privoraDesktop.getSavedPrompt(selectedId).then((prompt) => { if (!cancelled) setSelected(prompt); })
      .catch((failure) => { if (!cancelled) setError(errorText(failure)); }).finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, loading, revision]);
  useEffect(() => { if (renaming) { nameInput.current?.focus(); nameInput.current?.select(); } }, [renaming]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(timer); }, [copied]);

  const save = async () => {
    if (!editor || busy) return;
    setBusy(true); setError(null);
    try {
      const saved = await window.privoraDesktop.savePrompt(editor);
      setSelectedId(saved.id); setEditor(null); setOriginal(null); setDiscard(false);
      setQuery(""); setSearch(""); setCategory(""); setScope("all"); setPinnedOnly(false); setOffset(0); reload();
    } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  };
  const metadata = async (change: { title?: string; pinned?: boolean }) => {
    if (!selected || busy) return;
    setBusy(true); setError(null);
    try { await window.privoraDesktop.updatePromptMetadata({ id: selected.id, ...change }); setRenaming(false); reload(); }
    catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!selected || busy) return;
    if (!deleting) { setDeleting(true); return; }
    setBusy(true); setError(null);
    try { await window.privoraDesktop.deleteSavedPrompt(selected.id); setSelected(null); setSelectedId(null); setDeleting(false); reload(); }
    catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  };
  const run = async () => {
    if (!selected || !canRun || busy || loading || detailLoading) return;
    setBusy(true); setError(null);
    try { if (await onRun(selected.content)) onClose(); else setError("The prompt was not sent. You can insert it into the composer instead."); }
    catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  };
  const filtersDisabled = busy || Boolean(editor);
  const scopeName = (value: string) => value === "all" ? "All chats" : value === "security" ? "Security" : "Normal chats";

  return <dialog ref={dialog} className={`prompt-library${fullscreen ? " prompt-library-fullscreen" : ""}`} aria-labelledby="prompt-library-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <header><div><h2 id="prompt-library-title"><BookOpen size={18} />Prompt library</h2><p>Reusable prompts for normal and Security chats.</p></div><div className="prompt-library-header-actions"><button type="button" onClick={() => setFullscreen((value) => !value)} title={fullscreen ? "Exit full screen" : "Expand to full screen"} aria-label={fullscreen ? "Exit full screen" : "Expand to full screen"}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button><button type="button" disabled={busy} onClick={close} aria-label="Close prompt library"><X size={18} /></button></div></header>
    {error && <p className="prompt-library-error" role="alert">{error}</p>}
    {discard && <div className="prompt-library-discard" role="alert"><span>Keep or discard your unsaved changes?</span><button type="button" onClick={() => setDiscard(false)}>Keep editing</button><button type="button" onClick={() => { setEditor(null); setOriginal(null); setDiscard(false); }}>Discard changes</button></div>}
    <div className="prompt-library-layout">
      <aside>
        <label className="prompt-library-search"><Search size={14} /><input type="search" autoFocus maxLength={300} disabled={filtersDisabled} placeholder="Search names and prompt text…" aria-label="Search prompts" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="prompt-library-filters"><select disabled={filtersDisabled} aria-label="Filter category" value={category} onChange={(event) => { setCategory(event.target.value); resetPage(); }}><option value="">All categories</option>{page.categories.map((item) => <option key={item}>{item}</option>)}</select><select disabled={filtersDisabled} aria-label="Filter chat type" value={scope} onChange={(event) => { setScope(event.target.value as typeof scope); resetPage(); }}><option value="all">All chat types</option><option value="development">Normal chats{!remoteEnvironment ? " (current)" : ""}</option><option value="security">Security{remoteEnvironment ? " (current)" : ""}</option></select></div>
        <div className="prompt-library-filters"><button type="button" disabled={filtersDisabled} aria-pressed={pinnedOnly} onClick={() => { setPinnedOnly((value) => !value); resetPage(); }}><Pin size={13} />Pinned</button><select disabled={filtersDisabled} aria-label="Sort prompts" value={sort} onChange={(event) => { setSort(event.target.value as typeof sort); resetPage(); }}><option value="updated">Recently updated</option><option value="name">Name A–Z</option><option value="category">Category</option></select></div>
        <div className="prompt-library-new"><button type="button" disabled={busy} onClick={() => beginEdit(blank())}><Plus size={14} />New prompt</button><button type="button" disabled={busy || !currentDraft.trim()} onClick={() => beginEdit({ ...blank(), content: currentDraft })}>Save draft</button></div>
        <p className="prompt-library-count" role="status">{loading ? "Searching…" : `${page.total.toLocaleString()} matching prompt${page.total === 1 ? "" : "s"}`}</p>
        <nav aria-label="Saved prompts" aria-busy={loading}>{loading ? <p>Loading…</p> : !page.items.length ? <p>No matching prompts.</p> : page.items.map((prompt) => <button type="button" key={prompt.id} className={selectedId === prompt.id && !editor ? "selected" : ""} disabled={busy} aria-current={selectedId === prompt.id ? "true" : undefined} onClick={() => selectPrompt(prompt.id)}><strong>{prompt.pinned && <Pin size={12} aria-label="Pinned" />}{prompt.title}</strong><small>{prompt.category} · {scopeName(prompt.workspaceType)}</small></button>)}</nav>
        <div className="prompt-library-pagination"><button type="button" disabled={filtersDisabled || loading || offset === 0} aria-label="Previous prompt page" onClick={() => { setOffset((value) => Math.max(0, value - PAGE_SIZE)); setLoading(true); }}><ChevronLeft size={15} /></button><span>{page.total ? `${offset + 1}–${Math.min(offset + PAGE_SIZE, page.total)} of ${page.total.toLocaleString()}` : "0 prompts"}</span><button type="button" disabled={filtersDisabled || loading || offset + PAGE_SIZE >= page.total} aria-label="Next prompt page" onClick={() => { setOffset((value) => value + PAGE_SIZE); setLoading(true); }}><ChevronRight size={15} /></button></div>
      </aside>
      <section className="prompt-library-detail">
        {editor ? <>
          <h3>{editor.id ? "Edit prompt" : "New prompt"}</h3>
          <label>Prompt name<input maxLength={120} disabled={busy} value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} /></label>
          <div className="prompt-library-fields"><label>Category<input maxLength={60} disabled={busy} list="prompt-library-categories" value={editor.category} onChange={(event) => setEditor({ ...editor, category: event.target.value })} /><datalist id="prompt-library-categories">{page.categories.map((item) => <option key={item} value={item} />)}</datalist></label><label>Chat type<select disabled={busy} value={editor.workspaceType} onChange={(event) => setEditor({ ...editor, workspaceType: event.target.value as SavePromptInput["workspaceType"] })}><option value="all">All chats</option><option value="development">Normal chats</option><option value="security">Security</option></select></label></div>
          <label className="prompt-library-body">Prompt<textarea maxLength={32_000} disabled={busy} value={editor.content} onChange={(event) => setEditor({ ...editor, content: event.target.value })} /></label>
          <footer><button type="button" disabled={busy} onClick={() => { if (dirty) setDiscard(true); else { setEditor(null); setOriginal(null); } }}>Cancel</button><span /><small>{editor.content.length.toLocaleString()} / 32,000</small><button type="button" disabled={busy || !editor.title.trim() || !editor.category.trim() || !editor.content.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save prompt"}</button></footer>
        </> : loading || detailLoading ? <p className="prompt-library-meta">Loading prompt…</p> : selected ? <>
          <div className="prompt-library-detail-heading"><h3>{selected.title}</h3><button type="button" disabled={busy} aria-pressed={Boolean(selected.pinned)} onClick={() => void metadata({ pinned: !selected.pinned })} title={selected.pinned ? "Unpin prompt" : "Pin prompt"} aria-label={selected.pinned ? "Unpin prompt" : "Pin prompt"}><Pin size={15} /></button></div>
          {renaming ? <div className="prompt-library-rename"><input ref={nameInput} maxLength={120} disabled={busy} aria-label="New prompt name" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (name.trim()) void metadata({ title: name }); } if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setRenaming(false); } }} /><button type="button" disabled={busy || !name.trim()} onClick={() => void metadata({ title: name })}>Save name</button><button type="button" disabled={busy} onClick={() => setRenaming(false)}>Cancel</button></div>
            : <div className="prompt-library-detail-actions"><button type="button" disabled={busy} onClick={() => { setName(selected.title); setRenaming(true); }}>Rename</button><button type="button" disabled={busy} onClick={() => beginEdit(editable(selected))}><Pencil size={13} />Edit</button><button type="button" disabled={busy} onClick={() => { const copy = editable(selected); delete copy.id; beginEdit({ ...copy, title: `${selected.title.slice(0, 113)} (copy)`, pinned: false }); }}><Copy size={13} />Duplicate</button></div>}
          <p className="prompt-library-meta">{selected.category} · {scopeName(selected.workspaceType)} · Updated {new Date(selected.updatedAt).toLocaleDateString()}</p>
          <pre>{selected.content}</pre>
          <p className="prompt-library-hint">Insert appends to your draft. Run uses the current chat's model and permissions.{!canRun && " Finish the active turn and clear your draft and attachments to run directly."}</p>
          <footer><button type="button" disabled={busy} onClick={() => void remove()} title={deleting ? "Click again to delete this saved prompt" : "Delete saved prompt"}><Trash2 size={14} />{deleting ? "Confirm delete" : "Delete"}</button>{deleting && <button type="button" disabled={busy} onClick={() => setDeleting(false)}>Keep</button>}<span /><button type="button" disabled={busy} onClick={() => { void navigator.clipboard.writeText(selected.content).then(() => setCopied(true)).catch((failure) => setError(errorText(failure))); }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button><button type="button" disabled={busy} onClick={() => onInsert(selected.content)}>Insert</button><button type="button" disabled={busy || !canRun} onClick={() => void run()}><Play size={14} />Run</button></footer>
        </> : <div className="prompt-library-empty"><BookOpen size={28} /><p>No prompt selected. Create a prompt or change your filters.</p></div>}
      </section>
    </div>
  </dialog>;
}
