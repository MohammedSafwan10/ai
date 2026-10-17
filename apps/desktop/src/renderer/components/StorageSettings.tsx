import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { StorageCleanupCategoryId, StorageUsageCategoryRecord, StorageUsageSnapshot } from "../../shared/types";

const bytes = (value: number) => value < 1024 ? `${value} B` : value < 1024 ** 2 ? `${(value / 1024).toFixed(0)} KB` : value < 1024 ** 3 ? `${(value / 1024 ** 2).toFixed(1).replace(/\.0$/, "")} MB` : `${(value / 1024 ** 3).toFixed(1)} GB`;
const groups: { label: string; ids: StorageCleanupCategoryId[] }[] = [
  { label: "Browser data", ids: ["browser_cache"] },
  { label: "Saved browser files", ids: ["browser_artifacts", "browser_workflow_history"] },
  { label: "Downloads", ids: ["browser_downloads"] },
];
const cleanupDescription: Record<StorageCleanupCategoryId, string> = {
  browser_cache: "Clear cache, cookies, and website storage? This may sign you out of websites. Some profile metadata will remain.",
  browser_artifacts: "Permanently delete saved browser screenshots and evidence files? Existing chat links to these files will stop working.",
  browser_workflow_history: "Delete saved workflow runs and evidence records? Workflow definitions will be kept.",
  browser_downloads: "Permanently delete all files in Privora’s downloads folder? These are your downloaded files. This cannot be undone.",
};
export const canCleanStorageCategory = (category: StorageUsageCategoryRecord) => category.id === "browser_workflow_history"
  ? category.files > 0 : category.bytes > 0 || category.files > 0 || category.directories > 0;

export function StorageSettings() {
  const [usage, setUsage] = useState<StorageUsageSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState<StorageCleanupCategoryId | null>(null);
  const [confirm, setConfirm] = useState<StorageCleanupCategoryId | null>(null);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const generation = useRef(0);
  const busy = useRef(false);

  const refresh = async () => {
    if (busy.current) return;
    const request = ++generation.current;
    setLoading(true); setMessage(""); setErrors([]); setConfirm(null);
    try {
      const next = await window.privoraDesktop.getStorageUsage();
      if (request === generation.current) setUsage(next);
    } catch (error) {
      if (request === generation.current) setErrors([error instanceof Error ? error.message : "Could not scan storage."]);
    } finally { if (request === generation.current) setLoading(false); }
  };
  useEffect(() => { void refresh(); return () => { generation.current++; }; }, []);

  const clean = async (id: StorageCleanupCategoryId) => {
    if (busy.current) return;
    busy.current = true;
    const request = ++generation.current;
    setCleaning(id); setConfirm(null); setMessage(""); setErrors([]);
    try {
      const result = await window.privoraDesktop.cleanupStorage({ categoryIds: [id] });
      if (request !== generation.current) return;
      setUsage(result.after);
      const issues = [...new Set(result.categories.flatMap((category) => category.errors))];
      setErrors(issues);
      setMessage(`${bytes(result.totalBytesFreed)} freed.${issues.length ? " Some items could not be cleared." : ""}`);
    } catch (error) {
      if (request === generation.current) setErrors([error instanceof Error ? error.message : "Cleanup failed."]);
    } finally {
      busy.current = false;
      if (request === generation.current) { setCleaning(null); setLoading(false); }
    }
  };

  return <div className="settings-section storage-settings">
    <div className="storage-overview">
      <div><span>Browser storage</span><strong>{usage ? bytes(usage.totalBytes) : loading ? "Scanning…" : "—"}</strong>
        <small>Browser data, saved evidence, and Privora downloads</small></div>
      <button type="button" className="settings-row-button" disabled={loading || Boolean(cleaning)} onClick={() => void refresh()}><RefreshCw size={14} /><span>{loading ? "Scanning…" : "Refresh"}</span></button>
    </div>
    {usage && groups.map((group) => <section className="storage-group" key={group.label} aria-label={group.label}>
      <h3>{group.label}</h3>
      {group.ids.map((id) => {
        const category = usage?.categories.find((item) => item.id === id);
        if (!category) return null;
        return <div className="storage-item" key={id}>
          <div className="storage-item-main">
            <div className="storage-item-copy"><strong>{id === "browser_cache" ? "Cache and website data" : category.label}</strong><p>{category.description}</p></div>
            <span className="storage-item-size">{bytes(category.bytes)}</span>
            <button type="button" className="settings-row-button storage-clear" disabled={loading || Boolean(cleaning) || !canCleanStorageCategory(category)}
              onClick={() => setConfirm(confirm === id ? null : id)} aria-expanded={confirm === id} aria-label={`Clear ${category.label.toLowerCase()}`}>
              {cleaning === id ? "Clearing…" : "Clear…"}
            </button>
          </div>
          {confirm === id && <div className="storage-confirm" role="group" aria-label={`Confirm clearing ${category.label.toLowerCase()}`}>
            <p>{cleanupDescription[id]}</p><div><button type="button" className="settings-row-button" onClick={() => setConfirm(null)}>Cancel</button><button type="button" className="settings-row-button storage-confirm-delete" onClick={() => void clean(id)}>Confirm clear</button></div>
          </div>}
          <details className="storage-details"><summary>Location and details</summary>
            <p>{id === "browser_workflow_history" ? `${category.files.toLocaleString()} history records · includes workflow definitions` : `${category.files.toLocaleString()} files · ${category.directories.toLocaleString()} folders`}</p>
            {category.path && <code>{category.path}</code>}
            {category.errors.length > 0 && <p className="storage-error">Some items could not be scanned: {category.errors.slice(0, 3).join(" ")}</p>}
          </details>
        </div>;
      })}
    </section>)}
    {message && <p className="storage-result" role="status">{message}</p>}
    {errors.length > 0 && <div className="storage-error" role="alert">{errors.slice(0, 4).map((error, i) => <p key={i}>{error}</p>)}{errors.length > 4 && <p>And {errors.length - 4} more issues.</p>}</div>}
    {usage && <small className="storage-scan-time">Last scanned {new Date(usage.scannedAt).toLocaleTimeString()}</small>}
  </div>;
}
