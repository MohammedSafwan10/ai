import type { KaliCapabilities, KaliJobState } from "./kali";
import type { DesktopAttachmentRecord } from "./types";

/** Renderer-safe connection summary; credentials and local SSH paths stay in main. */
export interface SecurityEnvironmentRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  status: "unchecked" | "connected" | "disconnected" | "error";
  lastCheckedAt?: number;
  capabilities?: KaliCapabilities;
  error?: string;
}

export interface SecurityWorkspaceConfig {
  environmentId: string;
  objective: string;
  scope: string;
  revision?: number;
  evidenceFolderName?: string;
}
export interface UpdateSecurityWorkspaceInput {
  workspaceId: string;
  expectedRevision: number;
  name?: string;
  objective?: string;
  scope?: string;
}

export interface CreateSecurityWorkspaceInput extends SecurityWorkspaceConfig {
  name: string;
}

/** Durable job identity and bounded, redacted display data, never raw argv. */
export interface SecurityJobRecord {
  id: string;
  remoteJobId: string | null;
  workspaceId: string;
  threadId: string;
  messageId?: string;
  toolCallId?: string;
  environmentId: string;
  idempotencyKey: string;
  projectId: string;
  state: KaliJobState | "submitting";
  sequence: number;
  outputPreview: string;
  commandPreview: string;
  exitCode: number | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  artifacts?: DesktopAttachmentRecord[];
}

export interface SecurityFindingRecord {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  state: "candidate" | "observed" | "verified" | "rejected" | "stale";
  reproduction: string;
  remediation: string;
  evidenceJobIds: string[];
  createdAt: number;
  updatedAt: number;
  report?: SecurityReportReview;
  reportHistory?: SecurityReportReview[];
  reportEvents?: SecurityReportEvent[];
}

export const reportCheckLabels = {
  preconditions: "Roles, memberships, versions and preconditions",
  reproduction: "Exact report steps replayed on a fresh fixture",
  transcripts: "Redacted requests, responses and negative controls",
  impact: "Concrete unauthorized impact and intended behavior",
  policy: "Current scope, exclusions and known issues checked",
  independentReview: "Independent review and objections resolved",
} as const;
export type SecurityReportCheck = keyof typeof reportCheckLabels;
export interface SecurityReportReview {
  status: "draft" | "ready_for_review";
  basedOnUpdatedAt: number;
  authorThreadId: string;
  scopeRevision: number;
  checks: Record<SecurityReportCheck, { notes: string; jobIds: string[] }>;
  unresolved: string[];
  reportJobId: string;
  reportArtifactId: string;
}
export interface SecurityReportEvent {
  kind: "submitted" | "accepted" | "not_applicable" | "duplicate" | "informative" | "withdrawn";
  reference: string;
  at: number;
  findingUpdatedAt: number;
}

export interface SecurityWorkspaceState {
  evidenceFolder?: string;
  environment: SecurityEnvironmentRecord | null;
  jobs: SecurityJobRecord[];
  findings: SecurityFindingRecord[];
}

export interface SecurityWorkspaceService {
  importEnvironmentProfile(profile: unknown): Promise<SecurityEnvironmentRecord>;
  checkEnvironment(id: string): Promise<SecurityEnvironmentRecord>;
  cancelJob(id: string): Promise<SecurityJobRecord>;
  ensureEvidenceFolder?(workspaceId: string): Promise<string>;
  getWorkspaceState?(workspaceId: string): Promise<SecurityWorkspaceState>;
}
