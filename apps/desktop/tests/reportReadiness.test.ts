import { describe, expect, it } from "vitest";
import { assessReportReadiness } from "../src/shared/reportReadiness";
import { reportCheckLabels, type SecurityFindingRecord, type SecurityJobRecord, type SecurityReportReview } from "../src/shared/securityWorkspace";
import { reportReviewInputSchema } from "../src/main/kali/reportReview";

export function reportFixture() {
  const job: SecurityJobRecord = { id: "repro", workspaceId: "lab", threadId: "author", environmentId: "kali", remoteJobId: "remote", idempotencyKey: "key", projectId: "project", state: "succeeded", outputPreview: "Retained fixture transcript", commandPreview: "test", sequence: 1, exitCode: 0, error: null, createdAt: 1, updatedAt: 1 };
  const reviewer = { ...job, id: "review", threadId: "reviewer" };
  const reportJob: SecurityJobRecord = { ...job, id: "report", artifacts: [{ id: "attachment", artifactId: "report.md", name: "report.md", mimeType: "text/markdown", size: 4000, createdAt: 1, url: "privora-attachment://artifact/report.md" }] };
  const report: SecurityReportReview = { status: "ready_for_review", basedOnUpdatedAt: 2, authorThreadId: "author", scopeRevision: 0, checks: Object.fromEntries(Object.keys(reportCheckLabels).map((key) => [key, { notes: `${key} checked against retained evidence`, jobIds: [key === "independentReview" ? "review" : "repro"] }])) as SecurityReportReview["checks"], unresolved: [], reportJobId: "report", reportArtifactId: "report.md" };
  const finding: SecurityFindingRecord = { id: "finding", workspaceId: "lab", title: "Boundary", description: "Observed impact", severity: "low", state: "verified", reproduction: "Exact fixture steps", remediation: "Enforce policy", evidenceJobIds: ["repro"], createdAt: 1, updatedAt: 2, report };
  return { finding, jobs: [job, reviewer, reportJob] };
}

describe("report readiness", () => {
  it("does not equate a legacy verified finding with a reviewed report", () => {
    const { finding, jobs } = reportFixture(); delete finding.report;
    expect(assessReportReadiness(finding, jobs)).toMatchObject({ ready: false, gaps: ["No report review recorded."] });
  });
  it("accepts complete retained review records and invalidates edited findings", () => {
    const { finding, jobs } = reportFixture();
    expect(assessReportReadiness(finding, jobs).ready).toBe(true);
    expect(assessReportReadiness(finding, jobs, 1).gaps.join(" ")).toContain("scope changed");
    finding.updatedAt++;
    expect(assessReportReadiness(finding, jobs).gaps.join(" ")).toContain("changed after");
  });
  it.each(["failed", "running", "unknown", "cancelled"] as const)("blocks %s evidence, foreign jobs and missing exports", (state) => {
    const { finding, jobs } = reportFixture(); jobs[0].state = state; jobs[1].workspaceId = "other"; jobs[2].artifacts = [];
    const result = assessReportReadiness(finding, jobs);
    expect(result.ready).toBe(false);
    expect(result.gaps.join(" ")).toContain("Collect the complete report");
    expect(result.gaps.join(" ")).toContain("Independent review");
  });
  it("blocks self-review, unresolved objections and unsupported image-only reports", () => {
    const { finding, jobs } = reportFixture(); jobs[1].threadId = "author";
    finding.report!.unresolved = ["Intended permission behavior unresolved"];
    jobs[2].artifacts![0].mimeType = "image/png";
    const result = assessReportReadiness(finding, jobs);
    expect(result.ready).toBe(false); expect(result.gaps).toContain("Unresolved: Intended permission behavior unresolved");
    expect(result.gaps.join(" ")).toContain("different chat");
  });
  it("rejects booleans, unexpected fields and malformed check records", () => {
    const { finding } = reportFixture();
    expect(reportReviewInputSchema.safeParse({ ready: true }).success).toBe(false);
    const { authorThreadId: _author, basedOnUpdatedAt: _version, scopeRevision: _scope, ...input } = finding.report!;
    expect(reportReviewInputSchema.safeParse(input).success).toBe(true);
    expect(reportReviewInputSchema.safeParse({ ...input, submitted: true }).success).toBe(false);
    expect(reportReviewInputSchema.safeParse({ ...input, checks: {} }).success).toBe(false);
  });
});
