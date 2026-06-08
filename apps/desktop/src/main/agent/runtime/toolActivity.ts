import type {
  DesktopToolCall,
  ToolDiffFileRecord,
  ToolEventRecord,
} from "../../../shared/types";
import {
  activityItemsFromDiffFiles,
  diffStatsFromFiles,
  parseUnifiedDiffFiles,
} from "../tools/diffFormatter";

const LIVE_OUTPUT_MAX_CHARS = 40_000;

export const patchTargetLabel = (patch: string) => {
  const normalized = patch
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, "\"");
  const match = normalized.match(/^\*\*\* (?:Add|Update|Delete) File: ([^\n]+)/m);
  return match?.[1]?.trim() || "files";
};

export const activityItemsForTool = (call: DesktopToolCall, diff?: string, diffFiles?: ToolDiffFileRecord[]): ToolEventRecord["activities"] => {
  const fileItems = activityItemsFromDiffFiles(diffFiles);
  if (fileItems.length > 0) return fileItems;
  const diffItems = diffActivityItems(diff) || [];
  if (diffItems.length > 0) return diffItems;
  if (call.name === "desktop_apply_patch") return patchActivityItems(String(call.arguments.patch || ""));
  if (call.name === "desktop_edit_file") return [{ verb: "Editing", path: String(call.arguments.path || "") }];
  if (call.name === "desktop_write_file") return [{ verb: "Writing", path: String(call.arguments.path || "") }];
  if (call.name === "desktop_delete_path") return [{ verb: "Deleting", path: String(call.arguments.path || "") }];
  if (call.name === "desktop_rename_path") return [{ verb: "Renaming", path: `${call.arguments.fromPath || ""} -> ${call.arguments.toPath || ""}` }];
  return [];
};

export const patchActivityItems = (patch: string): ToolEventRecord["activities"] => {
  const normalized = patch
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, "\"");
  return normalized
    .split(/\r?\n/)
    .map((line) => {
      const add = line.match(/^\*\*\* Add File:\s*(.+)$/);
      const update = line.match(/^\*\*\* Update File:\s*(.+)$/);
      const del = line.match(/^\*\*\* Delete File:\s*(.+)$/);
      if (add) return { verb: "Creating", path: add[1].trim() };
      if (update) return { verb: "Editing", path: update[1].trim() };
      if (del) return { verb: "Deleting", path: del[1].trim() };
      return null;
    })
    .filter(Boolean) as ToolEventRecord["activities"];
};

export const diffActivityItems = (diff?: string): ToolEventRecord["activities"] => {
  if (!diff) return [];
  const parsed = parseUnifiedDiffFiles(diff);
  const structured = activityItemsFromDiffFiles(parsed);
  if (structured.length > 0) return structured;
  return diff
    .split(/\n(?=--- )/g)
    .map((section) => {
      const before = section.match(/^---\s+(.+)$/m)?.[1]?.trim() || "";
      const after = section.match(/^\+\+\+\s+(.+)$/m)?.[1]?.trim() || before;
      const additions = section.split(/\r?\n/).filter((line) => line.startsWith("+ ") && !line.startsWith("+++")).length;
      const deletions = section.split(/\r?\n/).filter((line) => line.startsWith("- ") && !line.startsWith("---")).length;
      if (!after && !before) return null;
      return {
        verb: !before || before === "/dev/null" ? "Created" : additions === 0 && deletions > 0 ? "Deleted" : "Edited",
        path: after || before,
        additions,
        deletions,
      };
    })
    .filter(Boolean) as ToolEventRecord["activities"];
};

export const diffStats = (diff?: string) => {
  if (!diff) return undefined;
  const parsed = parseUnifiedDiffFiles(diff);
  const structuredStats = diffStatsFromFiles(parsed);
  if (parsed.length > 0) return structuredStats;
  return {
    additions: diff.split(/\r?\n/).filter((line) => line.startsWith("+ ") && !line.startsWith("+++")).length,
    deletions: diff.split(/\r?\n/).filter((line) => line.startsWith("- ") && !line.startsWith("---")).length,
  };
};

export const previewForTool = (call: DesktopToolCall, output?: string, diff?: string) => {
  if (diff) return diff.slice(0, 12_000);
  if (["exec_command", "write_stdin", "terminal_read", "terminal_resize", "terminal_stop", "terminal_list", "desktop_run_diagnostics"].includes(call.name)) {
    return output?.slice(-12_000);
  }
  return undefined;
};

export const terminalCommandLabel = (call: DesktopToolCall) => {
  const argv = call.arguments.argv;
  if (Array.isArray(argv) && argv.length > 0) return argv.map((item) => displayArg(String(item))).join(" ");
  return String(call.arguments.cmd || call.arguments.command || call.arguments.kind || "").trim();
};

const displayArg = (value: string) =>
  /\s/.test(value) ? JSON.stringify(value) : value;

export const liveStatusFromOutput = (output: string) => {
  const last = output.trim().split(/\r?\n/).filter(Boolean).pop();
  if (!last) return undefined;
  if (/^(Reading|Writing|Editing|Creating|Deleting|Running|Live diff|Live patch)/i.test(last)) return last.slice(0, 120);
  return undefined;
};

export const compactLiveOutput = (value: string, maxChars = LIVE_OUTPUT_MAX_CHARS) => {
  if (value.length <= maxChars) return value;
  const head = value.slice(0, 10_000);
  const tail = value.slice(-(maxChars - 10_000));
  return `${head}\n\n[... live output compacted ...]\n\n${tail}`;
};

export const sortObject = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((item) => sortObject(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, sortObject(item)]),
  );
};

export const summarizeArgs = (args: Record<string, unknown>) =>
  JSON.stringify(sortObject(args)).slice(0, 600);

export const titleForTool = (call: DesktopToolCall) => {
  const args = call.arguments;
  switch (call.name) {
    case "context_compaction":
      return "Compact context";
    case "web_search":
      return String(args.query || "").trim() ? `Search web: ${args.query}` : "Search web";
    case "desktop_read_file":
      return `Read ${args.path || "file"}`;
    case "desktop_write_file":
      return `Write ${args.path || "file"}`;
    case "desktop_edit_file":
      return `Edit ${args.path || "file"}`;
    case "desktop_apply_patch":
      return `Patch ${patchTargetLabel(String(args.patch || ""))}`;
    case "desktop_list_dir":
      return `List ${args.path || "."}`;
    case "desktop_search":
      return `Search ${args.query || "workspace"}`;
    case "desktop_delete_path":
      return `Delete ${args.path || "path"}`;
    case "desktop_rename_path":
      return `Rename ${args.fromPath || "path"}`;
    case "exec_command":
      return `Run ${terminalCommandLabel(call) || "command"}`;
    case "write_stdin":
      return `Terminal input ${args.session_id || args.sessionId || ""}`.trim();
    case "terminal_read":
      return `Read terminal ${args.session_id || args.sessionId || ""}`.trim();
    case "terminal_resize":
      return `Resize terminal ${args.session_id || args.sessionId || ""}`.trim();
    case "terminal_stop":
      return `Stop terminal ${args.session_id || args.sessionId || ""}`.trim();
    case "terminal_list":
      return "List terminals";
    case "desktop_run_diagnostics":
      return `Check ${args.kind || args.command || "workspace"}`;
    case "generate_image":
      return `Generate image`;
    case "edit_image":
      return `Edit image`;
    case "list_generated_images":
      return "List generated images";
    case "save_generated_image":
      return `Save generated image ${args.destinationPath || args.destination_path || ""}`.trim();
    case "browser_open":
      return `Open browser ${args.url || ""}`.trim();
    case "browser_open_link":
      return `Open browser link ${args.text || args.ref || args.targetRef || ""}`.trim();
    case "browser_snapshot":
      return "Capture browser snapshot";
    case "browser_act":
      return `Browser ${args.action || "action"}`;
    case "browser_inspect":
      return `Inspect browser ${args.kind || ""}`.trim();
    case "browser_extract":
      return `Extract browser ${args.mode || "content"}`;
    case "browser_wait":
      return `Wait for browser ${args.for || args.kind || ""}`.trim();
    case "browser_screenshot":
      return `Screenshot browser ${args.mode || "viewport"}`;
    case "browser_evidence":
      return "Collect browser evidence";
    case "browser_search":
      return `Search browser ${args.query || ""}`.trim();
    case "browser_tab":
      return `Browser tab ${args.action || "list"}`;
    case "browser_downloads":
      return `Browser downloads ${args.action || "list"}`;
    case "browser_shields":
      return `Privora Shields ${args.action || "get"}`;
    case "browser_pdf":
      return `Inspect browser PDF ${args.mode || "summary"}`;
    case "browser_form_analyze":
      return "Analyze browser forms";
    case "browser_form_fill":
      return "Fill browser form";
    case "browser_form_validate":
      return "Validate browser form";
    case "browser_form_submit":
      return "Submit browser form";
    case "browser_trace":
      return `Trace browser ${args.action || "action"}`;
    case "browser_verify":
      return "Verify browser";
    case "notes_list":
      return "List notes";
    case "notes_create":
      return `Create note ${args.title || ""}`.trim();
    case "notes_read":
      return `Read note ${args.noteId || args.note_id || ""}`.trim();
    case "notes_update":
      return `Update note ${args.title || args.noteId || args.note_id || ""}`.trim();
    case "notes_save":
      return `Save note ${args.noteId || args.note_id || ""}`.trim();
    case "notes_delete":
      return `Delete note ${args.noteId || args.note_id || ""}`.trim();
    case "computer_capabilities":
      return "Check Computer Use";
    case "computer_list_windows":
      return "List desktop windows";
    case "computer_find_apps":
      return `Find app ${args.query || args.app || args.name || ""}`.trim();
    case "computer_focus_window":
      return `Focus window ${args.windowId || args.window_id || ""}`.trim();
    case "computer_snapshot":
      return "Capture desktop snapshot";
    case "computer_inspect":
      return `Inspect desktop ${args.kind || ""}`.trim();
    case "computer_act":
      return `Desktop ${args.action || "action"}`;
    case "computer_wait":
      return `Wait for desktop ${args.for || args.kind || ""}`.trim();
    case "computer_trace":
      return `Trace desktop ${args.action || "action"}`;
    case "computer_verify":
      return "Verify desktop";
    case "computer_screenshot":
      return "Screenshot desktop";
    case "computer_open_app":
      return `Open app ${args.app || args.path || ""}`.trim();
    case "computer_clipboard":
      return `Desktop clipboard ${args.action || ""}`.trim();
    case "computer_stop":
      return "Stop Computer Use";
    case "request_user_input":
      return `Questions`;
    case "spawn_agent":
      return `Spawn ${args.taskName || args.task_name || "agent"}`;
    case "send_message":
      return `Message ${args.target || "agent"}`;
    case "assign_task":
      return `Assign ${args.target || "agent"}`;
    case "wait_agent":
      return "Wait for agents";
    case "list_agents":
      return "List agents";
    case "close_agent":
      return `Close ${args.target || "agent"}`;
    default:
      return call.name;
  }
};

export const categoryForTool = (call: DesktopToolCall): ToolEventRecord["category"] => {
  if (isSubagentToolName(call.name)) return "agent";
  if (call.name.startsWith("browser_")) return "other";
  if (call.name.startsWith("notes_")) return "other";
  if (call.name.startsWith("computer_")) return "other";
  if (["generate_image", "edit_image", "list_generated_images", "save_generated_image"].includes(call.name)) return "other";
  if (call.name === "context_compaction") return "other";
  if (["desktop_write_file", "desktop_edit_file", "desktop_apply_patch", "desktop_delete_path", "desktop_rename_path"].includes(call.name)) return "edit";
  if (["exec_command", "write_stdin", "terminal_read", "terminal_resize", "terminal_stop", "terminal_list"].includes(call.name)) return "terminal";
  if (call.name === "desktop_run_diagnostics") return "diagnostic";
  if (call.name === "request_user_input") return "question";
  if (call.name === "desktop_search" || call.name === "web_search") return "search";
  if (call.name === "desktop_git_status" || call.name === "desktop_git_diff") return "git";
  if (call.name === "desktop_read_file" || call.name === "desktop_list_dir") return "read";
  return "other";
};

export const liveStatusForTool = (call: DesktopToolCall, status: ToolEventRecord["status"]) => {
  if (status === "done") return undefined;
  if (status === "awaiting_approval") return "Waiting for approval";
  if (status === "running") {
    if (call.name === "context_compaction") return "Compacting context";
    if (call.name === "exec_command") return "Running command";
    if (call.name === "write_stdin") return "Writing terminal input";
    if (call.name === "terminal_read") return "Reading terminal";
    if (call.name === "terminal_resize") return "Resizing terminal";
    if (call.name === "terminal_stop") return "Stopping terminal";
    if (call.name === "terminal_list") return "Listing terminals";
    if (call.name === "desktop_run_diagnostics") return "Checking workspace";
    if (call.name === "generate_image") return "Generating image";
    if (call.name === "edit_image") return "Editing image";
    if (call.name === "list_generated_images") return "Listing generated images";
    if (call.name === "save_generated_image") return "Saving generated image";
    if (call.name === "request_user_input") return "Waiting for answer";
    if (call.name === "spawn_agent") return "Spawning agent";
    if (call.name === "send_message") return "Sending to agent";
    if (call.name === "assign_task") return "Assigning agent";
    if (call.name === "wait_agent") return "Waiting for agents";
    if (call.name === "list_agents") return "Listing agents";
    if (call.name === "close_agent") return "Closing agent";
    if (call.name === "desktop_apply_patch") return "Applying patch";
    if (call.name === "desktop_edit_file") return "Editing file";
    if (call.name === "desktop_write_file") return "Writing file";
    if (call.name === "desktop_search") return "Searching workspace";
    if (call.name === "web_search") return "Searching web";
    if (call.name === "browser_open") return "Opening browser";
    if (call.name === "browser_open_link") return "Opening browser link";
    if (call.name === "browser_snapshot") return "Capturing browser";
    if (call.name === "browser_act") return "Using browser";
    if (call.name === "browser_inspect") return "Inspecting browser";
    if (call.name === "browser_extract") return "Extracting browser";
    if (call.name === "browser_wait") return "Waiting for browser";
    if (call.name === "browser_screenshot") return "Capturing screenshot";
    if (call.name === "browser_evidence") return "Collecting evidence";
    if (call.name === "browser_search") return "Searching browser";
    if (call.name === "browser_tab") return "Managing browser tabs";
    if (call.name === "browser_downloads") return "Managing downloads";
    if (call.name === "browser_shields") return "Checking Shields";
    if (call.name === "browser_pdf") return "Inspecting PDF";
    if (call.name === "browser_form_analyze") return "Analyzing forms";
    if (call.name === "browser_form_fill") return "Filling form";
    if (call.name === "browser_form_validate") return "Validating form";
    if (call.name === "browser_form_submit") return "Submitting form";
    if (call.name === "browser_trace") return "Tracing browser";
    if (call.name === "browser_verify") return "Verifying browser";
    if (call.name === "notes_list") return "Listing notes";
    if (call.name === "notes_create") return "Creating note";
    if (call.name === "notes_read") return "Reading note";
    if (call.name === "notes_update") return "Updating note";
    if (call.name === "notes_save") return "Saving note";
    if (call.name === "notes_delete") return "Deleting note";
    if (call.name === "computer_capabilities") return "Checking Computer Use";
    if (call.name === "computer_list_windows") return "Listing windows";
    if (call.name === "computer_find_apps") return "Finding apps";
    if (call.name === "computer_focus_window") return "Focusing window";
    if (call.name === "computer_snapshot") return "Capturing desktop";
    if (call.name === "computer_inspect") return "Inspecting desktop";
    if (call.name === "computer_act") return "Using desktop";
    if (call.name === "computer_wait") return "Waiting for desktop";
    if (call.name === "computer_trace") return "Tracing desktop";
    if (call.name === "computer_verify") return "Verifying desktop";
    if (call.name === "computer_screenshot") return "Capturing desktop";
    if (call.name === "computer_open_app") return "Opening app";
    if (call.name === "computer_clipboard") return "Using clipboard";
    if (call.name === "computer_stop") return "Stopping Computer Use";
    if (call.name === "desktop_read_file") return "Reading file";
    if (call.name === "desktop_list_dir") return "Inspecting workspace";
    return status.replace(/_/g, " ");
  }
  return status.replace(/_/g, " ");
};

export const terminalMeta = (call: DesktopToolCall, result?: { data?: Record<string, unknown> }): ToolEventRecord["terminal"] | undefined => {
  if (!["exec_command", "write_stdin", "terminal_read", "terminal_resize", "terminal_stop", "terminal_list", "desktop_run_diagnostics"].includes(call.name)) return undefined;
  return {
    command: terminalCommandLabel(call),
    cwd: typeof call.arguments.cwd === "string" ? call.arguments.cwd : typeof call.arguments.workdir === "string" ? call.arguments.workdir : undefined,
    sessionId: typeof result?.data?.session_id === "number" ? result.data.session_id : typeof call.arguments.session_id === "number" ? call.arguments.session_id : undefined,
    processId: typeof result?.data?.process_id === "number" ? result.data.process_id : typeof result?.data?.processId === "number" ? result.data.processId : undefined,
    running: result?.data?.running === true,
    exitCode: typeof result?.data?.exit_code === "number" || result?.data?.exit_code === null ? result.data.exit_code as number | null : typeof result?.data?.exitCode === "number" || result?.data?.exitCode === null ? result.data.exitCode as number | null : undefined,
    durationMs: typeof result?.data?.wall_time_ms === "number" ? result.data.wall_time_ms : typeof result?.data?.durationMs === "number" ? result.data.durationMs : undefined,
    processDurationMs: typeof result?.data?.processDurationMs === "number" ? result.data.processDurationMs : undefined,
    operationDurationMs: typeof result?.data?.operationDurationMs === "number" ? result.data.operationDurationMs : undefined,
    timedOut: result?.data?.timed_out === true || result?.data?.timedOut === true,
    omittedBytes: typeof result?.data?.omitted_bytes === "number" ? result.data.omitted_bytes : typeof result?.data?.omittedBytes === "number" ? result.data.omittedBytes : undefined,
    status: typeof result?.data?.status === "string" ? result.data.status : undefined,
    backend: typeof result?.data?.backend === "string" ? result.data.backend : undefined,
    tty: result?.data?.tty === true,
    streamsMerged: result?.data?.streamsMerged === true,
  };
};

const isSubagentToolName = (name: string) =>
  ["spawn_agent", "send_message", "assign_task", "wait_agent", "list_agents", "close_agent"].includes(name);
