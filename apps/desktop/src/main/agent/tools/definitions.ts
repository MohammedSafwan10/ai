import { z } from "zod";
import type { CollaborationMode } from "../../../shared/models";
import type { DesktopToolCall, DesktopToolName } from "../../../shared/types";

const textProperty = (description: string) => ({ type: "string", description });
const boolProperty = (description: string) => ({ type: "boolean", description });
const numberProperty = (description: string) => ({ type: "number", description });
const stringArrayProperty = (description: string) => ({ type: "array", items: { type: "string" }, description });
const stringMapProperty = (description: string) => ({ type: "object", additionalProperties: { type: "string" }, description });
const browserViewportProperty = (description: string) => ({
  type: "object",
  additionalProperties: false,
  description,
  properties: {
    width: numberProperty("Viewport width in CSS pixels."),
    height: numberProperty("Viewport height in CSS pixels."),
  },
});
const editOperationsProperty = (description: string) => ({
  type: "array",
  description,
  items: {
    type: "object",
    additionalProperties: true,
    properties: {
      type: textProperty("Operation type: replace_range, delete_range, replace_text, insert_text, or append."),
      startLine: numberProperty("1-based start line for range operations."),
      endLine: numberProperty("1-based end line for range operations."),
      match: textProperty("Exact text to find for text operations."),
      replacement: textProperty("Replacement text for replace_text."),
      content: textProperty("Content to insert, append, or use as range replacement."),
      occurrence: textProperty("first or all for text operations. Default first."),
      position: textProperty("before or after for insert_text. Default before."),
      caseSensitive: boolProperty("If true, text matching is case-sensitive. Default false."),
      ensureNewline: boolProperty("For append, add a newline before content when needed. Default true."),
    },
  },
});

const requestUserInputOptionsProperty = (description: string) => ({
  type: "array",
  description,
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      label: textProperty("User-facing label, ideally 1-5 words."),
      description: textProperty("One short sentence explaining impact or tradeoff if selected."),
    },
    required: ["label", "description"],
  },
});

const requestUserInputQuestionsProperty = (description: string) => ({
  type: "array",
  description,
  minItems: 1,
  maxItems: 3,
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      id: textProperty("Stable snake_case identifier for mapping answers."),
      header: textProperty("Short header label shown in the UI, 12 or fewer characters."),
      question: textProperty("Single-sentence prompt shown to the user."),
      options: requestUserInputOptionsProperty("Provide 2-3 mutually exclusive choices. Put the recommended option first and suffix its label with (Recommended). Do not include Other; Privora adds it."),
    },
    required: ["id", "header", "question", "options"],
  },
});

const schema = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

export const desktopToolDefinitions = [
  {
    type: "function",
    name: "request_user_input",
    planOnly: true,
    description: "Request user input for one to three short Plan Mode questions and wait for the response. Use only when an important planning decision cannot be discovered from the workspace.",
    parameters: schema({
      questions: requestUserInputQuestionsProperty("Questions to show the user. Prefer 1 and do not exceed 3."),
    }, ["questions"]),
  },
  {
    type: "function",
    name: "spawn_agent",
    description: "Spawn a same-workspace child agent for bounded parallel work. Use when delegation materially helps, and use a harmless researcher/tester workspace-inspection task when the user explicitly asks to spawn/test a subagent but leaves the task vague. The child inherits Privora workspace tools and approval rules.",
    parameters: schema({
      taskName: textProperty("Canonical task name using lowercase letters, digits, and underscores."),
      task_name: textProperty("Alias for taskName."),
      message: textProperty("Initial task message for the child agent."),
      agentType: textProperty("Optional configured role name such as researcher, reviewer, tester, or implementer."),
      agent_type: textProperty("Alias for agentType."),
      forkTurns: textProperty("Context fork mode: all, none, or a positive integer string. Default all."),
      fork_turns: textProperty("Alias for forkTurns."),
      model: textProperty("Deprecated. Child agents always inherit the current parent model."),
      reasoningEffort: textProperty("Optional reasoning effort override. Omit to inherit current setting."),
    }, ["taskName", "message"]),
  },
  {
    type: "function",
    name: "send_message",
    description: "Send a text message to an existing child agent. This queues the message but does not force a new turn.",
    parameters: schema({
      target: textProperty("Child task name, canonical agent path, nickname, id, or thread id."),
      message: textProperty("Message text to queue on the target agent."),
    }, ["target", "message"]),
  },
  {
    type: "function",
    name: "assign_task",
    description: "Send a text message to an existing child agent and start its next turn if it is idle.",
    parameters: schema({
      target: textProperty("Child task name, canonical agent path, nickname, id, or thread id."),
      message: textProperty("Task text to assign to the target agent."),
    }, ["target", "message"]),
  },
  {
    type: "function",
    name: "wait_agent",
    description: "Wait briefly for any child agent mailbox or status update. Do useful local work between waits instead of polling repeatedly.",
    parameters: schema({
      timeoutMs: numberProperty("Optional wait timeout in milliseconds. Default 30000, max 120000."),
      timeout_ms: numberProperty("Alias for timeoutMs."),
    }, []),
  },
  {
    type: "function",
    name: "list_agents",
    description: "List child agents spawned from the current parent thread.",
    parameters: schema({
      pathPrefix: textProperty("Optional canonical path prefix filter."),
      path_prefix: textProperty("Alias for pathPrefix."),
    }, []),
  },
  {
    type: "function",
    name: "close_agent",
    description: "Close a child agent and stop any active child turn. The main/root thread cannot be closed.",
    parameters: schema({
      target: textProperty("Child task name, canonical agent path, nickname, id, or thread id."),
    }, ["target"]),
  },
  {
    type: "function",
    name: "desktop_read_file",
    description: "Read a workspace file, optionally by line range. Returns content plus freshness and file metadata.",
    parameters: schema({
      path: textProperty("Workspace-relative file path."),
      maxBytes: numberProperty("Optional maximum bytes to return. Default 120000."),
      startLine: numberProperty("Optional 1-based first line to read."),
      endLine: numberProperty("Optional 1-based last line to read."),
      withLineNumbers: boolProperty("If true, prefix returned lines with line numbers."),
      encoding: textProperty("utf8 or base64. Default utf8. Use base64 for binary assets."),
    }, ["path"]),
  },
  {
    type: "function",
    name: "desktop_edit_file",
    description: "Apply ordered, precise UTF-8 edits to one existing file. Returns a diff and rejects stale input; reread before retrying.",
    parameters: schema({
      path: textProperty("Workspace-relative UTF-8 text file path."),
      operations: editOperationsProperty("Ordered edit operations to apply."),
      dryRun: boolProperty("If true, validate and return diff preview without mutating files."),
      expectedPreviousHash: textProperty("Optional sha256 hash from a prior read. A mismatch is a hard STALE_FILE failure."),
      reason: textProperty("Optional short reason for the edit, useful for review/audit UI."),
    }, ["path", "operations"]),
  },
  {
    type: "function",
    name: "desktop_write_file",
    description: "Create a file or intentionally replace its complete contents. Prefer edit or patch for targeted changes to existing text.",
    parameters: schema({
      path: textProperty("Workspace-relative file path."),
      content: textProperty("Full UTF-8 file contents, or base64 bytes when encoding is base64."),
      encoding: textProperty("utf8 or base64. Default utf8. Use base64 for binary assets."),
      createOnly: boolProperty("If true, fail when the file already exists."),
      expectedPreviousHash: textProperty("Optional sha256 hash from a prior read. A mismatch is a hard STALE_FILE failure."),
      allowOverwrite: boolProperty("Optional signal that replacing an existing file is intentional."),
      reason: textProperty("Optional short reason for the write, useful for review/audit UI."),
    }, ["path", "content"]),
  },
  {
    type: "function",
    name: "desktop_apply_patch",
    description: "Apply a transactional Codex-style patch across one or more workspace files. Returns a diff and rolls back the patch on failure.",
    parameters: schema({
      patch: textProperty("Patch text beginning with *** Begin Patch and ending with *** End Patch. File paths must be workspace-relative."),
      expectedHashes: stringMapProperty("Optional map of workspace-relative paths to sha256 hashes from prior reads. Mismatches are hard STALE_FILE failures."),
      dryRun: boolProperty("If true, validate and return the diff preview without mutating files."),
      reason: textProperty("Optional short reason for the patch, useful for review/audit UI."),
    }, ["patch"]),
  },
  {
    type: "function",
    name: "desktop_list_dir",
    description: "List a workspace directory.",
    parameters: schema({
      path: textProperty("Workspace-relative directory path. Use . for the workspace root."),
      depth: numberProperty("Optional directory depth. Default 1, max 3."),
      includeMetadata: boolProperty("If true, include size, modified time, and sha256 for files in structured data."),
    }, ["path"]),
  },
  {
    type: "function",
    name: "desktop_search",
    description: "Search workspace files using ripgrep. Supports literal or regex matching, context lines, grouping, generated-file exclusions, budgets, and continuation cursors.",
    parameters: schema({
      query: textProperty("Search text or regex."),
      mode: textProperty("Search mode: literal or regex. Default regex."),
      glob: textProperty("Optional file glob such as **/*.ts."),
      beforeContext: numberProperty("Optional lines of context before each match."),
      afterContext: numberProperty("Optional lines of context after each match."),
      includeHidden: boolProperty("If true, include hidden files. Default true for compatibility."),
      includeGenerated: boolProperty("If true, include generated/dependency folders such as node_modules and dist. Default false."),
      excludeGlobs: stringArrayProperty("Optional additional ripgrep exclude globs."),
      maxResults: numberProperty("Optional maximum results. Default 80."),
      maxBytes: numberProperty("Optional maximum output bytes across returned match lines."),
      cursor: textProperty("Optional continuation cursor returned by a previous search."),
      groupByFile: boolProperty("If true, include grouped file results in structured data. Default true."),
      caseSensitive: boolProperty("If true, search is case-sensitive. Default false for friendlier code search."),
    }, ["query"]),
  },
  {
    type: "function",
    name: "desktop_delete_path",
    description: "Delete one file or empty directory. Requires approval unless YOLO mode is active.",
    parameters: schema({
      path: textProperty("Workspace-relative path to delete."),
      recursive: boolProperty("Whether directory deletion may be recursive."),
      expectedPreviousHash: textProperty("Optional sha256 hash from a prior read for file deletes. A mismatch is a hard STALE_FILE failure."),
    }, ["path"]),
  },
  {
    type: "function",
    name: "desktop_rename_path",
    description: "Rename or move a file or directory inside the selected workspace.",
    parameters: schema({
      fromPath: textProperty("Existing workspace-relative path."),
      toPath: textProperty("Destination workspace-relative path."),
      expectedPreviousHash: textProperty("Optional sha256 hash from a prior read for file renames. A mismatch is a hard STALE_FILE failure."),
    }, ["fromPath", "toPath"]),
  },
  {
    type: "function",
    name: "exec_command",
    description: "Run a native workspace command in Privora's unified terminal. Returns output and, for long-running commands, a session_id that can be read, resized, written to, or stopped later.",
    parameters: schema({
      argv: stringArrayProperty("Preferred argv vector, for example [\"node\", \"-v\"]. Use this when pipes, redirects, and shell expansion are not needed."),
      cmd: textProperty("Optional shell command string. Use only when shell syntax such as pipes, redirects, glob expansion, or && is required."),
      command: textProperty("Alias for cmd."),
      workdir: textProperty("Optional workspace-relative working directory."),
      cwd: textProperty("Alias for workdir."),
      yield_time_ms: numberProperty("Optional milliseconds to wait before yielding control. Default 2000, max 30000."),
      max_output_tokens: numberProperty("Optional retained output budget before head/tail compaction."),
      tty: boolProperty("Use a PTY terminal backend. Default true. Set false for pipe-backed stdin/stdout/stderr and reliable closeStdin."),
    }, []),
  },
  {
    type: "function",
    name: "write_stdin",
    description: "Write stdin to or poll a running unified terminal session. Empty chars polls unread output without writing.",
    parameters: schema({
      session_id: numberProperty("Running terminal session id returned by exec_command."),
      chars: textProperty("Input to write. Use an empty string to poll without sending input."),
      close_stdin: boolProperty("Whether to close stdin after writing/polling. Use with tty:false pipe workflows."),
      yield_time_ms: numberProperty("Optional milliseconds to wait before yielding control. Default 5000 for empty polls, max 30000."),
      max_output_tokens: numberProperty("Optional retained output budget before head/tail compaction."),
    }, ["session_id", "chars"]),
  },
  {
    type: "function",
    name: "terminal_read",
    description: "Read retained output and metadata for a unified terminal session without writing to it.",
    parameters: schema({
      session_id: numberProperty("Terminal session id."),
      max_output_tokens: numberProperty("Optional retained output budget before head/tail compaction."),
    }, ["session_id"]),
  },
  {
    type: "function",
    name: "terminal_stop",
    description: "Stop a running unified terminal session. Stop returns immediately after issuing the kill request; process-tree cleanup continues in the background if needed.",
    parameters: schema({
      session_id: numberProperty("Running terminal session id to stop."),
    }, ["session_id"]),
  },
  {
    type: "function",
    name: "terminal_resize",
    description: "Resize a running unified PTY terminal session.",
    parameters: schema({
      session_id: numberProperty("Running terminal session id."),
      rows: numberProperty("Terminal rows."),
      cols: numberProperty("Terminal columns."),
    }, ["session_id", "rows", "cols"]),
  },
  {
    type: "function",
    name: "terminal_list",
    description: "List live and recent unified terminal sessions.",
    parameters: schema({
      include_exited: boolProperty("If false, return only currently running sessions. Default true."),
    }, []),
  },
  {
    type: "function",
    name: "desktop_run_diagnostics",
    description: "Run the best known verification command for this workspace, such as lint, typecheck, test, build, cargo check, or flutter analyze.",
    parameters: schema({
      kind: textProperty("Diagnostic kind: auto, lint, typecheck, test, or build."),
      cwd: textProperty("Optional workspace-relative working directory."),
      command: textProperty("Optional explicit command. Use only when the user asked for a specific check or auto-detection is not enough."),
      timeoutMs: numberProperty("Optional wait window for each terminal poll, max 30000."),
    }, ["kind"]),
  },
  {
    type: "function",
    name: "desktop_git_status",
    description: "Return concise git status for the selected workspace or subdirectory. If the path is not a git repository, returns a clean non-error explanation instead of noisy git help text.",
    parameters: schema({
      cwd: textProperty("Optional workspace-relative working directory."),
    }, []),
  },
  {
    type: "function",
    name: "desktop_git_diff",
    description: "Return git diff for the selected workspace or subdirectory. If the path is not a git repository, returns a clean non-error explanation instead of noisy git help text.",
    parameters: schema({
      cwd: textProperty("Optional workspace-relative working directory."),
      staged: boolProperty("If true, return staged diff."),
    }, []),
  },
  {
    type: "function",
    name: "generate_image",
    description: "Generate one or more images natively and save them as real local files. Defaults to CLIProxy gpt-image-2; use provider=gemini for Nano Banana 2. Optionally copy the first/each generated image into the workspace for assets, sprites, or hero images.",
    parameters: schema({
      prompt: textProperty("Image prompt. Include subject, style, composition, dimensions/use case, and constraints."),
      provider: textProperty("cliproxy or gemini. Default cliproxy."),
      model: textProperty("Optional image model. Defaults: gpt-image-2 for CLIProxy, gemini-3.1-flash-image for Gemini Nano Banana 2."),
      count: numberProperty("Number of images to generate, 1-4. Default 1."),
      size: textProperty("Preferred size such as 1024x1024, 1536x1024, auto, 1K, 2K, or 4K when supported."),
      quality: textProperty("Provider quality such as auto, low, medium, high, or hd when supported."),
      outputFormat: textProperty("png, jpeg, or webp. Default png."),
      saveToWorkspacePath: textProperty("Optional workspace-relative destination path for the generated image. Use for assets like public/hero.png or assets/sprites/player.png."),
      overwrite: boolProperty("If true, replace saveToWorkspacePath when it already exists."),
    }, ["prompt"]),
  },
  {
    type: "function",
    name: "edit_image",
    description: "Generate/edit an image using one or more workspace reference images, then save the result as a real local file with an inline preview URL.",
    parameters: schema({
      prompt: textProperty("Edit or generation prompt describing how the reference image(s) should change."),
      referenceImagePaths: stringArrayProperty("Workspace-relative PNG/JPEG/WebP/GIF paths to use as image references."),
      provider: textProperty("cliproxy or gemini. Default cliproxy."),
      model: textProperty("Optional image model. Defaults: gpt-image-2 for CLIProxy, gemini-3.1-flash-image for Gemini Nano Banana 2."),
      count: numberProperty("Number of images to produce, 1-4. Default 1."),
      size: textProperty("Preferred output size when supported."),
      quality: textProperty("Provider quality when supported."),
      outputFormat: textProperty("png, jpeg, or webp. Default png."),
      saveToWorkspacePath: textProperty("Optional workspace-relative destination path for the result."),
      overwrite: boolProperty("If true, replace saveToWorkspacePath when it already exists."),
    }, ["prompt", "referenceImagePaths"]),
  },
  {
    type: "function",
    name: "list_generated_images",
    description: "List recently generated Privora images with ids, local paths, preview URLs, provider/model, and workspace copies.",
    parameters: schema({
      limit: numberProperty("Maximum images to return. Default 20, max 100."),
    }, []),
  },
  {
    type: "function",
    name: "save_generated_image",
    description: "Copy a generated image into the current workspace so it can be used as an asset. Use image id from generate_image/list_generated_images or a generated image sourcePath.",
    parameters: schema({
      id: textProperty("Generated image id from generate_image or list_generated_images."),
      sourcePath: textProperty("Absolute generated image path if id is unavailable."),
      destinationPath: textProperty("Workspace-relative destination path, such as public/hero.png or assets/sprites/player.png."),
      overwrite: boolProperty("If true, replace the destination if it already exists."),
    }, ["destinationPath"]),
  },
  {
    type: "function",
    name: "notes_list",
    description: "List Privora Notes visible in the current workspace, including global notes, workspace notes, and recent file-backed notes.",
    parameters: schema({
      query: textProperty("Optional title/content/path filter."),
    }, []),
  },
  {
    type: "function",
    name: "notes_create",
    description: "Create a Privora draft note. Drafts autosave locally. Use scope workspace by default, or global for notes visible in every project.",
    parameters: schema({
      title: textProperty("Optional note title."),
      content: textProperty("Initial note content. Do not include secrets unless the user explicitly asks."),
      scope: textProperty("workspace or global. Default workspace."),
      pinned: boolProperty("Pin the note above unpinned notes."),
    }, []),
  },
  {
    type: "function",
    name: "notes_read",
    description: "Read a Privora note by id. Returns bounded content and note metadata.",
    parameters: schema({
      noteId: textProperty("Note id."),
      maxBytes: numberProperty("Optional maximum bytes to return. Default 120000."),
    }, ["noteId"]),
  },
  {
    type: "function",
    name: "notes_update",
    description: "Update a Privora note draft. For file-backed notes, this updates the local draft and marks it unsaved until notes_save.",
    parameters: schema({
      noteId: textProperty("Note id."),
      title: textProperty("Optional new title."),
      content: textProperty("Optional replacement content."),
      scope: textProperty("Optional scope change: workspace or global. File-backed notes cannot change scope."),
      pinned: boolProperty("Optional pinned state."),
    }, ["noteId"]),
  },
  {
    type: "function",
    name: "notes_save",
    description: "Save a note. If filePath is provided, Save As converts the note to a file-backed note at that absolute path. Requires approval outside Full Access.",
    parameters: schema({
      noteId: textProperty("Note id."),
      filePath: textProperty("Optional absolute file path for Save As."),
    }, ["noteId"]),
  },
  {
    type: "function",
    name: "notes_delete",
    description: "Delete a Privora draft or remove a file-backed note from Privora. Set deleteFile only when the user explicitly wants the external file moved to the OS Recycle Bin.",
    parameters: schema({
      noteId: textProperty("Note id."),
      deleteFile: boolProperty("For file-backed notes only: move the external file to the OS Recycle Bin before removing it from Privora."),
      permanent: boolProperty("Permanent deletion is reserved for explicit user UI actions and is rejected for agent note tools."),
    }, ["noteId"]),
  },
  {
    type: "function",
    name: "computer_capabilities",
    description: "Report Privora Computer Use backend availability, capabilities, limitations, and diagnostics. Use before broad desktop-control tasks or when a backend appears stale.",
    parameters: schema({
      backend: textProperty("Optional backend: privora_windows_native or cua_driver. Defaults to Privora's Windows-native backend."),
    }, []),
  },
  {
    type: "function",
    name: "computer_list_windows",
    description: "List visible top-level desktop windows with process, bounds, focus state, and capability labels.",
    parameters: schema({
      backend: textProperty("Optional backend: privora_windows_native or cua_driver."),
      includeAll: boolProperty("If true, include all visible top-level windows where the backend supports it."),
    }, []),
  },
  {
    type: "function",
    name: "computer_find_apps",
    description: "Search installed Windows apps by friendly name using Start Menu shortcuts, App Paths, registry entries, PATH commands, and common app folders. Results explicitly report whether the executable/shortcut exists and how it was verified. Use before computer_open_app for friendly product names.",
    parameters: schema({
      backend: textProperty("Optional backend: privora_windows_native or cua_driver."),
      query: textProperty("Friendly app name or partial name, for example Antigravity IDE, Chrome, VS Code, or Calculator."),
      limit: numberProperty("Maximum candidates to return. Default 10, max 30."),
    }, []),
  },
  {
    type: "function",
    name: "computer_focus_window",
    description: "Bring a known desktop window to the foreground. Reports UIPI/foreground-control failures as diagnoses.",
    parameters: schema({
      backend: textProperty("Optional backend."),
      windowId: textProperty("Window id from computer_list_windows."),
    }, ["windowId"]),
  },
  {
    type: "function",
    name: "computer_snapshot",
    description: "Capture a semantic-first desktop snapshot for a window using UI Automation where possible. Returns bounded refs, roles, names, bounds, and capability labels.",
    parameters: schema({
      backend: textProperty("Optional backend."),
      windowId: textProperty("Optional window id. Defaults to the foreground window."),
      depth: numberProperty("Optional UIA tree depth, default 3, max 5."),
      includeBoxes: boolProperty("If true, include element bounding boxes. Default true where available."),
      scope: textProperty("Snapshot scope: window (default), active_document, or matching_controls."),
      role: textProperty("Optional exact UIA role filter, such as Document, Edit, Button, or TabItem."),
      editableOnly: boolProperty("If true, return only enabled editable Document/Edit controls."),
    }, []),
  },
  {
    type: "function",
    name: "computer_inspect",
    description: "Inspect desktop state. Kinds: active_window, windows, uia, screenshot, or capabilities.",
    parameters: schema({
      backend: textProperty("Optional backend."),
      kind: textProperty("Inspection kind: active_window, windows, uia, screenshot, or capabilities."),
      windowId: textProperty("Optional window id."),
    }, []),
  },
  {
    type: "function",
    name: "computer_act",
    description: "Perform one desktop action using background-safe UI Automation first. Foreground mouse/keyboard fallback is disabled unless interactionMode=allow_foreground. Requires Computer Use mode and hard-blocks sensitive or irreversible actions.",
    parameters: schema({
      backend: textProperty("Optional backend."),
      windowId: textProperty("Optional window id."),
      action: textProperty("Action: click, double_click, type, press, scroll, drag, set_value, invoke, select, or focus."),
      interactionMode: textProperty("background_only (default) or allow_foreground. Use allow_foreground only when the user permits focus stealing and will not interact with the desktop during the action."),
      ref: textProperty("Preferred ref from computer_snapshot."),
      targetRef: textProperty("Alias for ref."),
      text: textProperty("Text to type. Never use for passwords, MFA, card data, API keys, tokens, or secrets."),
      key: textProperty("Key to press, such as Enter, Escape, Tab, Ctrl+A, or PageDown."),
      value: textProperty("Value for set_value or scroll amount."),
      x: numberProperty("Screen x coordinate fallback."),
      y: numberProperty("Screen y coordinate fallback."),
      deltaX: numberProperty("Drag or scroll horizontal delta."),
      deltaY: numberProperty("Drag or scroll vertical delta."),
      durationMs: numberProperty("Optional action duration for gestures."),
      includeScreenshot: boolProperty("If true, also save screenshot evidence where supported."),
      verifyValue: boolProperty("For type/set_value, verify the observed control value before reporting success. Default true."),
    }, ["action"]),
  },
  {
    type: "function",
    name: "computer_wait",
    description: "Wait for semantic desktop evidence: text, editable_text, element, active_tab, tab_count, window_title, or focused_window. Use after opening apps or dynamic actions.",
    parameters: schema({
      backend: textProperty("Optional backend."),
      for: textProperty("Wait target: text, editable_text, element, active_tab, tab_count, window_title, or focused_window."),
      value: textProperty("Expected text or title fragment."),
      windowId: textProperty("Optional window id."),
      timeoutMs: numberProperty("Timeout in milliseconds. Default 5000, max 30000."),
      role: textProperty("Optional UIA role for element waits."),
      ref: textProperty("Optional semantic ref to wait on."),
      count: numberProperty("Required minimum count for tab_count."),
      exact: boolProperty("If true, require exact normalized text/title equality rather than substring matching."),
    }, []),
  },
  {
    type: "function",
    name: "computer_trace",
    description: "Run one desktop action with before/after snapshots, optional screenshot evidence, and concise diagnosis. Background-only is the default; foreground fallback must be explicitly enabled.",
    parameters: schema({
      backend: textProperty("Optional backend."),
      windowId: textProperty("Optional window id."),
      action: textProperty("Action: click, double_click, type, press, scroll, drag, set_value, invoke, select, or focus."),
      interactionMode: textProperty("background_only (default) or allow_foreground."),
      ref: textProperty("Preferred ref from computer_snapshot."),
      targetRef: textProperty("Alias for ref."),
      text: textProperty("Text to type. Never use for passwords, MFA, card data, API keys, tokens, or secrets."),
      key: textProperty("Key to press."),
      value: textProperty("Action value."),
      x: numberProperty("Screen x coordinate fallback."),
      y: numberProperty("Screen y coordinate fallback."),
      deltaX: numberProperty("Drag or scroll horizontal delta."),
      deltaY: numberProperty("Drag or scroll vertical delta."),
      includeScreenshot: boolProperty("If true, save screenshot evidence."),
      verifyValue: boolProperty("For type/set_value, verify the observed value. Default true."),
    }, ["action"]),
  },
  {
    type: "function",
    name: "computer_verify",
    description: "Verify current desktop state using a text or window-title expectation and compact evidence.",
    parameters: schema({
      backend: textProperty("Optional backend."),
      text: textProperty("Expected text in the active/window snapshot."),
      expectedText: textProperty("Alias for text."),
      windowTitle: textProperty("Expected window title fragment."),
      windowId: textProperty("Optional window id."),
    }, []),
  },
  {
    type: "function",
    name: "computer_screenshot",
    description: "Capture desktop, window, or region screenshot evidence to a local artifact path. Returns paths only, never base64.",
    parameters: schema({
      backend: textProperty("Optional backend."),
      mode: textProperty("desktop, window, or region. Defaults to desktop/window based on supplied ids."),
      windowId: textProperty("Optional window id."),
      x: numberProperty("Region x coordinate."),
      y: numberProperty("Region y coordinate."),
      width: numberProperty("Region width."),
      height: numberProperty("Region height."),
    }, []),
  },
  {
    type: "function",
    name: "computer_open_app",
    description: "Open a desktop application by verified app name or absolute path. URL/document arguments are preserved through Start Menu shortcuts. Background-only is the default and restores the user's prior foreground window if the launched app activates itself.",
    parameters: schema({
      backend: textProperty("Optional backend."),
      app: textProperty("Application executable/name, for example notepad.exe or calc.exe."),
      path: textProperty("Absolute executable or document path."),
      args: stringArrayProperty("Optional process arguments."),
      interactionMode: textProperty("background_only (default) or allow_foreground. Background-only restores the previous foreground window after launch."),
    }, []),
  },
  {
    type: "function",
    name: "computer_clipboard",
    description: "Get, set, or clear desktop clipboard text. Output is redacted and bounded. Requires Computer Use mode.",
    parameters: schema({
      action: textProperty("Clipboard action: get_text, set_text, or clear."),
      text: textProperty("Text for set_text. Never store passwords, MFA, card data, API keys, tokens, or secrets."),
    }, ["action"]),
  },
  {
    type: "function",
    name: "computer_stop",
    description: "Stop current Computer Use activity and clear transient refs/cursors. Pause/take-over is immediate after the current backend action returns.",
    parameters: schema({}, []),
  },
  {
    type: "function",
    name: "browser_open",
    description: "Open an http(s) URL in Privora's built-in workspace browser. Use the exact local dev/static server URL being tested. Agent control is automatic for localhost and requires approval for external origins.",
    parameters: schema({
      url: textProperty("URL to open. Plain localhost:5173 style input is accepted."),
      viewport: browserViewportProperty("Optional viewport size in CSS pixels."),
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
      newTab: boolProperty("If true, open this URL in a new browser tab."),
    }, ["url"]),
  },
  {
    type: "function",
    name: "browser_open_link",
    description: "Open a visible page link directly by browser_snapshot ref or visible link text. Prefer this over a synthetic click for dynamic sites such as YouTube/search results when the goal is navigation.",
    parameters: schema({
      ref: textProperty("Link ref from browser_snapshot, such as b3."),
      targetRef: textProperty("Alias for ref."),
      text: textProperty("Visible link text to match when a ref is unavailable."),
      href: textProperty("Exact href returned by browser_extract mode=links."),
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
      newTab: boolProperty("If true, open the link in a new browser tab."),
    }, []),
  },
  {
    type: "function",
    name: "browser_snapshot",
    description: "Capture a concise accessibility-oriented snapshot of the current built-in browser page. Use refs from this output with browser_act.",
    parameters: schema({
      depth: numberProperty("Optional snapshot depth, 1-8. Default 5."),
      includeBoxes: boolProperty("If true, include element bounding boxes."),
      targetRef: textProperty("Optional ref from a prior browser_snapshot to focus the snapshot."),
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
    }, []),
  },
  {
    type: "function",
    name: "browser_act",
    description: "Interact with the current built-in browser page using a snapshot ref or x/y coordinate. Prefer refs from browser_snapshot.",
    parameters: schema({
      action: textProperty("Action: click, type, fill, press, scroll, select, or resize. Use fill to replace existing field text; type appends."),
      ref: textProperty("Element ref from browser_snapshot, such as b1."),
      targetRef: textProperty("Alias for ref."),
      text: textProperty("Text to type for action=type."),
      key: textProperty("Key to press for action=press, such as Enter or Escape."),
      x: numberProperty("Viewport x coordinate when a ref is unavailable."),
      y: numberProperty("Viewport y coordinate when a ref is unavailable."),
      deltaX: numberProperty("Horizontal scroll delta for action=scroll."),
      deltaY: numberProperty("Vertical scroll delta for action=scroll."),
      value: textProperty("Option value or visible label for action=select."),
      width: numberProperty("Viewport width for action=resize."),
      height: numberProperty("Viewport height for action=resize."),
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
    }, ["action"]),
  },
  {
    type: "function",
    name: "browser_inspect",
    description: "Inspect concise current-page browser evidence: console, network, dom, screenshot, or source/Privora DevBridge data. Reopen/reload the target URL if evidence appears stale.",
    parameters: schema({
      kind: textProperty("Inspection kind: console, network, dom, screenshot, or source."),
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
    }, ["kind"]),
  },
  {
    type: "function",
    name: "browser_extract",
    description: "Extract bounded, redacted current-page content for research or QA: visible_text, main_text, links, tables, forms, or metadata. Does not read cookies, storage, headers, or input values.",
    parameters: schema({
      mode: textProperty("Extraction mode: visible_text, main_text, links, tables, forms, or metadata. Default visible_text."),
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
    }, []),
  },
  {
    type: "function",
    name: "browser_wait",
    description: "Wait for current-page readiness before the next browser step: text, url_contains, network_idle, dom_stable, or ref.",
    parameters: schema({
      for: textProperty("Wait target: text, url_contains, network_idle, dom_stable, or ref."),
      kind: textProperty("Alias for for."),
      value: textProperty("Text or URL fragment to wait for."),
      ref: textProperty("Snapshot ref to wait for, such as b1."),
      targetRef: textProperty("Alias for ref."),
      timeoutMs: numberProperty("Timeout in milliseconds. Default 5000, max 30000."),
      idleMs: numberProperty("Network idle window in milliseconds. Default 600."),
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
    }, ["for"]),
  },
  {
    type: "function",
    name: "browser_screenshot",
    description: "Save a current-page screenshot artifact. Supports viewport, full_page, element, and region modes. Returns a local path plus effective/requested viewport data, never base64.",
    parameters: schema({
      mode: textProperty("Screenshot mode: viewport, full_page, element, or region. Default viewport."),
      ref: textProperty("Snapshot ref for mode=element."),
      targetRef: textProperty("Alias for ref."),
      x: numberProperty("Region x coordinate for mode=region."),
      y: numberProperty("Region y coordinate for mode=region."),
      width: numberProperty("Region width for mode=region."),
      height: numberProperty("Region height for mode=region."),
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
    }, []),
  },
  {
    type: "function",
    name: "browser_evidence",
    description: "Return one compact current-page evidence bundle with URL, title, timestamp, effective viewport, requested viewport, optional screenshot, visible text, console entries, network entries, and metadata.",
    parameters: schema({
      includeScreenshot: boolProperty("If true, save and include a viewport screenshot path."),
      includeVisibleText: boolProperty("If false, omit visible text. Default true."),
      includeConsole: boolProperty("If false, omit console entries. Default true."),
      includeNetwork: boolProperty("If false, omit network entries. Default true."),
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
    }, []),
  },
  {
    type: "function",
    name: "browser_search",
    description: "Search the web in Privora Browser and return bounded visible result links. Navigating to a search provider follows normal external-origin approval; set open=false only when extracting an already-open results page.",
    parameters: schema({
      query: textProperty("Search query."),
      engine: textProperty("Search engine: duckduckgo, bing, or google. Default duckduckgo."),
      open: boolProperty("If false, do not navigate before extracting current result links. Default true."),
      limit: numberProperty("Maximum result links to return. Default 8, max 20."),
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
      newTab: boolProperty("If true, run the search in a new browser tab."),
    }, ["query"]),
  },
  {
    type: "function",
    name: "browser_tab",
    description: "List, create, switch, close, or clean up Privora Browser tabs. Existing browser tools use the active tab unless tabId is provided.",
    parameters: schema({
      action: textProperty("Tab action: list, new, switch, close, or close_all_except."),
      tabId: textProperty("Tab id for switch, close, or close_all_except. close_all_except defaults to active tab."),
      url: textProperty("Optional URL to open when action=new."),
    }, ["action"]),
  },
  {
    type: "function",
    name: "browser_downloads",
    description: "Inspect or manage tracked browser downloads. Downloads are blocked unless explicitly allowed; files are never auto-opened.",
    parameters: schema({
      action: textProperty("Download action: list, allow_next, cancel, or reveal."),
      downloadId: textProperty("Download id for cancel or reveal. Defaults to latest where safe."),
    }, ["action"]),
  },
  {
    type: "function",
    name: "browser_shields",
    description: "Inspect or manage Privora Shields for the built-in browser. Shields block ad/tracker subresources and report them separately from real network failures.",
    parameters: schema({
      action: textProperty("Shields action: get, set_mode, toggle_site, or list_blocked."),
      mode: textProperty("Mode for set_mode: off or standard."),
      enabled: boolProperty("For toggle_site, true enables Shields for the current/origin site and false disables it."),
      origin: textProperty("Optional origin to override. Defaults to current page origin."),
    }, ["action"]),
  },
  {
    type: "function",
    name: "browser_pdf",
    description: "Extract bounded PDF evidence from the active browser tab. Modes: summary, text, or screenshot. Returns text/artifact paths only, never binary/base64.",
    parameters: schema({
      mode: textProperty("PDF mode: summary, text, or screenshot. Default summary."),
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
    }, []),
  },
  {
    type: "function",
    name: "browser_form_analyze",
    description: "Analyze current-page forms in Privora Browser. Returns bounded form/control metadata with temporary formId/fieldId refs, risk labels, and no raw sensitive values.",
    parameters: schema({
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
    }, []),
  },
  {
    type: "function",
    name: "browser_form_fill",
    description: "Fill current-page form fields by fieldId first, then name or label. Does not return raw sensitive values; external origins need approval unless Full access is active.",
    parameters: schema({
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
      formId: textProperty("Optional form id from browser_form_analyze. Defaults to first matching form."),
      fields: {
        type: "array",
        description: "Fields to fill. Prefer fieldId from browser_form_analyze; use name or label only as fallback.",
        maxItems: 40,
        items: {
          type: "object",
          properties: {
            fieldId: textProperty("Field id from browser_form_analyze."),
            name: textProperty("Fallback input name/id."),
            label: textProperty("Fallback visible label."),
            value: {
              anyOf: [
                { type: "string", maxLength: 4000 },
                { type: "boolean" },
              ],
              description: "Value to set. Use booleans for checkboxes/radios/switches.",
            },
          },
          required: ["value"],
          additionalProperties: false,
        },
      },
    }, ["fields"]),
  },
  {
    type: "function",
    name: "browser_form_validate",
    description: "Validate a current-page form without submitting. Reports required-field state, browser constraint errors, visible validation text, and submit readiness.",
    parameters: schema({
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
      formId: textProperty("Optional form id from browser_form_analyze. Defaults to first form."),
    }, []),
  },
  {
    type: "function",
    name: "browser_form_submit",
    description: "Submit one current-page form or click its submit control and return causal evidence. Sensitive or irreversible flows are guarded unless Full access is active.",
    parameters: schema({
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
      formId: textProperty("Optional form id from browser_form_analyze. Defaults to first form."),
      includeScreenshot: boolProperty("If true, save a local screenshot artifact after submit."),
    }, []),
  },
  {
    type: "function",
    name: "browser_capabilities",
    description: "Report the Privora Browser tools and feature groups available in this running app build. Use before broad browser workflow tests when capabilities appear stale.",
    parameters: schema({}, []),
  },
  {
    type: "function",
    name: "browser_workflow",
    description: "Record, list, inspect, replay, rename, or delete reusable Privora Browser workflows. Recording passively captures existing browser actions into a named workflow.",
    parameters: schema({
      action: textProperty("Workflow action: start_recording, stop_recording, list, get, replay, delete, or rename."),
      workflowId: textProperty("Workflow id for get, replay, delete, rename, or stop_recording. Defaults to active/latest workflow where safe."),
      name: textProperty("Workflow name for start_recording or rename."),
      description: textProperty("Optional workflow description."),
      newTab: boolProperty("If true, replay starts in a new browser tab. Default false."),
    }, ["action"]),
  },
  {
    type: "function",
    name: "browser_assert",
    description: "Add, list, remove, or run assertions for a reusable browser workflow. Assertions verify text, URL, console/network health, elements, forms, screenshots, and PDFs.",
    parameters: schema({
      action: textProperty("Assertion action: add, list, remove, or run."),
      workflowId: textProperty("Workflow id. Defaults to active/latest workflow where safe."),
      assertionId: textProperty("Assertion id for remove."),
      kind: textProperty("Assertion kind: text_present, text_absent, url_contains, no_console_errors, no_failed_requests, element_visible, form_valid, screenshot_changed, or pdf_contains."),
      value: textProperty("Expected text, URL fragment, element text, or PDF text depending on kind."),
      ref: textProperty("Optional current snapshot ref for element_visible."),
      formId: textProperty("Optional current form id for form_valid."),
    }, ["action"]),
  },
  {
    type: "function",
    name: "browser_evidence_vault",
    description: "Save, list, get, or prune bounded current-page evidence records. Evidence includes URL/title/time, optional screenshot path, text, console, network, and metadata.",
    parameters: schema({
      action: textProperty("Evidence action: save_current, list, get, or prune."),
      evidenceId: textProperty("Evidence id for get."),
      workflowId: textProperty("Optional workflow id to associate with saved evidence."),
      runId: textProperty("Optional workflow run id to associate with saved evidence."),
      includeScreenshot: boolProperty("If true, save a viewport screenshot path. Default true for save_current."),
    }, ["action"]),
  },
  {
    type: "function",
    name: "browser_diagnose",
    description: "Diagnose the latest failed browser workflow/action using compact current evidence, console/network errors, validation state, and failure text.",
    parameters: schema({
      workflowId: textProperty("Optional workflow id to focus diagnosis."),
      runId: textProperty("Optional workflow run id to focus diagnosis."),
    }, []),
  },
  {
    type: "function",
    name: "browser_trace",
    description: "Perform one browser action and return a compact causal finding with URL change, console errors, failed requests, and optional screenshot artifact.",
    parameters: schema({
      action: textProperty("Action: click, type, fill, press, scroll, select, or resize."),
      ref: textProperty("Element ref from browser_snapshot."),
      targetRef: textProperty("Alias for ref."),
      text: textProperty("Text to type for action=type."),
      key: textProperty("Key to press for action=press."),
      x: numberProperty("Viewport x coordinate when a ref is unavailable."),
      y: numberProperty("Viewport y coordinate when a ref is unavailable."),
      deltaX: numberProperty("Horizontal scroll delta for action=scroll."),
      deltaY: numberProperty("Vertical scroll delta for action=scroll."),
      value: textProperty("Option value or visible label for action=select."),
      width: numberProperty("Viewport width for action=resize."),
      height: numberProperty("Viewport height for action=resize."),
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
      includeScreenshot: boolProperty("If true, save a local screenshot artifact and return its path."),
    }, ["action"]),
  },
  {
    type: "function",
    name: "browser_verify",
    description: "Reload or re-check the current built-in browser page after a change and report whether current-page console or network failures remain.",
    parameters: schema({
      reload: boolProperty("If true, reload before checking. Default true."),
      tabId: textProperty("Optional browser tab id. Defaults to active tab."),
    }, []),
  },
] as const;

export const desktopToolDefinitionsForMode = (mode: CollaborationMode = "default") =>
  desktopToolDefinitions
    .filter((tool) => mode === "plan" || !("planOnly" in tool && tool.planOnly))
    .map((tool) => {
      const { planOnly: _planOnly, ...rest } = tool as typeof tool & { planOnly?: boolean };
      return rest;
    });

export const openRouterDesktopTools = (mode: CollaborationMode = "default") => desktopToolDefinitionsForMode(mode).map((tool) => ({
  type: "function",
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
}));

export const geminiDesktopFunctionDeclarations = (mode: CollaborationMode = "default") => desktopToolDefinitionsForMode(mode).map((tool) => ({
  name: tool.name,
  description: tool.description,
  parametersJsonSchema: tool.parameters,
}));

const names: Set<string> = new Set(desktopToolDefinitions.map((tool) => tool.name));

const toolCallSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
  thoughtSignature: z.string().optional(),
});

export const isDesktopToolName = (name: unknown): name is DesktopToolName =>
  typeof name === "string" && names.has(name as DesktopToolName);

export const parseDesktopToolCall = (name: string | undefined, rawArguments: string, id?: string): DesktopToolCall | null => {
  if (!isDesktopToolName(name)) return null;
  try {
    const parsed = JSON.parse(rawArguments);
    const result = toolCallSchema.safeParse({ id, name, arguments: parsed });
    return result.success ? { id: result.data.id || crypto.randomUUID(), name, arguments: result.data.arguments } : null;
  } catch {
    return null;
  }
};

export const parsePartialDesktopToolCall = (name: string | undefined, rawArguments: string) => {
  if (!isDesktopToolName(name)) return null;
  const args: Record<string, unknown> = {};
  for (const key of ["path", "fromPath", "toPath", "command", "cmd", "query", "patch", "processId", "session_id", "sessionId", "input", "chars", "kind", "mode", "engine", "backend", "windowId", "value", "cwd", "workdir", "startLine", "endLine", "beforeContext", "afterContext", "maxResults", "maxBytes", "cursor", "expectedPreviousHash", "reason", "encoding", "taskName", "agentType", "target", "message", "url", "action", "ref", "targetRef", "text", "key", "windowTitle", "expectedText", "prompt", "provider", "model", "size", "quality", "outputFormat", "saveToWorkspacePath", "destinationPath", "sourcePath", "id"]) {
    const value = partialJsonStringValue(rawArguments, key);
    if (value) args[key] = value;
  }
  if (name === "desktop_apply_patch" && typeof args.patch !== "string") {
    const patchStart = rawArguments.indexOf("*** Begin Patch");
    if (patchStart !== -1) args.patch = rawArguments.slice(patchStart);
  }
  if (name === "desktop_write_file") {
    const content = partialJsonStringValue(rawArguments, "content");
    if (content || rawArguments.includes('"content"')) args.content = content;
  }
  if (name === "desktop_edit_file") {
    const operation = partialEditOperation(rawArguments);
    if (operation) args.operations = [operation];
  }
  return Object.keys(args).length ? { name, arguments: args } : null;
};

const partialEditOperation = (source: string) => {
  if (!source.includes('"operations"')) return null;
  const operation: Record<string, unknown> = {};
  for (const key of ["type", "match", "replacement", "content", "occurrence", "position"]) {
    const value = partialJsonStringValue(source, key);
    if (value || source.includes(`"${key}"`)) operation[key] = value;
  }
  for (const key of ["startLine", "endLine"]) {
    const value = partialJsonNumberValue(source, key);
    if (value !== undefined) operation[key] = value;
  }
  return Object.keys(operation).length ? operation : null;
};

const partialJsonNumberValue = (source: string, key: string) => {
  const keyIndex = source.indexOf(`"${key}"`);
  if (keyIndex === -1) return undefined;
  const colon = source.indexOf(":", keyIndex);
  if (colon === -1) return undefined;
  const match = source.slice(colon + 1).match(/^\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
};

const partialJsonStringValue = (source: string, key: string) => {
  const keyIndex = source.indexOf(`"${key}"`);
  if (keyIndex === -1) return "";
  const colon = source.indexOf(":", keyIndex);
  if (colon === -1) return "";
  const firstQuote = source.indexOf("\"", colon + 1);
  if (firstQuote === -1) return "";
  let escaped = false;
  let value = "";
  for (let index = firstQuote + 1; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      value += `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") break;
    value += char;
  }
  return decodePartialJsonString(value);
};

const decodePartialJsonString = (value: string) => {
  try {
    return JSON.parse(`"${value.replace(/"/g, "\\\"")}"`) as string;
  } catch {
    return value
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, "\"")
      .replace(/\\\\/g, "\\");
  }
};
