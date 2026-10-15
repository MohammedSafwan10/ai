import { reportCheckLabels, type SecurityFindingRecord, type SecurityJobRecord } from "./securityWorkspace";

/** Checks retained records, not the scientific truth of the model's interpretation. */
export function assessReportReadiness(finding: SecurityFindingRecord, jobs: SecurityJobRecord[], scopeRevision = 0) {
  const gaps: string[] = [];
  const report = finding.report;
  const retained = (id: string) => jobs.find((job) => job.id === id && job.workspaceId === finding.workspaceId && job.state === "succeeded" && (job.outputPreview.trim() || job.artifacts?.length));
  if (finding.state !== "verified" || !finding.reproduction.trim()) gaps.push("Finding needs a verified reproduction.");
  if (!finding.evidenceJobIds.length || finding.evidenceJobIds.some((id) => !retained(id))) gaps.push("Finding evidence is missing or unsuccessful.");
  if (!report) return { ready: false, gaps: [...gaps, "No report review recorded."] };
  if (report.status !== "ready_for_review") gaps.push("Report is still a draft.");
  if (report.basedOnUpdatedAt !== finding.updatedAt) gaps.push("Finding changed after this report review; repeat the review.");
  if (report.scopeRevision !== scopeRevision) gaps.push("Project objective or scope changed; repeat the report review.");
  for (const [key, label] of Object.entries(reportCheckLabels)) {
    const check = report.checks[key as keyof typeof reportCheckLabels];
    if (!check?.notes.trim() || !check.jobIds.length || check.jobIds.some((id) => !retained(id))) gaps.push(`${label}: notes and successful retained evidence required.`);
  }
  const reviewJobs = report.checks.independentReview?.jobIds ?? [];
  if (!reviewJobs.some((id) => { const job = retained(id); return job && job.threadId !== report.authorThreadId; })) gaps.push("Independent review needs evidence from a different chat or subagent.");
  if (report.unresolved.length) gaps.push(...report.unresolved.map((item) => `Unresolved: ${item}`));
  const artifact = retained(report.reportJobId)?.artifacts?.find((item) => item.artifactId === report.reportArtifactId);
  if (!artifact || !artifact.size || !/^(text\/|application\/(pdf|json))/.test(artifact.mimeType)) gaps.push("Collect the complete report as a text, JSON or PDF evidence artifact.");
  return { ready: gaps.length === 0, gaps };
}
