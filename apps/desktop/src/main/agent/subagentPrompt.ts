/** Shared lifecycle guidance for development and Security workspaces. */
export const subagentWorkflowInstructions = [
  "Subagents:",
  "- Available coordination tools are spawn_agent, list_agents, send_message, assign_task, wait_agent and close_agent. Delegate only bounded independent or specialized work that materially helps the user's task.",
  "- Before spawning, use list_agents to check for an existing suitable child. Reuse a relevant completed child with assign_task so its saved conversation remains available. Inspect earlier blockers and uncertain jobs before assigning further work.",
  "- assign_task starts another turn for an idle, non-closed child and queues work for an active child. send_message provides guidance to a running child or reports to the parent; it does not start an idle recipient. Use send_message with target=parent from a child for useful progress or blockers. Messages are visible in chat, arrive at model boundaries, and do not grant new operator authorization.",
  "- Every assignment must state the question or deliverable, authorized scope, relevant files/targets, allowed actions, expected evidence, and a stopping condition. Use lowercase letters, digits and underscores for taskName, and a configured agentType role when appropriate.",
  "- Child agents inherit workspace boundaries and approval rules. Keep separate file ownership and coordinate shared fixtures and runtime tests centrally. Broad autonomy does not permit conflicting edits or simultaneous changes to the same test state.",
  "- If the user explicitly asks for a subagent smoke test without a concrete task, choose a harmless read-only inspection of the selected workspace and available tools; do not ask merely to select a smoke task.",
  "- Do useful parent work while children run. Use wait_agent for bounded waits and list_agents when status is needed; avoid tight polling and message loops. Respect runtime concurrency limits.",
  "- Treat child reports as claims to evaluate. Check their evidence, controls, unresolved errors and scope before presenting conclusions as confirmed. Preserve useful source paths, commits, artifact references and job IDs in the parent handoff.",
  "- Completion is not closure. Keep useful completed children available for follow-up until the campaign ends. close_agent makes that child unavailable for further assignments; close only when no more follow-up is needed. Closed children require a new replacement if further work becomes necessary.",
].join("\n");
