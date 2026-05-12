import type { Attachment } from "../../../lib/attachments";
import type { WebDevFile, WebDevProviderMessage } from "../lib/types";
import { estimateWebDevTokens } from "./tokenCounter";
import { getModelRuntimeLimits } from "./modelLimits";

const MAX_FILE_CHARS = 18000;
const MIN_OUTPUT_RESERVE = 8192;

const fileSummary = (file: WebDevFile) => {
  const lines = file.content ? file.content.split(/\r?\n/).length : 0;
  return `${file.path} (${lines} lines, ${file.content.length} chars, ${file.status})`;
};

const attachmentText = (attachments: Attachment[]) => {
  if (attachments.length === 0) return "";
  return attachments.map((attachment, index) => {
    const size = typeof attachment.size === "number" ? `${Math.round(attachment.size / 1024)} KB` : "unknown size";
    return `Attachment ${index + 1}: ${attachment.name} (${attachment.mimeType || "unknown"}, ${size})`;
  }).join("\n");
};

export const buildWebDevProjectContext = ({
  projectTitle,
  userPrompt,
  files,
  attachments,
  model,
}: {
  projectTitle: string;
  userPrompt: string;
  files: WebDevFile[];
  attachments: Attachment[];
  model: string;
}) => {
  const limits = getModelRuntimeLimits(model);
  const contextBudget = Math.max(12000, Math.min(48000, limits.contextWindow - MIN_OUTPUT_RESERVE - 6000));
  const activeFiles = files.filter(file => file.status !== "deleted").sort((a, b) => a.path.localeCompare(b.path));
  const tree = activeFiles.map(fileSummary).join("\n") || "(No files yet.)";
  const sections: string[] = [
    `Project: ${projectTitle}`,
    [
      "Runtime environment:",
      "- This project runs inside Privora Web Dev using a browser WebContainer.",
      "- Privora mounts files, installs dependencies, starts Vite, and shows the Preview tab automatically.",
      "- Do not tell the user to run npm install, npm run dev, or other local terminal commands unless they explicitly ask for external/local setup instructions.",
      "- Final summaries should describe completed changes and important files; mention the Preview tab instead of command-line run steps when relevant.",
    ].join("\n"),
    "Current project file tree:",
    tree,
  ];
  const attachmentsSummary = attachmentText(attachments);
  if (attachmentsSummary) {
    sections.push("User attachments:", attachmentsSummary);
  }

  let used = estimateWebDevTokens(sections.join("\n\n"), "context.txt");
  const fileSections: string[] = [];

  for (const file of activeFiles) {
    const full = file.content.length <= MAX_FILE_CHARS;
    const content = full
      ? file.content
      : `${file.content.slice(0, MAX_FILE_CHARS)}\n\n/* File truncated in prompt. Use webdev_read_file if more context is needed. */`;
    const section = `--- file: ${file.path}\n${content}`;
    const tokens = estimateWebDevTokens(section, file.path);
    if (used + tokens > contextBudget) {
      fileSections.push(`--- file: ${file.path}\n/* Not included due to context budget. Use webdev_read_file before editing. */`);
      continue;
    }
    used += tokens;
    fileSections.push(section);
  }

  sections.push("Included file contents:", fileSections.join("\n\n") || "(No files yet.)");
  sections.push("User request:", userPrompt);

  return {
    text: sections.join("\n\n"),
    estimatedTokens: used + estimateWebDevTokens(userPrompt),
    budgetTokens: contextBudget,
  };
};

export const appendUserContextMessage = (messages: WebDevProviderMessage[], contextText: string, attachments: Attachment[]) => {
  const parts: WebDevProviderMessage["parts"] = [{ type: "text", text: contextText }];
  for (const attachment of attachments) {
    if (attachment.mimeType.startsWith("image/")) {
      parts.push({ type: "image", mimeType: attachment.mimeType, data: attachment.base64 });
    }
  }
  return [...messages, { role: "user" as const, content: contextText, parts }];
};
