import { useState } from "react";
import { assessReportReadiness } from "../../../shared/reportReadiness";
import { reportCheckLabels, type SecurityFindingRecord, type SecurityJobRecord, type SecurityReportEvent } from "../../../shared/securityWorkspace";

export function ReportReadiness({ finding, jobs, scopeRevision, onRefresh }: { finding: SecurityFindingRecord; jobs: SecurityJobRecord[]; scopeRevision: number; onRefresh: () => Promise<void> }) {
  const readiness = assessReportReadiness(finding, jobs, scopeRevision);
  const [kind, setKind] = useState<SecurityReportEvent["kind"]>("submitted");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitted = finding.reportEvents?.some((event) => event.kind === "submitted");
  const save = async () => {
    setBusy(true); setError("");
    try { await window.privoraDesktop.recordSecurityReportEvent(finding.id, finding.updatedAt, kind, reference); setReference(""); await onRefresh(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); }
  };
  return <section className="security-report-readiness" aria-label={`Report readiness: ${finding.title}`}>
    <h4>{readiness.ready ? "Ready for user review" : "Report review incomplete"}</h4>
    <p className="security-quiet">Technical state: {finding.state}. Readiness checks recorded evidence; it does not guarantee valid impact or program acceptance.</p>
    {readiness.gaps.length > 0 && <ul>{readiness.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>}
    {finding.report && <dl>{Object.entries(reportCheckLabels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{finding.report?.checks[key as keyof typeof reportCheckLabels]?.notes || "Not recorded"}</dd></div>)}</dl>}
    {Boolean(finding.reportHistory?.length) && <p className="security-quiet">{finding.reportHistory?.length} previous report review(s) preserved.</p>}
    {finding.reportEvents?.map((event, index) => <p key={`${event.at}-${index}`}>{event.kind.replaceAll("_", " ")} · {new Date(event.at).toLocaleString()} · {event.reference}{event.findingUpdatedAt !== finding.updatedAt ? " (earlier finding version)" : ""}</p>)}
    <details className="security-report-status"><summary>Record submission or triage outcome</summary>
      <p className="security-quiet">Record an action you already took or an outcome the program confirmed. This does not send a report.</p>
      <label>Status<select value={kind} disabled={busy} onChange={(event) => setKind(event.target.value as SecurityReportEvent["kind"])}>
        <option value="submitted">Submitted</option><option value="accepted">Accepted</option><option value="not_applicable">Not applicable</option><option value="duplicate">Duplicate</option><option value="informative">Informative</option><option value="withdrawn">Withdrawn</option>
      </select></label>
      <label>Submission link or program response reference<input value={reference} maxLength={2000} disabled={busy} onChange={(event) => setReference(event.target.value)} placeholder="Submission URL or outcome reference" /></label>
      <button type="button" disabled={busy || !reference.trim() || (kind === "submitted" ? !readiness.ready : !submitted)} onClick={() => void save()}>{busy ? "Recording…" : "Record status"}</button>
      {error && <p className="security-error" role="alert">{error}</p>}
    </details>
  </section>;
}
