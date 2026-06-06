import fs from "node:fs";
import path from "node:path";
import type {
  BrowserEvidenceRecord,
  BrowserWorkflowAssertion,
  BrowserWorkflowAssertionKind,
  BrowserWorkflowAssertionResult,
  BrowserWorkflowDiagnosisKind,
  BrowserWorkflowDiagnosisRecord,
  BrowserWorkflowPanelStateRecord,
  BrowserWorkflowRecord,
  BrowserWorkflowRunRecord,
  BrowserWorkflowRunStatus,
  BrowserWorkflowStep,
  BrowserWorkflowStepResult,
  BrowserWorkflowTargetStrategy,
  DesktopToolCall,
  ToolResult,
} from "../../shared/types";
import { compactUrl, redactSensitiveText } from "./browserSecurity";

interface BrowserWorkflowDataFile {
  workflows: BrowserWorkflowRecord[];
  runs: BrowserWorkflowRunRecord[];
  evidence: BrowserEvidenceRecord[];
}

interface RecordStepInput {
  workspaceId: string;
  action: string;
  args: Record<string, unknown>;
  targetStrategy?: BrowserWorkflowTargetStrategy;
  createdFromToolEventId?: string;
}

interface EvidenceInput {
  workspaceId: string;
  workflowId?: string;
  runId?: string;
  tabId?: string;
  data: Record<string, unknown>;
}

const MAX_WORKFLOWS_PER_WORKSPACE = 50;
const MAX_RUNS_PER_WORKSPACE = 50;
const MAX_EVIDENCE_PER_WORKFLOW = 20;
const MAX_EVIDENCE_PER_WORKSPACE = 160;
const WORKFLOW_TOOL_ACTIONS = new Set([
  "browser_open",
  "browser_open_link",
  "browser_wait",
  "browser_act",
  "browser_trace",
  "browser_form_fill",
  "browser_form_submit",
  "browser_screenshot",
  "browser_extract",
  "browser_evidence",
  "browser_verify",
]);

export class BrowserWorkflowManager {
  private data: BrowserWorkflowDataFile;
  private activeRecordings = new Map<string, string>();

  constructor(private userDataPath: string) {
    fs.mkdirSync(userDataPath, { recursive: true });
    this.data = this.readData();
  }

  panelState(workspaceId: string): BrowserWorkflowPanelStateRecord {
    const activeWorkflowId = this.activeRecordings.get(workspaceId);
    const active = activeWorkflowId ? this.getWorkflow(workspaceId, activeWorkflowId) : null;
    const lastRun = this.runsForWorkspace(workspaceId)[0];
    return {
      status: active ? "recording" : "idle",
      activeWorkflowId: active?.id,
      activeWorkflowName: active?.name,
      stepCount: active?.steps.length || 0,
      assertionCount: active?.assertions.length || 0,
      workflows: this.workflowsForWorkspace(workspaceId).map((workflow) => ({
        id: workflow.id,
        name: workflow.name,
        stepCount: workflow.steps.length,
        assertionCount: workflow.assertions.length,
        updatedAt: workflow.updatedAt,
        lastRunStatus: this.runsForWorkflow(workflow.id)[0]?.status,
      })),
      lastRun,
      recentEvidence: this.evidenceForWorkspace(workspaceId).slice(0, 12),
      updatedAt: Date.now(),
    };
  }

  startRecording(workspaceId: string, name?: string, description?: string) {
    const timestamp = Date.now();
    const workflow: BrowserWorkflowRecord = {
      id: crypto.randomUUID(),
      workspaceId,
      name: normalizeWorkflowName(name) || `Workflow ${new Date(timestamp).toLocaleString()}`,
      description: description ? redactSensitiveText(description, 500) : undefined,
      steps: [],
      assertions: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.data.workflows = [workflow, ...this.workflowsForWorkspace(workspaceId), ...this.data.workflows.filter((item) => item.workspaceId !== workspaceId)]
      .slice(0, this.data.workflows.length + 1);
    this.activeRecordings.set(workspaceId, workflow.id);
    this.enforceWorkflowLimit(workspaceId);
    this.writeData();
    return workflow;
  }

  stopRecording(workspaceId: string, workflowId?: string) {
    const activeId = workflowId || this.activeRecordings.get(workspaceId);
    if (activeId && this.activeRecordings.get(workspaceId) === activeId) this.activeRecordings.delete(workspaceId);
    this.writeData();
    return activeId ? this.getWorkflow(workspaceId, activeId) : null;
  }

  list(workspaceId: string) {
    return this.workflowsForWorkspace(workspaceId);
  }

  get(workspaceId: string, workflowId: string | undefined) {
    const workflow = workflowId ? this.getWorkflow(workspaceId, workflowId) : this.currentOrLatestWorkflow(workspaceId);
    if (!workflow) throw new Error("Browser workflow not found.");
    return workflow;
  }

  rename(workspaceId: string, workflowId: string | undefined, name?: string, description?: string) {
    const workflow = this.get(workspaceId, workflowId);
    const timestamp = Date.now();
    const next = {
      ...workflow,
      name: normalizeWorkflowName(name) || workflow.name,
      description: description !== undefined ? redactSensitiveText(description, 500) : workflow.description,
      updatedAt: timestamp,
    };
    this.data.workflows = this.data.workflows.map((item) => item.id === workflow.id ? next : item);
    this.writeData();
    return next;
  }

  delete(workspaceId: string, workflowId: string | undefined) {
    const workflow = this.get(workspaceId, workflowId);
    this.data.workflows = this.data.workflows.filter((item) => item.id !== workflow.id);
    this.data.runs = this.data.runs.filter((run) => run.workflowId !== workflow.id);
    this.data.evidence = this.data.evidence.filter((evidence) => evidence.workflowId !== workflow.id);
    if (this.activeRecordings.get(workspaceId) === workflow.id) this.activeRecordings.delete(workspaceId);
    this.writeData();
    return workflow;
  }

  recordStep(input: RecordStepInput) {
    const workflowId = this.activeRecordings.get(input.workspaceId);
    if (!workflowId || !WORKFLOW_TOOL_ACTIONS.has(input.action)) return null;
    const workflow = this.getWorkflow(input.workspaceId, workflowId);
    if (!workflow) return null;
    const step: BrowserWorkflowStep = {
      id: crypto.randomUUID(),
      action: input.action,
      args: sanitizeWorkflowArgs(input.action, input.args),
      targetStrategy: sanitizeTargetStrategy(input.targetStrategy),
      redactionLevel: workflowArgsLookSensitive(input.args) ? "sensitive" : "standard",
      createdFromToolEventId: input.createdFromToolEventId,
      createdAt: Date.now(),
    };
    const next = {
      ...workflow,
      steps: [...workflow.steps, step].slice(-200),
      updatedAt: Date.now(),
    };
    this.data.workflows = this.data.workflows.map((item) => item.id === workflow.id ? next : item);
    this.writeData();
    return step;
  }

  addAssertion(workspaceId: string, input: {
    workflowId?: string;
    kind?: BrowserWorkflowAssertionKind;
    value?: string;
    ref?: string;
    formId?: string;
    screenshotPath?: string;
  }) {
    const workflow = this.get(workspaceId, input.workflowId);
    const kind = normalizeAssertionKind(input.kind);
    const assertion: BrowserWorkflowAssertion = {
      id: crypto.randomUUID(),
      kind,
      value: input.value ? redactSensitiveText(input.value, 1000) : undefined,
      ref: input.ref,
      formId: input.formId,
      screenshotPath: input.screenshotPath,
      createdAt: Date.now(),
    };
    const next = {
      ...workflow,
      assertions: [...workflow.assertions, assertion].slice(-80),
      updatedAt: Date.now(),
    };
    this.data.workflows = this.data.workflows.map((item) => item.id === workflow.id ? next : item);
    this.writeData();
    return assertion;
  }

  removeAssertion(workspaceId: string, workflowId: string | undefined, assertionId: string | undefined) {
    if (!assertionId) throw new Error("browser_assert remove requires assertionId.");
    const workflow = this.get(workspaceId, workflowId);
    const next = {
      ...workflow,
      assertions: workflow.assertions.filter((assertion) => assertion.id !== assertionId),
      updatedAt: Date.now(),
    };
    this.data.workflows = this.data.workflows.map((item) => item.id === workflow.id ? next : item);
    this.writeData();
    return next;
  }

  beginRun(workspaceId: string, workflowId: string) {
    const run: BrowserWorkflowRunRecord = {
      id: crypto.randomUUID(),
      workspaceId,
      workflowId,
      status: "running",
      startedAt: Date.now(),
      stepResults: [],
      assertionResults: [],
      evidenceIds: [],
    };
    this.data.runs = [run, ...this.data.runs];
    this.writeData();
    return run;
  }

  updateRun(run: BrowserWorkflowRunRecord) {
    this.data.runs = this.data.runs.map((item) => item.id === run.id ? run : item);
    this.enforceRunLimit(run.workspaceId);
    this.writeData();
    return run;
  }

  finishRun(run: BrowserWorkflowRunRecord, status: BrowserWorkflowRunStatus, diagnosis?: BrowserWorkflowDiagnosisRecord) {
    return this.updateRun({
      ...run,
      status,
      diagnosis,
      endedAt: Date.now(),
    });
  }

  saveEvidence(input: EvidenceInput) {
    const record = buildEvidenceRecord(input);
    this.data.evidence = [record, ...this.data.evidence];
    this.enforceEvidenceLimit(input.workspaceId, input.workflowId);
    this.writeData();
    return record;
  }

  listEvidence(workspaceId: string) {
    return this.evidenceForWorkspace(workspaceId);
  }

  getEvidence(workspaceId: string, evidenceId: string | undefined) {
    const evidence = evidenceId
      ? this.data.evidence.find((item) => item.workspaceId === workspaceId && item.id === evidenceId)
      : this.evidenceForWorkspace(workspaceId)[0];
    if (!evidence) throw new Error("Browser evidence not found.");
    return evidence;
  }

  getRun(workspaceId: string, runId: string | undefined) {
    const run = runId
      ? this.data.runs.find((item) => item.workspaceId === workspaceId && item.id === runId)
      : this.runsForWorkspace(workspaceId)[0];
    if (!run) throw new Error("Browser workflow run not found.");
    return run;
  }

  pruneEvidence(workspaceId: string) {
    const before = this.data.evidence.length;
    this.enforceEvidenceLimit(workspaceId);
    this.writeData();
    return before - this.data.evidence.length;
  }

  diagnose(workspaceId: string, error?: unknown, output?: string) {
    const evidence = this.evidenceForWorkspace(workspaceId)[0];
    const explicitText = [error instanceof Error ? error.message : String(error || ""), output || ""].join("\n").trim();
    if (explicitText) return classifyDiagnosis(explicitText, evidence?.id);
    const recentRun = this.runsForWorkspace(workspaceId).find((run) => run.status === "failed") || this.runsForWorkspace(workspaceId)[0];
    if (recentRun?.diagnosis) return recentRun.diagnosis;
    return classifyDiagnosis("", evidence?.id);
  }

  private workflowsForWorkspace(workspaceId: string) {
    return this.data.workflows
      .filter((workflow) => workflow.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private runsForWorkspace(workspaceId: string) {
    return this.data.runs
      .filter((run) => run.workspaceId === workspaceId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  private runsForWorkflow(workflowId: string) {
    return this.data.runs
      .filter((run) => run.workflowId === workflowId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  private evidenceForWorkspace(workspaceId: string) {
    return this.data.evidence
      .filter((evidence) => evidence.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  private getWorkflow(workspaceId: string, workflowId: string) {
    return this.data.workflows.find((workflow) => workflow.workspaceId === workspaceId && workflow.id === workflowId) || null;
  }

  private currentOrLatestWorkflow(workspaceId: string) {
    const activeId = this.activeRecordings.get(workspaceId);
    if (activeId) return this.getWorkflow(workspaceId, activeId);
    return this.workflowsForWorkspace(workspaceId)[0] || null;
  }

  private enforceWorkflowLimit(workspaceId: string) {
    const keep = new Set(this.workflowsForWorkspace(workspaceId).slice(0, MAX_WORKFLOWS_PER_WORKSPACE).map((item) => item.id));
    this.data.workflows = this.data.workflows.filter((workflow) => workflow.workspaceId !== workspaceId || keep.has(workflow.id));
  }

  private enforceRunLimit(workspaceId: string) {
    const keep = new Set(this.runsForWorkspace(workspaceId).slice(0, MAX_RUNS_PER_WORKSPACE).map((item) => item.id));
    this.data.runs = this.data.runs.filter((run) => run.workspaceId !== workspaceId || keep.has(run.id));
  }

  private enforceEvidenceLimit(workspaceId: string, workflowId?: string) {
    const workspaceEvidence = this.evidenceForWorkspace(workspaceId);
    const keep = new Set(workspaceEvidence.slice(0, MAX_EVIDENCE_PER_WORKSPACE).map((item) => item.id));
    if (workflowId) {
      this.data.evidence
        .filter((item) => item.workspaceId === workspaceId && item.workflowId === workflowId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, MAX_EVIDENCE_PER_WORKFLOW)
        .forEach((item) => keep.add(item.id));
    }
    this.data.evidence = this.data.evidence.filter((item) => item.workspaceId !== workspaceId || keep.has(item.id));
  }

  private readData(): BrowserWorkflowDataFile {
    const filePath = this.filePath();
    if (!fs.existsSync(filePath)) return { workflows: [], runs: [], evidence: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<BrowserWorkflowDataFile>;
      return {
        workflows: Array.isArray(parsed.workflows) ? parsed.workflows.map(normalizeWorkflow).filter(Boolean) as BrowserWorkflowRecord[] : [],
        runs: Array.isArray(parsed.runs) ? parsed.runs.map(normalizeRun).filter(Boolean) as BrowserWorkflowRunRecord[] : [],
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence.map(normalizeEvidence).filter(Boolean) as BrowserEvidenceRecord[] : [],
      };
    } catch {
      const backup = `${filePath}.corrupt-${Date.now()}.bak`;
      try {
        fs.renameSync(filePath, backup);
      } catch {
        // best effort
      }
      return { workflows: [], runs: [], evidence: [] };
    }
  }

  private writeData() {
    const filePath = this.filePath();
    const tempPath = `${filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), "utf8");
    fs.renameSync(tempPath, filePath);
  }

  private filePath() {
    return path.join(this.userDataPath, "browser-workflows-v1.json");
  }
}

export const workflowListOutput = (workflows: BrowserWorkflowRecord[]) =>
  workflows.length
    ? workflows.map((workflow) => `${workflow.id} ${workflow.name} (${workflow.steps.length} steps, ${workflow.assertions.length} assertions)`).join("\n")
    : "No browser workflows recorded yet.";

export const workflowRunOutput = (run: BrowserWorkflowRunRecord) => {
  const passedSteps = run.stepResults.filter((step) => step.status === "passed").length;
  const failedSteps = run.stepResults.filter((step) => step.status === "failed").length;
  const failedAssertions = run.assertionResults.filter((assertion) => !assertion.passed);
  return [
    `Workflow run ${run.status}: ${passedSteps} step(s) passed, ${failedSteps} failed.`,
    failedAssertions.length ? `Assertions failed: ${failedAssertions.map((item) => item.finding).join("; ")}` : "Assertions passed.",
    run.diagnosis?.finding ? `Diagnosis: ${run.diagnosis.finding}` : "",
    run.evidenceIds.length ? `Evidence: ${run.evidenceIds.join(", ")}` : "",
  ].filter(Boolean).join("\n");
};

export const assertionResultsOutput = (results: BrowserWorkflowAssertionResult[]) =>
  results.length
    ? results.map((result) => `${result.passed ? "PASS" : "FAIL"} ${result.kind}: ${result.finding}`).join("\n")
    : "No assertions configured.";

export const evidenceListOutput = (evidence: BrowserEvidenceRecord[]) =>
  evidence.length
    ? evidence.slice(0, 20).map((item) => `${item.id} ${item.title || item.url} ${item.timestamp}`).join("\n")
    : "No saved browser evidence yet.";

export const diagnoseToolFailure = (error: unknown, result?: ToolResult) =>
  classifyDiagnosis([error instanceof Error ? error.message : String(error || ""), result?.error || "", result?.output || ""].join("\n"));

export const stepResult = (
  step: BrowserWorkflowStep,
  status: BrowserWorkflowStepResult["status"],
  startedAt: number,
  patch: Partial<BrowserWorkflowStepResult> = {},
): BrowserWorkflowStepResult => ({
  stepId: step.id,
  action: step.action,
  status,
  startedAt,
  endedAt: Date.now(),
  ...patch,
});

export const classifyDiagnosis = (message: string, evidenceId?: string): BrowserWorkflowDiagnosisRecord => {
  const text = message.toLowerCase();
  const kind: BrowserWorkflowDiagnosisKind =
    /approval|not allowed|blocked|scheme|captcha/.test(text) ? "blocked_by_policy" :
    /401|403|unauthorized|forbidden|auth/.test(text) ? "auth_error" :
    /5\d\d|network|failed request|err_connection|timeout|timed out/.test(text) ? "network_error" :
    /console|exception|typeerror|referenceerror|syntaxerror/.test(text) ? "console_error" :
    /disabled|not enabled|submit ready: no/.test(text) ? "element_disabled" :
    /validation|required|invalid|constraint/.test(text) ? "validation_failed" :
    /not found|missing|needs a snapshot ref|cannot resolve|no element/.test(text) ? "element_missing" :
    /navigate|load failed|err_name|err_aborted/.test(text) ? "navigation_failed" :
    /stale|changed|ref/.test(text) ? "stale_target" :
    "unknown";
  return {
    kind,
    finding: diagnosisFinding(kind, message),
    evidenceId,
    details: message ? [redactSensitiveText(message.replace(/\s+/g, " ").trim(), 800)] : undefined,
  };
};

const diagnosisFinding = (kind: BrowserWorkflowDiagnosisKind, message: string) => {
  const compact = redactSensitiveText(message.replace(/\s+/g, " ").trim(), 280);
  const suffix = compact ? ` ${compact}` : "";
  if (kind === "element_missing" && /text[_\s-]*present|text missing/i.test(message)) return `Expected page text was missing.${suffix}`;
  if (kind === "element_missing") return `Target element could not be resolved.${suffix}`;
  if (kind === "element_disabled") return `Target element was present but not actionable.${suffix}`;
  if (kind === "validation_failed") return `Form validation prevented the workflow step.${suffix}`;
  if (kind === "network_error") return `Network failure was captured during the workflow step.${suffix}`;
  if (kind === "auth_error") return `Authentication or authorization blocked the workflow step.${suffix}`;
  if (kind === "console_error") return `Console error was captured during the workflow step.${suffix}`;
  if (kind === "navigation_failed") return `Navigation failed during the workflow step.${suffix}`;
  if (kind === "blocked_by_policy") return `Privora blocked the workflow step by browser safety policy.${suffix}`;
  if (kind === "stale_target") return `The recorded target appears stale.${suffix}`;
  return `Workflow step failed.${suffix}`;
};

const normalizeWorkflowName = (value: unknown) =>
  String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);

const normalizeAssertionKind = (kind: unknown): BrowserWorkflowAssertionKind => {
  const value = String(kind || "text_present").trim().toLowerCase();
  const allowed: BrowserWorkflowAssertionKind[] = [
    "text_present",
    "text_absent",
    "url_contains",
    "no_console_errors",
    "no_failed_requests",
    "element_visible",
    "form_valid",
    "screenshot_changed",
    "pdf_contains",
  ];
  if (allowed.includes(value as BrowserWorkflowAssertionKind)) return value as BrowserWorkflowAssertionKind;
  throw new Error(`Unknown browser assertion kind: ${value}`);
};

const sanitizeWorkflowArgs = (action: string, args: Record<string, unknown>) => {
  const clone = JSON.parse(JSON.stringify(args || {})) as Record<string, unknown>;
  if (typeof clone.url === "string") clone.url = compactUrl(clone.url);
  if (typeof clone.query === "string") clone.query = redactSensitiveText(clone.query, 500);
  if (typeof clone.text === "string" && workflowArgsLookSensitive(clone)) clone.text = "[redacted]";
  if (Array.isArray(clone.fields)) {
    clone.fields = clone.fields.map((field) => {
      if (!field || typeof field !== "object") return field;
      const data = field as Record<string, unknown>;
      const sensitive = workflowArgsLookSensitive(data);
      return {
        fieldId: typeof data.fieldId === "string" ? data.fieldId : undefined,
        name: typeof data.name === "string" ? redactSensitiveText(data.name, 160) : undefined,
        label: typeof data.label === "string" ? redactSensitiveText(data.label, 240) : undefined,
        value: sensitive ? "[redacted]" : sanitizeReplayFieldValue(data),
      };
    });
  }
  if (["browser_evidence", "browser_screenshot", "browser_extract", "browser_wait", "browser_verify"].includes(action)) {
    return clone;
  }
  return redactObject(clone);
};

const redactObject = (value: Record<string, unknown>) => {
  const result: Record<string, unknown> = {};
  Object.entries(value).forEach(([key, item]) => {
    if (/password|passwd|pwd|otp|mfa|2fa|credit.?card|card|cvv|cvc|ssn|api.?key|secret|token|cookie/i.test(key)) {
      result[key] = "[redacted]";
    } else if (typeof item === "string") {
      result[key] = redactSensitiveText(item, 1000);
    } else {
      result[key] = item;
    }
  });
  return result;
};

const workflowArgsLookSensitive = (args: Record<string, unknown>) =>
  /password|passwd|pwd|otp|mfa|2fa|credit.?card|card number|cvv|cvc|ssn|api.?key|secret|token|cookie|bearer/i.test(JSON.stringify(args || {}));

const sanitizeReplayFieldValue = (data: Record<string, unknown>) => {
  if (typeof data.value === "boolean") return data.value;
  const value = String(data.value ?? "");
  const hint = [data.name, data.label, data.fieldId].map((item) => String(item || "").toLowerCase()).join(" ");
  if (/email|e-mail/.test(hint) || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return "privora@example.test";
  if (/phone|tel|mobile/.test(hint)) return "5550100";
  if (/url|website|site/.test(hint)) return "https://example.test";
  if (/amount|count|quantity|number/.test(hint) && /^-?\d+(?:\.\d+)?$/.test(value)) return value;
  return redactSensitiveText(value, 1000);
};

const sanitizeTargetStrategy = (target?: BrowserWorkflowTargetStrategy): BrowserWorkflowTargetStrategy | undefined => {
  if (!target) return undefined;
  return {
    ref: target.ref,
    role: target.role ? redactSensitiveText(target.role, 80) : undefined,
    name: target.name ? redactSensitiveText(target.name, 160) : undefined,
    text: target.text ? redactSensitiveText(target.text, 200) : undefined,
    formId: target.formId,
    formLabel: target.formLabel ? redactSensitiveText(target.formLabel, 160) : undefined,
    fieldId: target.fieldId,
    fieldName: target.fieldName ? redactSensitiveText(target.fieldName, 160) : undefined,
    fieldLabel: target.fieldLabel ? redactSensitiveText(target.fieldLabel, 160) : undefined,
    x: Number.isFinite(target.x) ? target.x : undefined,
    y: Number.isFinite(target.y) ? target.y : undefined,
  };
};

const buildEvidenceRecord = (input: EvidenceInput): BrowserEvidenceRecord => {
  const data = input.data || {};
  const consoleEntries = Array.isArray(data.console) ? data.console : [];
  const requests = Array.isArray(data.requests) ? data.requests : [];
  const artifactPaths = [
    typeof data.screenshotPath === "string" ? data.screenshotPath : "",
    typeof data.artifactPath === "string" ? data.artifactPath : "",
  ].filter(Boolean);
  return {
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    workflowId: input.workflowId,
    runId: input.runId,
    tabId: input.tabId,
    url: compactUrl(String(data.url || "")),
    title: redactSensitiveText(String(data.title || ""), 240),
    timestamp: typeof data.timestamp === "string" ? data.timestamp : new Date().toISOString(),
    artifactPaths,
    consoleSummary: consoleEntries.slice(-8).map((entry) => redactSensitiveText(JSON.stringify(entry), 500)),
    networkSummary: requests.slice(-8).map((entry) => redactSensitiveText(JSON.stringify(entry), 500)),
    textSummary: redactSensitiveText(String(data.visibleText || data.text || ""), 2000),
    metadata: typeof data.metadata === "object" && data.metadata ? data.metadata as Record<string, unknown> : undefined,
    createdAt: Date.now(),
  };
};

const normalizeWorkflow = (workflow: BrowserWorkflowRecord): BrowserWorkflowRecord | null => {
  if (!workflow?.id || !workflow.workspaceId) return null;
  return {
    ...workflow,
    name: normalizeWorkflowName(workflow.name) || "Workflow",
    steps: Array.isArray(workflow.steps) ? workflow.steps : [],
    assertions: Array.isArray(workflow.assertions) ? workflow.assertions : [],
    createdAt: Number(workflow.createdAt) || Date.now(),
    updatedAt: Number(workflow.updatedAt) || Date.now(),
  };
};

const normalizeRun = (run: BrowserWorkflowRunRecord): BrowserWorkflowRunRecord | null => {
  if (!run?.id || !run.workspaceId || !run.workflowId) return null;
  return {
    ...run,
    status: ["running", "passed", "failed", "cancelled"].includes(run.status) ? run.status : "failed",
    stepResults: Array.isArray(run.stepResults) ? run.stepResults : [],
    assertionResults: Array.isArray(run.assertionResults) ? run.assertionResults : [],
    evidenceIds: Array.isArray(run.evidenceIds) ? run.evidenceIds : [],
    startedAt: Number(run.startedAt) || Date.now(),
  };
};

const normalizeEvidence = (evidence: BrowserEvidenceRecord): BrowserEvidenceRecord | null => {
  if (!evidence?.id || !evidence.workspaceId) return null;
  return {
    ...evidence,
    url: compactUrl(evidence.url || ""),
    title: redactSensitiveText(evidence.title || "", 240),
    artifactPaths: Array.isArray(evidence.artifactPaths) ? evidence.artifactPaths : [],
    consoleSummary: Array.isArray(evidence.consoleSummary) ? evidence.consoleSummary : [],
    networkSummary: Array.isArray(evidence.networkSummary) ? evidence.networkSummary : [],
    textSummary: redactSensitiveText(evidence.textSummary || "", 2000),
    createdAt: Number(evidence.createdAt) || Date.now(),
  };
};
