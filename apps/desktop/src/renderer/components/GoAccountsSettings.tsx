import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import type { SaveSettingsInput, SettingsRecord } from "../../shared/types";
import "./goAccounts.css";

export function GoAccountsSettings({ settings, busy, onSave }: {
  settings: SettingsRecord;
  busy: boolean;
  onSave: (input: SaveSettingsInput) => Promise<boolean>;
}) {
  const accounts = settings.opencodeGoAccounts || [];
  const [form, setForm] = useState<{ id?: string; name: string; apiKey: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const save = async () => {
    if (!form || !form.name.trim() || (!form.id && !form.apiKey.trim())) return;
    if (await onSave({ opencodeGoAccount: { action: "save", id: form.id, name: form.name.trim(), ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}) } })) setForm(null);
  };
  return <section className="go-accounts" aria-label="OpenCode Go accounts">
    <div className="go-accounts-heading"><span>OpenCode Go accounts</span>
      <button type="button" className="settings-row-button" disabled={busy || accounts.length >= 10} onClick={() => { setRemoving(null); setForm({ name: "", apiKey: "" }); }}><Plus size={14} /> Add account</button>
    </div>
    <small>Active for all chats. Running requests keep their current key. At a usage cap, switch here, then Resume.</small>
    {accounts.map((account) => <div className="go-account" key={account.id}>
      <div className="go-account-details"><div className="go-account-name"><strong>{account.name}</strong>
        {settings.activeOpencodeGoAccountId === account.id && <span className="go-account-active"><Check size={11} /> Active</span>}
      </div>
      <small className={account.issue ? "go-account-issue" : ""}>{account.issue
        ? account.issue.kind === "usage_limit" ? `Limit reported · ${account.issue.model.replace(/^opencode-go\//, "")}` : "Key rejected · replace key"
        : "Saved securely"}</small></div>
      {settings.activeOpencodeGoAccountId !== account.id && <button type="button" className="settings-row-button" disabled={busy} onClick={() => void onSave({ opencodeGoAccount: { action: "activate", id: account.id } })}>Use</button>}
      <button type="button" className="go-account-icon" aria-label={`Edit ${account.name}`} title="Edit account" disabled={busy} onClick={() => { setRemoving(null); setForm({ id: account.id, name: account.name, apiKey: "" }); }}><Pencil size={14} /></button>
      <button type="button" className="go-account-icon" aria-label={`Remove ${account.name}`} title="Remove account" disabled={busy} onClick={() => { setForm(null); setRemoving(account.id); }}><Trash2 size={14} /></button>
    </div>)}
    {!accounts.length && !form && <p className="go-accounts-empty">No saved accounts. Add a key from your OpenCode Console.</p>}
    {form && <div className="go-account-form" role="group" aria-label={form.id ? "Edit Go account" : "Add Go account"}>
      <label>Account name<input autoFocus maxLength={60} autoComplete="off" placeholder="Personal, Work…" value={form.name} disabled={busy} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>API key<input type="password" autoComplete="new-password" spellCheck={false} maxLength={10000} placeholder={form.id ? "Leave blank to keep saved key" : "Paste your Go API key"} value={form.apiKey} disabled={busy} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} /></label>
      <div className="go-account-actions"><button type="button" className="settings-primary-button" disabled={busy || !form.name.trim() || (!form.id && !form.apiKey.trim())} onClick={() => void save()}>{busy ? "Saving…" : "Save account"}</button><button type="button" className="settings-row-button" disabled={busy} onClick={() => setForm(null)}>Cancel</button></div>
    </div>}
    {removing && <div className="go-account-confirm" role="alertdialog" aria-label="Remove Go account" aria-describedby="go-account-remove-description">
      <p id="go-account-remove-description">Remove “{accounts.find((account) => account.id === removing)?.name}” from Privora?{settings.activeOpencodeGoAccountId === removing ? " Choose another account before your next Go request." : ""}</p>
      <div className="go-account-actions"><button type="button" className="settings-row-button go-account-remove" disabled={busy} onClick={async () => { if (await onSave({ opencodeGoAccount: { action: "remove", id: removing } })) setRemoving(null); }}>Remove account</button><button type="button" autoFocus className="settings-row-button" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button></div>
    </div>}
  </section>;
}
