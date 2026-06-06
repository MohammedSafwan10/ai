import type { DesktopStore } from "../db/store";
import { isPlaceholderThreadTitle } from "../db/store";
import type { ProviderMessage } from "./providers/types";
import { compactTextForModel } from "../terminal/outputBuffer";
import { detectProjectProfileSync } from "./diagnostics";
import { getModelOption, type ModelRuntimeBudget } from "../../shared/models";

const MAX_HISTORY_MESSAGES = 18;
const MAX_MESSAGE_CHARS = 12_000;
const MAX_TOOL_OUTPUT_CHARS = 2_000;
const MAX_PROVIDER_HISTORY_TOKENS = 28_000;
const MIN_RECENT_PROVIDER_MESSAGES = 12;

export const buildProviderHistory = (
  store: DesktopStore,
  threadId: string,
  assistantMessageId: string,
  messageCharLimit = MAX_MESSAGE_CHARS,
): ProviderMessage[] =>
  store
    .listRecentMessages(threadId, MAX_HISTORY_MESSAGES + 1)
    .filter((message) => message.id !== assistantMessageId)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message): ProviderMessage => {
      const content = compactTextForModel(message.content, messageCharLimit) || "";
      const attachments = (message.attachments || []).filter((attachment) => attachment.mimeType.startsWith("image/"));
      const parts: ProviderMessage["parts"] = [
        ...(content ? [{ type: "text" as const, text: content }] : []),
        ...attachments.map((attachment) => ({
          type: "image" as const,
          name: attachment.name,
          mimeType: attachment.mimeType,
          data: attachment.base64 || "",
        })),
      ];
      return {
        role: message.role,
        content,
        parts: parts.length ? parts : undefined,
      };
    });

export const sanitizeProviderHistoryForModel = (history: ProviderMessage[], modelId: string): ProviderMessage[] => {
  const model = getModelOption(modelId);
  if (model.supportsImageInput) return history;

  return history.map((message) => {
    const parts = message.parts || [];
    const imageCount = parts.filter((part) => part.type === "image").length;
    if (imageCount === 0) return message;

    const remainingParts = parts.filter((part) => part.type !== "image");
    const imageLabel = imageCount === 1 ? "image attachment was" : "image attachments were";
    const omissionNote = `[${imageCount} ${imageLabel} omitted because ${model.label} does not support image input.]`;
    const content = [message.content, omissionNote].filter(Boolean).join("\n\n");

    return {
      ...message,
      content,
      parts: remainingParts.length ? remainingParts : [{ type: "text", text: content }],
    };
  });
};

export const buildRuntimeContext = (store: DesktopStore, threadId: string, workspaceRoot: string) => {
  const profile = detectProjectProfileSync(workspaceRoot);
  const thread = store.getThread(threadId);
  const threadTitleInstruction = thread && isPlaceholderThreadTitle(thread)
    ? "- Chat title: untitled. If the user's request has a clear topic, emit one hidden title tag early in the turn: <thread_title>Short task title</thread_title>. Keep it under 48 characters, no punctuation flourish, no newline, and do not mention this tag in normal chat text."
    : `- Chat title: ${thread?.title ? `"${thread.title}"` : "already named"}. Do not emit a <thread_title> tag.`;
  const recentTools = store
    .listRecentToolEvents(threadId, 14)
    .filter((tool) => tool.status !== "preparing")
    .map((tool) => {
      const status = tool.status.replace(/_/g, " ");
      const output = compactTextForModel(tool.output || tool.result?.error || "", MAX_TOOL_OUTPUT_CHARS);
      return [`- ${tool.title} (${tool.name}, ${status})`, output ? indent(output) : ""].filter(Boolean).join("\n");
    });

  return [
    "Runtime context:",
    `- Workspace root: ${workspaceRoot}`,
    threadTitleInstruction,
    `- Workspace profile: ${formatProfile(profile)}`,
    "- Terminal protocol: start commands with desktop_spawn_process. Prefer argv arrays for exact execution; use command strings only for shell syntax. Default tty:true gives native PTY fidelity and resize; use tty:false for reliable pipe stdin/stdout/stderr and closeStdin EOF. If a processId is returned, the process is still running; use desktop_write_process with empty input to poll, non-empty input to interact, closeStdin to close pipe input, desktop_resize_process for PTY resize, or desktop_kill_process to stop it.",
    "- Terminal output is streamed live to the user, but model-visible tool results may be head/tail compacted.",
    "- Prefer finite, non-interactive commands. Use desktop_run_diagnostics for lint/typecheck/test/build when you need verification.",
    recentTools.length ? "Recent tool activity:" : "",
    ...recentTools,
  ].filter(Boolean).join("\n");
};

export const compactToolResultForModel = <T extends { output?: string; error?: string }>(
  result: T,
  budget?: Pick<ModelRuntimeBudget, "toolResultCharLimit" | "toolErrorCharLimit">,
): T => ({
  ...result,
  output: compactTextForModel(result.output, budget?.toolResultCharLimit ?? 20_000),
  error: compactTextForModel(result.error, budget?.toolErrorCharLimit ?? 6_000),
});

export const compactProviderHistory = (history: ProviderMessage[], maxTokens = MAX_PROVIDER_HISTORY_TOKENS): ProviderMessage[] => {
  if (estimatedTokens(history) <= maxTokens || history.length <= MIN_RECENT_PROVIDER_MESSAGES) {
    return repairProviderToolPairs(history);
  }

  const recent: ProviderMessage[] = [];
  let recentTokens = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const nextTokens = estimateMessageTokens(message);
    if (recent.length >= MIN_RECENT_PROVIDER_MESSAGES && recentTokens + nextTokens > maxTokens * 0.72) break;
    recent.unshift(message);
    recentTokens += nextTokens;
  }

  const omitted = history.slice(0, history.length - recent.length);
  if (omitted.length === 0) return repairProviderToolPairs(recent);
  return repairProviderToolPairs([summaryMessage(omitted), ...recent]);
};

const repairProviderToolPairs = (messages: ProviderMessage[]): ProviderMessage[] => {
  const outputIds = new Set<string>();
  messages.forEach((message) => {
    message.parts?.forEach((part) => {
      if (part.type === "function_response") outputIds.add(part.id);
    });
  });

  const seenCalls = new Set<string>();
  return messages.map((message) => {
    const parts = message.parts || [];
    if (parts.length === 0) return message;

    const repairedParts: NonNullable<ProviderMessage["parts"]> = [];
    const repairedText: string[] = [];

    parts.forEach((part) => {
      if (part.type === "function_call") {
        if (outputIds.has(part.id)) {
          seenCalls.add(part.id);
          repairedParts.push(part);
        } else {
          repairedText.push(`Tool call omitted during context compaction: ${part.name}.`);
        }
        return;
      }

      if (part.type === "function_response") {
        if (seenCalls.has(part.id)) {
          repairedParts.push(part);
        } else {
          const resultText = part.response.success
            ? part.response.output || "success"
            : part.response.error || "failed";
          repairedText.push(`Tool result preserved from compacted history: ${part.name} returned ${compactTextForModel(resultText, 700) || ""}`);
        }
        return;
      }

      repairedParts.push(part);
    });

    if (repairedText.length === 0) {
      return {
        ...message,
        parts: repairedParts.length ? repairedParts : undefined,
      };
    }

    const content = [message.content, ...repairedText].filter(Boolean).join("\n\n");
    const nonTextParts = repairedParts.filter((part) => part.type !== "text");
    return {
      ...message,
      content,
      parts: [
        ...(content ? [{ type: "text" as const, text: content }] : []),
        ...nonTextParts,
      ],
    };
  });
};

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

export const estimateProviderHistoryTokens = (messages: ProviderMessage[]) =>
  messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);

export const compactProviderHistoryWithInfo = (
  history: ProviderMessage[],
  maxTokens = MAX_PROVIDER_HISTORY_TOKENS,
) => {
  const beforeTokens = estimateProviderHistoryTokens(history);
  const compacted = compactProviderHistory(history, maxTokens);
  return {
    history: compacted,
    beforeTokens,
    afterTokens: estimateProviderHistoryTokens(compacted),
    compacted: compacted !== history && compacted.length !== history.length || beforeTokens > maxTokens,
  };
};

const estimatedTokens = estimateProviderHistoryTokens;

const estimateMessageTokens = (message: ProviderMessage) => {
  const text = [
    message.content,
    ...(message.parts || []).map((part) => {
      if (part.type === "text") return part.text;
      if (part.type === "function_call") return `${part.name} ${JSON.stringify(part.arguments)}`;
      if (part.type === "function_response") return `${part.name} ${part.response.output || part.response.error || ""}`;
      if (part.type === "image") return `[image ${part.name} ${part.mimeType}]`;
      return "";
    }),
  ].join("\n");
  return Math.ceil(text.length / 4) + 12;
};

const summaryMessage = (messages: ProviderMessage[]): ProviderMessage => {
  const lines = messages
    .map((message, index) => {
      const label = message.role === "assistant" ? "Assistant" : "User";
      const text = messageTextForSummary(message);
      return text ? `${index + 1}. ${label}: ${text}` : "";
    })
    .filter(Boolean)
    .slice(-40);
  const content = [
    `Conversation summary before recent context (${messages.length} older messages compacted):`,
    ...lines,
  ].join("\n");
  return {
    role: "user",
    content,
    parts: [{ type: "text", text: content }],
  };
};

const messageTextForSummary = (message: ProviderMessage) => {
  const toolParts = (message.parts || []).filter((part) => part.type === "function_call" || part.type === "function_response");
  if (toolParts.length > 0) {
    return compactTextForModel(toolParts.map((part) => {
      if (part.type === "function_call") return `called ${part.name}`;
      if (part.type === "function_response") return `${part.name} returned ${part.response.success ? "success" : "failure"} ${part.response.error || part.response.output || ""}`;
      return "";
    }).join("; "), 600)?.replace(/\s+/g, " ").trim() || "";
  }
  return compactTextForModel(message.content, 600)?.replace(/\s+/g, " ").trim() || "";
};
