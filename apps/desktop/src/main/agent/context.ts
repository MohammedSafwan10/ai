import type { DesktopStore } from "../db/store";
import type { ProviderMessage } from "./providers/types";
import { compactTextForModel } from "../terminal/outputBuffer";
import { detectProjectProfileSync } from "./diagnostics";

const MAX_HISTORY_MESSAGES = 18;
const MAX_MESSAGE_CHARS = 12_000;
const MAX_TOOL_OUTPUT_CHARS = 2_000;

export const buildProviderHistory = (
  store: DesktopStore,
  threadId: string,
  assistantMessageId: string,
): ProviderMessage[] =>
  store
    .listMessages(threadId)
    .filter((message) => message.id !== assistantMessageId)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message): ProviderMessage => {
      const content = compactTextForModel(message.content, MAX_MESSAGE_CHARS) || "";
      const attachments = (message.attachments || []).filter((attachment) => attachment.mimeType.startsWith("image/"));
      const parts: ProviderMessage["parts"] = [
        ...(content ? [{ type: "text" as const, text: content }] : []),
        ...attachments.map((attachment) => ({
          type: "image" as const,
          name: attachment.name,
          mimeType: attachment.mimeType,
          data: attachment.base64,
        })),
      ];
      return {
        role: message.role,
        content,
        parts: parts.length ? parts : undefined,
      };
    });

export const buildRuntimeContext = (store: DesktopStore, threadId: string, workspaceRoot: string) => {
  const profile = detectProjectProfileSync(workspaceRoot);
  const recentTools = store
    .listToolEvents(threadId)
    .filter((tool) => tool.status !== "preparing")
    .slice(-14)
    .map((tool) => {
      const status = tool.status.replace(/_/g, " ");
      const output = compactTextForModel(tool.output || tool.result?.error || "", MAX_TOOL_OUTPUT_CHARS);
      return [`- ${tool.title} (${tool.name}, ${status})`, output ? indent(output) : ""].filter(Boolean).join("\n");
    });

  return [
    "Runtime context:",
    `- Workspace root: ${workspaceRoot}`,
    `- Workspace profile: ${formatProfile(profile)}`,
    "- Terminal protocol: start commands with desktop_exec_command. If a processId is returned, the process is still running; use desktop_write_stdin with empty input to poll, non-empty input to interact, or desktop_stop_process to stop it.",
    "- Terminal output is streamed live to the user, but model-visible tool results may be head/tail compacted.",
    "- Prefer finite, non-interactive commands. Use desktop_run_diagnostics for lint/typecheck/test/build when you need verification.",
    recentTools.length ? "Recent tool activity:" : "",
    ...recentTools,
  ].filter(Boolean).join("\n");
};

export const compactToolResultForModel = <T extends { output?: string; error?: string }>(result: T): T => ({
  ...result,
  output: compactTextForModel(result.output, 20_000),
  error: compactTextForModel(result.error, 6_000),
});

const indent = (value: string) =>
  value
    .split(/\r?\n/)
    .slice(0, 24)
    .map((line) => `  ${line}`)
    .join("\n");

const formatProfile = (profile: ReturnType<typeof detectProjectProfileSync>) => {
  const parts = [
    profile.hasPackageJson ? `${profile.packageManager || "npm"} package` : "",
    profile.hasTsconfig ? "TypeScript" : "",
    profile.hasVite ? "Vite" : "",
    profile.hasFlutter ? "Flutter" : "",
    profile.hasCargo ? "Cargo" : "",
    profile.hasPythonProject ? "Python" : "",
    profile.packageScripts?.length ? `scripts: ${profile.packageScripts.slice(0, 12).join(", ")}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "unknown";
};
