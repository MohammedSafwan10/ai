import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UpdateStatus } from "../../shared/types";

export function AboutSettings({ updateStatus }: { updateStatus: UpdateStatus | null }) {
  const [status, setStatus] = useState(updateStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const pending = useRef(false);
  useEffect(() => { setStatus(updateStatus); }, [updateStatus]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const act = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const next = await (status?.state === "ready" ? window.privoraDesktop.installUpdate() : window.privoraDesktop.checkForUpdates());
      if (alive.current) setStatus(next);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : "Could not check for updates."); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  const openLink = (url: string) => { void window.privoraDesktop.openExternalUrl(url).catch(() => { if (alive.current) setError("Could not open the link in your browser."); }); };
  const active = ["checking", "downloading", "installing"].includes(status?.state ?? "");
  const title = !status ? "Loading update status…" : status.state === "ready" ? "Update ready to install"
    : status.state === "checking" ? "Checking for updates…" : status.state === "downloading" ? "Downloading update…"
    : status.state === "installing" ? "Installing update…" : status.state === "error" ? "Update check failed"
    : status.state === "unsupported" ? "Manual updates" : status.lastCheckedAt ? "Update status" : "Updates";
  const notes = status?.latestReleaseNotes || status?.releaseNotes;
  const date = status?.latestReleaseDate || status?.releaseDate;
  return <div className="settings-section settings-about">
    <div className="settings-product"><img src={new URL("../../../assets/icon.png", import.meta.url).href} alt="" width="56" height="56" />
      <div><h3>Privora Desktop</h3><p>AI-assisted work in your own workspace.</p><small>Version {status?.currentVersion || "…"}</small></div>
    </div>
    <section className="settings-detail-group" aria-label="App updates">
      <h3>Updates</h3><div className="settings-update-summary"><div><strong>{title}</strong><p>{status?.error || status?.message || "Check for the latest desktop release."}</p></div>
        <button type="button" className="settings-row-button settings-outlined-button" disabled={active || busy} onClick={() => void act()}>
          <RefreshCw size={14} />{busy || active ? "Working…" : status?.state === "ready" ? "Restart to update" : "Check for updates"}
        </button>
      </div>
      <dl className="settings-about-details">
        {status?.latestVersion && <div><dt>Latest release</dt><dd>{status.latestVersion}</dd></div>}
        {date && <div><dt>Released</dt><dd>{Number.isNaN(Date.parse(date)) ? date : new Date(date).toLocaleDateString()}</dd></div>}
        <div><dt>Channel</dt><dd>{!status?.feedUrl ? "Not configured" : status.feedUrl.includes("/win32/x64/stable") ? "Windows x64 · Stable" : "Custom feed"}</dd></div>
        <div><dt>Last checked</dt><dd>{status?.lastCheckedAt ? new Date(status.lastCheckedAt).toLocaleString() : "Not checked yet"}</dd></div>
      </dl>
      {notes && <details className="settings-release-notes"><summary>Release notes</summary><p>{notes}</p></details>}
    </section>
    <section className="settings-detail-group" aria-label="Product links"><h3>Links</h3><div className="settings-product-links">
      <button type="button" onClick={() => openLink("https://privora.nexdark.com")}>Website<ArrowUpRight size={14} /></button>
      <button type="button" onClick={() => openLink("https://github.com/MohammedSafwan10/privora-desktop")}>Source code<ArrowUpRight size={14} /></button>
    </div></section>
    {error && <p className="settings-inline-error" role="alert">{error}</p>}
  </div>;
}
