import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, Copy, Pencil, Play, Plus, Search, Trash2, X } from "lucide-react";
import type { SavedPrompt, SavePromptInput } from "../../../shared/promptLibrary";
import "./promptLibrary.css";

const blank = (): SavePromptInput => ({ title: "", category: "General", workspaceType: "all", content: "" });
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function PromptLibrary({ currentDraft, remoteEnvironment, canRun, onInsert, onRun, onClose }: {
  currentDraft: string; remoteEnvironment: boolean; canRun: boolean;
  onInsert: (text: string) => void; onRun: (text: string) => Promise<boolean>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState("all");
  const [editor, setEditor] = useState<SavePromptInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const filtered = prompts.filter((prompt) => (!category || prompt.category === category)
    && (scope === "all" || prompt.workspaceType === "all" || prompt.workspaceType === scope)
    && `${prompt.title} ${prompt.category} ${prompt.content}`.toLowerCase().includes(query.toLowerCase()));
  const selected = filtered.find((prompt) => prompt.id === selectedId) ?? filtered[0];
  useEffect(() => { dialog.current?.showModal(); return () => dialog.current?.close(); }, []);
  useEffect(() => {
    let cancelled = false;
    void window.privoraDesktop.listSavedPrompts().then((items) => {
      if (!cancelled) { setPrompts(items); setSelectedId(items[0]?.id ?? null); }
    }).catch((failure) => { if (!cancelled) setError(errorText(failure)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => { setCopied(false); setDeleting(false); }, [selected?.id]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 1600); return () => clearTimeout(timer); }, [copied]);

  const save = async () => {
    if (!editor || busy) return;
    setBusy(true); setError(null);
    try {
      const saved = await window.privoraDesktop.savePrompt(editor);
      setPrompts((items) => [...items.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title)));
      setSelectedId(saved.id); setEditor(null); setQuery(""); setCategory(""); setScope("all");
    } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!selected || busy) return;
    if (!deleting) { setDeleting(true); return; }
    setBusy(true); setError(null);
    try {
      await window.privoraDesktop.deleteSavedPrompt(selected.id);
      const remaining = prompts.filter((item) => item.id !== selected.id);
      setPrompts(remaining); setSelectedId(remaining[0]?.id ?? null); setDeleting(false);
    } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  };
  const run = async () => {
    if (!selected || !canRun || busy) return;
    setBusy(true); setError(null);
    try { if (await onRun(selected.content)) onClose(); else setError("The prompt was not sent. You can insert it into the composer instead."); }
    catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  };
  return <dialog ref={dialog} className="prompt-library" aria-labelledby="prompt-library-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><div><h2 id="prompt-library-title"><BookOpen size={18} />Prompt library</h2><p>Reusable prompts for normal and Security chats.</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="Close prompt library"><X size={18} /></button></header>
    {error && <p className="prompt-library-error" role="alert">{error}</p>}
    <div className="prompt-library-layout">
      <aside>
        <label className="prompt-library-search"><Search size={14} /><input type="search" autoFocus placeholder="Search prompts…" aria-label="Search prompts" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="prompt-library-filters"><select aria-label="Filter category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{[...new Set(prompts.map((item) => item.category))].sort().map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter chat type" value={scope} onChange={(event) => setScope(event.target.value)}><option value="all">All chat types</option><option value={remoteEnvironment ? "security" : "development"}>Current chat type</option></select></div>
        <div className="prompt-library-new"><button type="button" disabled={busy} onClick={() => { setEditor(blank()); setError(null); }}><Plus size={14} />New prompt</button><button type="button" disabled={busy || !currentDraft.trim()} onClick={() => { setEditor({ ...blank(), content: currentDraft }); setError(null); }}>Save draft</button></div>
        <nav aria-label="Saved prompts">{loading ? <p>Loading…</p> : !filtered.length ? <p>No matching prompts.</p> : filtered.map((prompt) => <button type="button" key={prompt.id} className={selectedId === prompt.id && !editor ? "selected" : ""} disabled={busy} onClick={() => { setSelectedId(prompt.id); setEditor(null); setError(null); }}><strong>{prompt.title}</strong><small>{prompt.category} · {prompt.workspaceType === "all" ? "All chats" : prompt.workspaceType === "security" ? "Security" : "Normal chats"}</small></button>)}</nav>
      </aside>
      <section className="prompt-library-detail">
        {editor ? <><h3>{editor.id ? "Edit prompt" : "New prompt"}</h3><label>Title<input maxLength={120} value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} /></label><div className="prompt-library-fields"><label>Category<input maxLength={60} list="prompt-library-categories" value={editor.category} onChange={(event) => setEditor({ ...editor, category: event.target.value })} /><datalist id="prompt-library-categories">{[...new Set(prompts.map((item) => item.category))].map((item) => <option key={item} value={item} />)}</datalist></label><label>Chat type<select value={editor.workspaceType} onChange={(event) => setEditor({ ...editor, workspaceType: event.target.value as SavePromptInput["workspaceType"] })}><option value="all">All chats</option><option value="development">Normal chats</option><option value="security">Security</option></select></label></div><label className="prompt-library-body">Prompt<textarea maxLength={32_000} value={editor.content} onChange={(event) => setEditor({ ...editor, content: event.target.value })} /></label><footer><button type="button" disabled={busy} onClick={() => setEditor(null)}>Cancel</button><button type="button" disabled={busy || !editor.title.trim() || !editor.category.trim() || !editor.content.trim()} onClick={() => void save()}>{busy ? "Saving…" : "Save prompt"}</button></footer></>
          : selected ? <><div className="prompt-library-detail-heading"><h3>{selected.title}</h3><button type="button" disabled={busy} onClick={() => setEditor({ id: selected.id, title: selected.title, category: selected.category, workspaceType: selected.workspaceType, content: selected.content })} aria-label="Edit selected prompt"><Pencil size={15} /></button></div><p className="prompt-library-meta">{selected.category} · Saved on this computer</p><pre>{selected.content}</pre><p className="prompt-library-hint">Insert appends to your draft. Run sends this prompt using the current model and permissions.{!canRun && " To run directly, finish the active turn and clear your draft and attachments."}</p><footer><button type="button" disabled={busy} onClick={() => void remove()} title={deleting ? "Click again to delete this saved prompt" : "Delete saved prompt"}><Trash2 size={14} />{deleting ? "Confirm delete" : "Delete"}</button>{deleting && <button type="button" disabled={busy} onClick={() => setDeleting(false)}>Keep</button>}<span /><button type="button" disabled={busy} onClick={() => { void navigator.clipboard.writeText(selected.content).then(() => setCopied(true)).catch((failure) => setError(errorText(failure))); }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy"}</button><button type="button" disabled={busy} onClick={() => onInsert(selected.content)}>Insert</button><button type="button" disabled={busy || !canRun} onClick={() => void run()}><Play size={14} />Run</button></footer></>
          : <div className="prompt-library-empty"><BookOpen size={28} /><p>Create a prompt or save your current draft.</p></div>}
      </section>
    </div>
  </dialog>;
}
