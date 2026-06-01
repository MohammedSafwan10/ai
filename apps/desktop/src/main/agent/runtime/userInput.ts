import type {
  DesktopToolCall,
  RequestUserInputQuestionRecord,
  RequestUserInputResponseInput,
} from "../../../shared/types";

export const planModeBlockReason = (
  call: DesktopToolCall,
  collaborationMode: string,
  decision: { risk: string; requiresApproval: boolean },
) => {
  if (collaborationMode !== "plan") {
    return call.name === "request_user_input" ? "request_user_input is only available in Plan Mode." : null;
  }
  if (call.name === "request_user_input") return null;
  if (["desktop_read_file", "desktop_list_dir", "desktop_search", "desktop_git_status", "desktop_git_diff", "desktop_run_diagnostics"].includes(call.name)) return null;
  if ((call.name === "desktop_apply_patch" || call.name === "desktop_edit_file") && call.arguments.dryRun === true) return null;
  if (["desktop_spawn_process", "desktop_write_process", "desktop_resize_process", "desktop_kill_process"].includes(call.name)) {
    return decision.risk === "safe" && !decision.requiresApproval
      ? null
      : "Plan Mode blocks risky terminal actions. Use read-only inspection or diagnostics instead.";
  }
  return "Plan Mode blocks mutating tools. Use dryRun:true previews or produce a proposed plan instead.";
};

export const normalizeRequestUserInputQuestions = (value: unknown): { success: true; questions: RequestUserInputQuestionRecord[] } | { success: false; error: string } => {
  if (!Array.isArray(value)) return { success: false, error: "request_user_input requires a questions array." };
  if (value.length < 1 || value.length > 3) return { success: false, error: "request_user_input requires one to three questions." };
  const seen = new Set<string>();
  const questions: RequestUserInputQuestionRecord[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return { success: false, error: "Each question must be an object." };
    const raw = item as Record<string, unknown>;
    const id = String(raw.id || "").trim();
    const header = String(raw.header || "").trim().slice(0, 24);
    const question = String(raw.question || "").trim();
    const rawOptions = raw.options;
    if (!/^[a-z][a-z0-9_]*$/i.test(id)) return { success: false, error: "Each question needs a stable id." };
    if (seen.has(id)) return { success: false, error: `Duplicate question id: ${id}` };
    if (!header || !question) return { success: false, error: "Each question needs header and question text." };
    if (!Array.isArray(rawOptions) || rawOptions.length < 2 || rawOptions.length > 3) {
      return { success: false, error: "Each question needs two or three options." };
    }
    const options = rawOptions.map((option) => {
      const optionRecord = option && typeof option === "object" ? option as Record<string, unknown> : {};
      return {
        label: String(optionRecord.label || "").trim().slice(0, 80),
        description: String(optionRecord.description || "").trim().slice(0, 240),
      };
    });
    if (options.some((option) => !option.label || !option.description)) {
      return { success: false, error: "Each option needs label and description." };
    }
    seen.add(id);
    questions.push({ id, header, question, options, isOther: true });
  }
  return { success: true, questions };
};

export const summarizeUserInputAnswers = (answers: RequestUserInputResponseInput["answers"]) => {
  const lines = Object.entries(answers).map(([id, answer]) => `${id}: ${answer.answers.join(", ") || "(no answer)"}`);
  return lines.join("\n") || "No answers provided.";
};
