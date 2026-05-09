import { BASE_SYSTEM_INSTRUCTION } from "./base";
import { DEEP_RESEARCH_INSTRUCTION } from "./deepResearch";
import { getResponseStyle, type ResponseStyleId } from "./styles";
import { CLIPROXY_WEB_SEARCH_INSTRUCTION, GEMINI_WEB_SEARCH_INSTRUCTION } from "./webSearch";
import type { ProviderId } from "../models";

export { DEFAULT_RESPONSE_STYLE_ID, getResponseStyle, responseStyleOptions, type ResponseStyleId } from "./styles";
export { DEEP_RESEARCH_INSTRUCTION, DEEP_RESEARCH_PREFLIGHT_INSTRUCTION, DEEP_RESEARCH_TIME_BUDGET_MS } from "./deepResearch";
export { CLIPROXY_WEB_SEARCH_INSTRUCTION, GEMINI_WEB_SEARCH_INSTRUCTION } from "./webSearch";

const getCurrentDateTimeInstruction = () => {
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  const readable = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(now);

  return [
    "Current date/time context:",
    `- Local time: ${readable}`,
    `- Local time zone: ${timeZone}`,
    `- UTC ISO timestamp: ${now.toISOString()}`,
    "- Use this when interpreting relative dates such as today, tomorrow, yesterday, next week, or current.",
  ].join("\n");
};

export const getSystemInstruction = ({
  styleId,
  provider,
  webSearchEnabled,
  deepResearchEnabled = false,
}: {
  styleId: ResponseStyleId;
  provider: ProviderId | undefined;
  webSearchEnabled: boolean;
  deepResearchEnabled?: boolean;
}) => {
  const style = getResponseStyle(styleId);
  const webSearchInstruction =
    webSearchEnabled && provider === "cliproxy"
      ? CLIPROXY_WEB_SEARCH_INSTRUCTION
      : webSearchEnabled && provider === "gemini"
        ? GEMINI_WEB_SEARCH_INSTRUCTION
        : "";

  const deepResearchInstruction = deepResearchEnabled ? `\n\n${DEEP_RESEARCH_INSTRUCTION}` : "";
  const dateTimeInstruction = getCurrentDateTimeInstruction();

  return `${BASE_SYSTEM_INSTRUCTION}\n\n${dateTimeInstruction}\n\n${style.instruction}${deepResearchInstruction}${webSearchInstruction}`;
};
