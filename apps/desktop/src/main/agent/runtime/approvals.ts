import type {
  ApprovalDecisionInput,
  ApprovalDecisionScope,
  ApprovalScopeRecord,
} from "../../../shared/types";

export interface ApprovalDecision {
  approved: boolean;
  scope: ApprovalDecisionScope;
}

export const normalizeApprovalDecisions = (input: ApprovalDecisionInput) => {
  if (input.decisions?.length) return input.decisions;
  if (input.callId && typeof input.approved === "boolean") {
    return [{ callId: input.callId, approved: input.approved, scope: input.scope }];
  }
  return [];
};

export const scopeLabel = (scope: ApprovalScopeRecord) => {
  if (scope.kind === "terminal_prefix") return "command prefix";
  if (scope.kind === "tool_thread") return "thread";
  return "workspace";
};

export const approvalScopeBounds = (decisionScope: ApprovalDecisionScope, timestamp: number) => {
  if (decisionScope === "command_prefix") {
    return {
      expiresAt: timestamp + 24 * 60 * 60 * 1000,
      maxUses: 20,
    };
  }
  return {
    expiresAt: timestamp + 7 * 24 * 60 * 60 * 1000,
    maxUses: decisionScope === "this_thread" ? 20 : 50,
  };
};
