import type { DesktopToolCall } from "../../shared/types";
import type { CollaborationMode } from "../../shared/models";

const text = (description: string) => ({ type: "string", description });
const strings = (description: string) => ({ type: "array", items: { type: "string" }, description });
const schema = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: "object", additionalProperties: false, properties, required });
const tool = (name: string, description: string, parameters: ReturnType<typeof schema>) =>
  ({ type: "function" as const, name, description, parameters });
const jobId = text("Privora's persisted jobId returned by kali_exec, not a process PID.");
const job = schema({ jobId }, ["jobId"]);

export const kaliToolDefinitions = [
  tool("kali_capabilities", "Inspect the assigned Kali environment and executable availability without installing tools.",
    schema({ tools: strings("Optional executable names to check.") })),
  tool("kali_exec", "Run argv in the assigned Kali project and stream output until completion. No implicit shell. Use explicit bash argv only when shell syntax is needed. Stop cancels the supervised remote process group.",
    schema({
      argv: { ...strings("Executable and its arguments."), minItems: 1, maxItems: 256 },
      cwd: text("Relative directory within this remote project; defaults to '.'."),
      timeoutSeconds: { type: "number", minimum: 1, maximum: 3600, description: "Maximum duration; defaults to 120 seconds." },
    }, ["argv"])),
  tool("kali_job_status", "Inspect a persisted job belonging to this Security workspace.", job),
  tool("kali_job_output", "Peek at retained output and last observed state without waiting or contacting Kali. Set follow=true to reconnect and stream until completion; uncertain jobs are never replayed.",
    schema({ jobId, follow: { type: "boolean", description: "Follow output until completion. Default false returns the currently retained output immediately." } }, ["jobId"])),
  tool("kali_job_cancel", "Request cancellation of a job in this workspace and verify its actual state.", job),
  tool("kali_artifact", "Retrieve a bounded file from this remote project, verify its hash, and save it as Privora evidence.",
    schema({ jobId, path: text("Relative path within the remote project. Symlinks and traversal are rejected.") }, ["jobId", "path"])),
  tool("security_finding_list", "Read the findings and evidence references for this Security workspace.", schema({})),
  tool("security_finding_save", "Record or update a finding. Verified findings require reproducible evidence from this workspace; scanner output alone is not proof.",
    schema({
      id: text("Existing finding ID when updating."),
      title: text("Short factual title."), description: text("Claim, impact and limitations."),
      severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
      state: { type: "string", enum: ["candidate", "observed", "verified", "rejected", "stale"] },
      reproduction: text("Procedure and observed result supporting verification."),
      remediation: text("Concrete corrective action."),
      evidenceJobIds: strings("Persisted job IDs containing evidence; all must belong to this workspace. Required for a new verified finding. Omit on an update to preserve its existing IDs; an explicit empty array clears IDs only for non-verified findings."),
    }, ["title", "description", "severity", "state"])),
] as const;

const SECURITY_NAMES = new Set(kaliToolDefinitions.map((definition) => definition.name));
// Desktop browsing is for public research. Target execution stays in Kali.
const BROWSER_RESEARCH_NAMES = new Set([
  "browser_search", "browser_open", "browser_open_link", "browser_snapshot",
  "browser_extract", "browser_inspect", "browser_wait", "browser_tab", "browser_capabilities", "browser_act",
  "browser_screenshot", "browser_evidence", "browser_pdf",
]);
const COMMON_NAMES = new Set([
  "request_user_input", "spawn_agent", "send_message", "assign_task",
  "wait_agent", "list_agents", "close_agent",
]);
const READ_ONLY_NAMES = new Set([
  "kali_capabilities", "kali_job_status", "kali_job_output", "kali_artifact", "security_finding_list",
]);

export const isSecurityToolName = (name: string) => SECURITY_NAMES.has(name);
export const isSecurityWorkspaceToolAllowed = (name: string) =>
  SECURITY_NAMES.has(name) || COMMON_NAMES.has(name) || BROWSER_RESEARCH_NAMES.has(name);
export const securityPlanToolAllowed = (name: string) => READ_ONLY_NAMES.has(name);
export const securityToolDefinitionsForMode = (mode: CollaborationMode) =>
  kaliToolDefinitions.filter((definition) => mode !== "plan" || READ_ONLY_NAMES.has(definition.name));

export const securityWorkspaceBlockReason = (call: DesktopToolCall, isSecurity: boolean) => {
  if (isSecurity && !isSecurityWorkspaceToolAllowed(call.name)) {
    return "Security commands execute in the assigned Kali environment. Desktop browser research is available; host filesystem, terminal, computer controls and browser form actions are unavailable.";
  }
  if (!isSecurity && isSecurityToolName(call.name)) {
    return "Kali tools require an explicit Security workspace.";
  }
  return null;
};
