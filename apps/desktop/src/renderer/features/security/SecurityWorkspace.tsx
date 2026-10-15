import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronRight, Copy, Download, FolderOpen, File, FileUp, RefreshCw, Shield, Square, X } from "lucide-react";
import type { DesktopAttachmentRecord, SecurityEnvironmentRecord, SecurityWorkspaceState, WorkspaceRecord } from "../../../shared/types";
import { trustedArtifactUrl } from "./artifactAccess";
import { securityConnectionStatus } from "../../../shared/securityConnection";

const activeJobStates = new Set(["submitting", "queued", "running", "stop_requested", "unknown"]);
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const connectionLabel = (environment: SecurityEnvironmentRecord | null | undefined) => !environment ? "Loading" : securityConnectionStatus(environment) === "connected" ? "Connected" : securityConnectionStatus(environment) === "unchecked" ? "Needs check" : "Disconnected";
const artifactSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function useSecurityWorkspace(workspace: WorkspaceRecord | null, detailsOpen: boolean, visible: boolean) {
  const [state, setState] = useState<SecurityWorkspaceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const generation = useRef(0);
  const workspaceId = workspace?.type === "security" ? workspace.id : null;

  useEffect(() => {
    generation.current += 1;
    setState(null);
    setError(null);
    setChecking(false);
  }, [workspaceId]);

  useEffect(() => {
    const current = generation.current;
    if (!workspaceId || !visible) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      let delay = detailsOpen ? 5000 : 12000;
      try {
        const next = await window.privoraDesktop.getSecurityWorkspaceState(workspaceId);
        if (cancelled || generation.current !== current) return;
        setState(next);
        setError(null);
        if (next.jobs.some((job) => activeJobStates.has(job.state))) delay = 2500;
      } catch (failure) {
        if (cancelled || generation.current !== current) return;
        setError(errorText(failure));
      }
      if (!cancelled) timer = setTimeout(poll, delay);
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [workspaceId, detailsOpen, visible]);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    const current = generation.current;
    try {
      const next = await window.privoraDesktop.getSecurityWorkspaceState(workspaceId);
      if (current === generation.current) { setState(next); setError(null); }
    } catch (failure) {
      if (current === generation.current) setError(errorText(failure));
    }
  }, [workspaceId]);

  const check = useCallback(async () => {
    const id = workspace?.security?.environmentId;
    if (!id || checking) return;
    const current = generation.current;
    setChecking(true);
    try {
      const environment = await window.privoraDesktop.checkSecurityEnvironment(id);
      if (current === generation.current) setState((previous) => ({ ...previous, environment, jobs: previous?.jobs || [], findings: previous?.findings || [] }));
      await refresh();
    } catch (failure) {
      if (current === generation.current) setError(errorText(failure));
    } finally {
      if (current === generation.current) setChecking(false);
    }
  }, [workspace?.security?.environmentId, checking, refresh]);

  return { state, error, checking, check, refresh };
}

export function SecurityWorkspaceBadge({ environment, checking, onOpen }: {
  environment: SecurityEnvironmentRecord | null | undefined; checking: boolean; onOpen: () => void;
}) {
  const status = checking ? "Checking" : connectionLabel(environment);
  return <button type="button" className="security-workspace-badge" onClick={onOpen} aria-label={`Security workspace: ${environment?.name || "Kali"}, ${status}. Open environment and evidence`}>
    <Shield size={13} /><span>Security</span><span className="security-badge-separator">·</span><span className="security-badge-environment">{environment?.name || "Kali"}</span>
    <span className={`security-connection-dot ${!checking && environment && securityConnectionStatus(environment) === "connected" ? "connected" : ""}`} aria-hidden="true" /><span>{status}</span><ChevronRight size={12} />
  </button>;
}

function SecurityDialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`security-dialog${wide ? " security-details-dialog" : ""}`} onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="security-dialog-title">
    <header><h2 id="security-dialog-title">{title}</h2><button type="button" onClick={onClose} aria-label="Close security workspace dialog"><X size={18} /></button></header>
    {children}
  </dialog>;
}

export function CreateSecurityWorkspaceDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [scope, setScope] = useState("");
  const [environments, setEnvironments] = useState<SecurityEnvironmentRecord[]>([]);
  const [environmentId, setEnvironmentId] = useState("");
  const [busy, setBusy] = useState<"load" | "import" | "check" | "create" | null>("load");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void window.privoraDesktop.listSecurityEnvironments().then((items) => {
      if (cancelled) return;
      setEnvironments(items); setEnvironmentId(items[0]?.id || ""); setBusy(null);
    }).catch((failure) => { if (!cancelled) { setError(errorText(failure)); setBusy(null); } });
    return () => { cancelled = true; };
  }, []);
  const selected = environments.find((item) => item.id === environmentId);
  const importProfile = async () => {
    setBusy("import"); setError(null);
    try {
      const imported = await window.privoraDesktop.importKaliEnvironmentProfile();
      if (imported) { setEnvironments((items) => [...items.filter((item) => item.id !== imported.id), imported]); setEnvironmentId(imported.id); }
    } catch (failure) { setError(errorText(failure)); } finally { setBusy(null); }
  };
  const check = async () => {
    if (!selected) return;
    setBusy("check"); setError(null);
    try {
      const updated = await window.privoraDesktop.checkSecurityEnvironment(selected.id);
      setEnvironments((items) => items.map((item) => item.id === updated.id ? updated : item));
    } catch (failure) { setError(errorText(failure)); } finally { setBusy(null); }
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !environmentId || !name.trim() || !objective.trim() || !scope.trim()) return;
    setBusy("create"); setError(null);
    try {
      await window.privoraDesktop.createSecurityWorkspace({ name: name.trim(), objective: objective.trim(), scope: scope.trim(), environmentId });
      await onCreated(); onClose();
    } catch (failure) { setError(errorText(failure)); setBusy(null); }
  };
  return <SecurityDialog title="New security project" onClose={onClose}>
    <form onSubmit={(event) => void create(event)} className="security-project-form">
      <label>Project name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Internal lab" required maxLength={120} /></label>
      <label>Objective<textarea value={objective} onChange={(event) => setObjective(event.target.value)} placeholder="What should Privora investigate?" required rows={2} maxLength={12000} /></label>
      <label>Scope<textarea value={scope} onChange={(event) => setScope(event.target.value)} placeholder="Authorized systems, boundaries, and constraints" required rows={2} maxLength={12000} /></label>
      <label>Environment<select value={environmentId} onChange={(event) => setEnvironmentId(event.target.value)} disabled={Boolean(busy)} required><option value="" disabled>{busy === "load" ? "Loading environments…" : "Select Kali environment"}</option>{environments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="security-environment-actions"><button type="button" onClick={() => void importProfile()} disabled={Boolean(busy)}><FileUp size={14} />{busy === "import" ? "Importing…" : "Import connection profile"}</button><button type="button" onClick={() => void check()} disabled={Boolean(busy) || !selected}><RefreshCw size={14} className={busy === "check" ? "spin" : undefined} />{busy === "check" ? "Checking…" : "Check connection"}</button></div>
      {selected && <div className="security-environment-summary"><span>{selected.username}@{selected.host}:{selected.port}</span><span>{selected.status === "connected" ? <><CheckCircle2 size={13} /> Connected</> : selected.error || (selected.status === "unchecked" ? "Not checked" : "Disconnected")}</span></div>}
      <p className="security-form-note">Connections are saved for reuse across projects. Import a profile once per VM. Commands run in Kali using your existing access mode.</p>
      {error && <p className="security-error" role="alert">{error}</p>}
      <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="security-primary" disabled={Boolean(busy) || !environmentId || !name.trim() || !objective.trim() || !scope.trim()}>{busy === "create" ? "Creating…" : "Create project"}</button></footer>
    </form>
  </SecurityDialog>;
}

export function EditSecurityWorkspaceDialog({ workspace, renameOnly, onClose, onSaved }: { workspace: WorkspaceRecord; renameOnly: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [expectedRevision] = useState(workspace.security?.revision ?? 0);
  const [name, setName] = useState(workspace.name);
  const [objective, setObjective] = useState(workspace.security?.objective ?? "");
  const [scope, setScope] = useState(workspace.security?.scope ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(null);
    try {
      await window.privoraDesktop.updateSecurityWorkspace({ workspaceId: workspace.id, expectedRevision, name,
        ...(renameOnly ? {} : { objective, scope }) });
      await onSaved(); onClose();
    } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  };
  return <SecurityDialog title={renameOnly ? "Rename Security project" : "Edit Security project"} onClose={() => { if (!busy) onClose(); }} wide={!renameOnly}>
    <form className="security-project-form" onSubmit={(event) => void save(event)}>
      <label>Project name<input autoFocus value={name} maxLength={200} required disabled={busy} onChange={(event) => setName(event.target.value)} /></label>
      {!renameOnly && <><label>Objective<textarea value={objective} maxLength={12000} rows={4} required disabled={busy} onChange={(event) => setObjective(event.target.value)} /></label><label>Scope<textarea value={scope} maxLength={12000} rows={7} required disabled={busy} onChange={(event) => setScope(event.target.value)} /></label><p className="security-form-note">Stop project runs and reconcile outstanding jobs before changing these boundaries. Changes apply to future turns; earlier revisions and evidence are retained.</p></>}
      <p className="security-form-note">The connection, project files and existing evidence folder stay the same.</p>
      {error && <p className="security-error" role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" disabled={busy || !name.trim() || (!renameOnly && (!objective.trim() || !scope.trim()))}>{busy ? "Saving…" : "Save changes"}</button></footer>
    </form>
  </SecurityDialog>;
}

export function SecurityWorkspaceDetails({ workspace, state, error, checking, onCheck, onRefresh, onClose, onEdit }: {
  workspace: WorkspaceRecord; state: SecurityWorkspaceState | null; error: string | null; checking: boolean;
  onCheck: () => Promise<void>; onRefresh: () => Promise<void>; onClose: () => void;
  onEdit?: () => void;
}) {
  const [stopping, setStopping] = useState<Set<string>>(new Set());
  const [jobError, setJobError] = useState<string | null>(null);
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);
  const [artifactPreview, setArtifactPreview] = useState<{ jobId: string; artifact: DesktopAttachmentRecord; text?: string } | null>(null);
  const [artifactBusy, setArtifactBusy] = useState<string | null>(null);
  const [artifactSaved, setArtifactSaved] = useState<string | null>(null);
  const openArtifact = async (jobId: string, artifact: DesktopAttachmentRecord, download = false) => {
    if (artifactBusy) return;
    setArtifactBusy(artifact.id); setJobError(null); setArtifactSaved(null);
    try {
      const url = trustedArtifactUrl(artifact);
      if (download) {
        const result = await window.privoraDesktop.saveSecurityArtifact(jobId, artifact.artifactId);
        if (result.saved) setArtifactSaved(`Saved ${artifact.name}`);
        return;
      }
      if (artifact.mimeType.startsWith("image/")) { setArtifactPreview({ jobId, artifact }); return; }
      const response = await fetch(url);
      if (!response.ok) throw new Error("Evidence attachment could not be loaded");
      const blob = await response.blob();
      if (!download && (artifact.mimeType.startsWith("text/") || /json|xml|javascript/.test(artifact.mimeType)) && blob.size <= 2 * 1024 * 1024) {
        setArtifactPreview({ jobId, artifact, text: (await blob.text()).slice(0, 100_000) });
      } else {
        const result = await window.privoraDesktop.saveSecurityArtifact(jobId, artifact.artifactId);
        if (result.saved) setArtifactSaved(`Saved ${artifact.name}`);
      }
    } catch (failure) { setJobError(errorText(failure)); } finally { setArtifactBusy(null); }
  };
  const copy = async (id: string, output: string) => {
    try { await navigator.clipboard.writeText(output); setCopiedJobId(id); }
    catch (failure) { setJobError(errorText(failure)); }
  };
  const stop = async (id: string) => {
    setStopping((items) => new Set(items).add(id)); setJobError(null);
    try { await window.privoraDesktop.cancelSecurityJob(id); await onRefresh(); }
    catch (failure) { setJobError(errorText(failure)); }
    finally { setStopping((items) => { const next = new Set(items); next.delete(id); return next; }); }
  };
  return <SecurityDialog title={workspace.name} onClose={onClose} wide>
    <div className="security-details-content">
      {onEdit && <button type="button" onClick={onEdit}>Edit project</button>}
      <section aria-label="Kali environment"><div className="security-section-heading"><h3>{state?.environment?.name || "Kali environment"}</h3><button type="button" disabled={checking} onClick={() => void onCheck()}><RefreshCw size={14} className={checking ? "spin" : undefined} />{checking ? "Checking…" : "Check connection"}</button></div>
        {state?.environment && <p className="security-quiet">{state.environment.username}@{state.environment.host}:{state.environment.port} · {checking ? "Checking" : connectionLabel(state.environment)}{state.environment.capabilities ? ` · ${state.environment.capabilities.architecture}` : ""}</p>}
        {state?.environment?.error && <p className="security-error">{state.environment.error}</p>}
        <dl className="security-project-context"><dt>Objective</dt><dd>{workspace.security?.objective}</dd><dt>Scope</dt><dd>{workspace.security?.scope}</dd></dl>
      </section>
      {state?.evidenceFolder && <section aria-label="Automatic PC evidence saves"><div className="security-section-heading"><h3>Reports & evidence on this PC</h3><button type="button" onClick={() => { void window.privoraDesktop.openSecurityEvidenceFolder(workspace.id).catch((failure) => setJobError(errorText(failure))); }}><FolderOpen size={14} />Open folder</button></div><p className="security-quiet" style={{ overflowWrap: "anywhere" }}>{state.evidenceFolder}</p><p className="security-quiet">Files collected with kali_artifact are saved here automatically. Files still only in Kali must be collected first. Earlier copies are kept.</p></section>}
      {(error || jobError) && <p className="security-error" role="alert">{jobError || error}</p>}
      {artifactSaved && <p className="security-quiet" role="status">{artifactSaved}</p>}
      <section aria-label="Remote jobs"><div className="security-section-heading"><h3>Jobs</h3><button type="button" onClick={() => void onRefresh()} aria-label="Refresh remote jobs"><RefreshCw size={14} /></button></div>
        {!state ? <p className="security-quiet">Loading…</p> : !state.jobs.length ? <p className="security-quiet">Jobs will appear here when Privora uses Kali.</p> : state.jobs.map((job) => <details className="security-job" key={job.id} id={`security-job-${job.id}`}>
          <summary><span className="security-job-command">{job.commandPreview || "Remote job"}</span><span className={`security-job-state state-${job.state}`}>{job.state.replaceAll("_", " ")}</span></summary>
          <div className="security-job-body"><div className="security-job-meta"><span>{new Date(job.createdAt).toLocaleString()}{job.exitCode !== null ? ` · Exit ${job.exitCode}` : ""}</span><div className="security-job-actions">{job.outputPreview && <button type="button" onClick={() => void copy(job.id, job.outputPreview)} aria-label="Copy remote output preview"><Copy size={12} />{copiedJobId === job.id ? "Copied" : "Copy"}</button>}{activeJobStates.has(job.state) && <button type="button" disabled={stopping.has(job.id) || job.state === "stop_requested"} onClick={() => void stop(job.id)}><Square size={12} />{stopping.has(job.id) || job.state === "stop_requested" ? "Stopping…" : "Stop"}</button>}</div></div>
          {job.state === "unknown" && <p className="security-quiet">Job state is unconfirmed. It may still be running; check before starting it again.</p>}
          {job.error && <p className="security-error">{job.error}</p>}{job.outputPreview && <pre aria-label="Remote output preview">{job.outputPreview}</pre>}</div>
          {Boolean(job.artifacts?.length) && <div className="security-artifacts" aria-label="Job evidence files">{job.artifacts?.map((artifact) => <div className="security-artifact" key={artifact.id}><button type="button" onClick={() => void openArtifact(job.id, artifact)} disabled={Boolean(artifactBusy)} aria-label={`Open evidence ${artifact.name}`}><File size={13} /><span>{artifact.name}</span><small>{artifactSize(artifact.size)}</small></button><button type="button" onClick={() => void openArtifact(job.id, artifact, true)} disabled={Boolean(artifactBusy)} aria-label={`Download evidence ${artifact.name}`}><Download size={13} /></button></div>)}</div>}
        </details>)}
      </section>
      <section aria-label="Findings and evidence"><h3>Findings & evidence</h3>{!state?.findings.length ? <p className="security-quiet">Findings and supporting jobs will appear here.</p> : state.findings.map((finding) => <details key={finding.id} className="security-finding"><summary><span>{finding.title}</span><span>{finding.severity} · {finding.state}</span></summary><p>{finding.description}</p>{finding.reproduction && <><h4>Reproduction</h4><pre>{finding.reproduction}</pre></>}{finding.remediation && <><h4>Remediation</h4><p>{finding.remediation}</p></>}{finding.evidenceJobIds.length > 0 && <div className="security-finding-evidence"><h4>Evidence jobs</h4>{finding.evidenceJobIds.map((id) => <button type="button" key={id} disabled={!state.jobs.some((job) => job.id === id)} onClick={() => { const job = document.getElementById(`security-job-${id}`); job?.setAttribute("open", ""); job?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }}>{state.jobs.find((job) => job.id === id)?.commandPreview || id}</button>)}</div>}</details>)}</section>
      {artifactPreview && <section className="security-artifact-preview" aria-label={`Evidence preview: ${artifactPreview.artifact.name}`}><div className="security-section-heading"><h3>{artifactPreview.artifact.name}</h3><button type="button" onClick={() => setArtifactPreview(null)} aria-label="Close evidence preview"><X size={14} /></button></div>{artifactPreview.text !== undefined ? <pre>{artifactPreview.text}</pre> : <img src={trustedArtifactUrl(artifactPreview.artifact)} alt={artifactPreview.artifact.name} />}<button type="button" disabled={Boolean(artifactBusy)} onClick={() => void openArtifact(artifactPreview.jobId, artifactPreview.artifact, true)}><Download size={13} />Download file</button></section>}
    </div>
  </SecurityDialog>;
}
