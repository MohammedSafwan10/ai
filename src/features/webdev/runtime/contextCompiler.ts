import type { Attachment } from "../../../lib/attachments";
import type { WebDevBuildPlanRecord } from "../../../lib/db";
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
    const availability = attachment.mimeType.startsWith("image/")
      ? "image data included"
      : "metadata only; contents are not available unless shown in the user request";
    return `Attachment ${index + 1}: ${attachment.name} (${attachment.mimeType || "unknown"}, ${size}; ${availability})`;
  }).join("\n");
};

export const buildWebDevProjectContext = ({
  projectTitle,
  userPrompt,
  files,
  attachments,
  model,
  buildPlan,
}: {
  projectTitle: string;
  userPrompt: string;
  files: WebDevFile[];
  attachments: Attachment[];
  model: string;
  buildPlan?: WebDevBuildPlanRecord;
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
      "- Multi-page V1 apps should be React SPA routes inside this Vite app; BrowserRouter routes work in the preview through Vite's fallback.",
      "- Three.js, WebGL, and React Three Fiber are supported in the preview. Blank 3D previews usually mean a code/runtime/dependency/canvas sizing issue, not unsupported rendering.",
      "- For 3D projects, keep Canvas containers explicitly sized, prefer generated/local primitives over CORS-risky remote assets, and inspect diagnostics/runtime errors before simplifying libraries.",
      "- Do not tell the user to run npm install, npm run dev, or other local terminal commands unless they explicitly ask for external/local setup instructions.",
      "- Final summaries should describe completed changes and important files; mention the Preview tab instead of command-line run steps when relevant.",
    ].join("\n"),
    "Current project file tree:",
    tree,
  ];
  if (buildPlan) {
    sections.push(
      "Current Web Dev build plan:",
      [
        `Summary: ${buildPlan.summary || "(none)"}`,
        `Routing required: ${buildPlan.routingRequired ? "yes" : "no"}`,
        `Routing strategy: ${buildPlan.routingStrategy || "(none)"}`,
        `Component strategy: ${buildPlan.componentStrategy || "(none)"}`,
        `Design direction: ${buildPlan.designDirection || "(none)"}`,
        `Primary screens: ${(buildPlan.primaryScreens || []).join(", ") || "(none)"}`,
        `Planned pages/screens: ${(buildPlan.pages || []).join(", ") || "(none)"}`,
        `Key files: ${(buildPlan.keyFiles || []).join(", ") || "(none)"}`,
        `Quality checklist: ${(buildPlan.qualityChecklist || []).join(", ") || "(none)"}`,
        `Verification: ${buildPlan.verification || "(none)"}`,
      ].join("\n")
    );
  }
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
