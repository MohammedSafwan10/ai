import fs from "node:fs";
import path from "node:path";
import type { ReasoningEffort } from "../../shared/models";

export interface SubagentRoleConfig {
  name: string;
  description: string;
  developerInstructions: string;
  nicknameCandidates: string[];
  model?: string;
  reasoningEffort?: ReasoningEffort;
}

const builtInRoles: SubagentRoleConfig[] = [
  {
    name: "researcher",
    description: "Explore code and gather focused context without changing files.",
    developerInstructions: "Research carefully. Prefer read/search/git inspection tools. Return concise facts, paths, and risks.",
    nicknameCandidates: ["Nova", "Scout", "Atlas"],
  },
  {
    name: "reviewer",
    description: "Review proposed or completed changes for bugs, risks, and missing tests.",
    developerInstructions: "Use code-review posture. Findings first, with file references when possible. Do not rewrite unless assigned.",
    nicknameCandidates: ["Rook", "Critic", "Lens"],
  },
  {
    name: "tester",
    description: "Run targeted diagnostics and smoke tests, then report exact failures.",
    developerInstructions: "Focus on verification. Prefer narrow checks first. Report commands, exit codes, and residual risk.",
    nicknameCandidates: ["Gauge", "Probe", "Check"],
  },
  {
    name: "implementer",
    description: "Implement a bounded, disjoint part of the parent task.",
    developerInstructions: "Make scoped edits only for the assigned task. Verify your own changes and summarize files changed.",
    nicknameCandidates: ["Forge", "Patch", "Builder"],
  },
];

export const loadSubagentRoles = (workspaceRoot: string): Map<string, SubagentRoleConfig> => {
  const roles = new Map<string, SubagentRoleConfig>();
  builtInRoles.forEach((role) => roles.set(role.name, role));

  for (const dir of roleDirectories(workspaceRoot)) {
    const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
    entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .forEach((entry) => {
        const filePath = path.join(dir, entry.name);
        const role = parseRoleFile(filePath);
        if (role) roles.set(role.name, role);
      });
  }

  return roles;
};

export const roleNamesForPrompt = (roles: Map<string, SubagentRoleConfig>) =>
  Array.from(roles.values())
    .map((role) => `- ${role.name}: ${role.description}`)
    .join("\n");

export const pickSubagentNickname = (
  role: SubagentRoleConfig | undefined,
  usedNicknames: Set<string>,
  taskName: string,
) => {
  const candidates = [...(role?.nicknameCandidates || []), titleCase(taskName.replace(/_/g, " ")), "Agent"];
  const picked = candidates
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .find((candidate) => !usedNicknames.has(candidate.toLowerCase()));
  return picked || `${titleCase(taskName.replace(/_/g, " "))} ${usedNicknames.size + 1}`;
};

const roleDirectories = (workspaceRoot: string) => {
  const dirs = [path.join(workspaceRoot, ".privora", "agents")];
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA;
  if (appData) dirs.push(path.join(appData, "Privora", "agents"));
  return dirs;
};

const parseRoleFile = (filePath: string): SubagentRoleConfig | null => {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const name = normalizeRoleName(String(parsed.name || path.basename(filePath, ".json")));
    const description = String(parsed.description || "").trim();
    const developerInstructions = String(parsed.developerInstructions || parsed.developer_instructions || "").trim();
    if (!name || !description || !developerInstructions) return null;
    const rawNicknames = parsed.nicknameCandidates || parsed.nickname_candidates;
    const nicknameCandidates = Array.isArray(rawNicknames)
      ? rawNicknames.map((item: unknown) => String(item)).filter(validNickname)
      : [];
    const effort = String(parsed.reasoningEffort || parsed.reasoning_effort || "");
    return {
      name,
      description,
      developerInstructions,
      nicknameCandidates,
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      reasoningEffort: isReasoningEffort(effort) ? effort : undefined,
    };
  } catch {
    return null;
  }
};

const normalizeRoleName = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");

const validNickname = (value: string) =>
  /^[A-Za-z0-9 _-]+$/.test(value.trim()) && value.trim().length > 0;

const isReasoningEffort = (value: string): value is ReasoningEffort =>
  value === "none" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "max";

const titleCase = (value: string) =>
  value.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/\s+/g, " ").trim();
