import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";

export function PromptDeleteDialog({ title, busy, error, onCancel, onConfirm }: {
  title: string; busy: boolean; error: string | null; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    cancel.current?.focus();
    return () => {
      element?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  return <dialog ref={dialog} className="prompt-delete-dialog" role="alertdialog" aria-labelledby="prompt-delete-title" aria-describedby="prompt-delete-description" aria-busy={busy} onCancel={(event) => { event.preventDefault(); event.stopPropagation(); if (!busy) onCancel(); }}>
    <div className="prompt-delete-icon"><Trash2 size={19} /></div>
    <h3 id="prompt-delete-title">Delete prompt?</h3>
    <p id="prompt-delete-description">“{title}” will be removed from your library. This can’t be undone.</p>
    {error && <p className="prompt-delete-error" role="alert">{error}</p>}
    <div className="prompt-delete-actions"><button ref={cancel} type="button" disabled={busy} onClick={onCancel}>Cancel</button><button className="prompt-delete-confirm" type="button" disabled={busy} onClick={onConfirm}>{busy ? "Deleting…" : "Delete prompt"}</button></div>
  </dialog>;
}
