import { BASE_SYSTEM_INSTRUCTION } from "./base";
import { DEEP_RESEARCH_INSTRUCTION } from "./deepResearch";
import { getResponseStyle, type ResponseStyleId } from "./styles";
import { buildVoiceCalibrationInstruction } from "./voiceCalibration";
import { WEB_SEARCH_AUTO_INSTRUCTION, WEB_SEARCH_FORCED_INSTRUCTION } from "./webSearch";
import type { ChatMessageRecord } from "../db";
import type { ProviderId } from "../models";

export { DEFAULT_RESPONSE_STYLE_ID, getResponseStyle, responseStyleOptions, type ResponseStyleId } from "./styles";
export { DEEP_RESEARCH_INSTRUCTION, DEEP_RESEARCH_PREFLIGHT_INSTRUCTION, DEEP_RESEARCH_TIME_BUDGET_MS } from "./deepResearch";
export { buildVoiceCalibrationInstruction } from "./voiceCalibration";
export { WEB_SEARCH_AUTO_INSTRUCTION, WEB_SEARCH_FORCED_INSTRUCTION } from "./webSearch";

export type WebSearchMode = "off" | "auto" | "forced";

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
  webSearchMode,
  deepResearchEnabled = false,
  latestUserMessage,
  recentMessages,
}: {
  styleId: ResponseStyleId;
  provider: ProviderId | undefined;
  webSearchMode: WebSearchMode;
  deepResearchEnabled?: boolean;
  latestUserMessage?: string;
  recentMessages?: Pick<ChatMessageRecord, "role" | "content">[];
}) => {
  const style = getResponseStyle(styleId);
  const webSearchInstruction =
    webSearchMode === "forced"
      ? WEB_SEARCH_FORCED_INSTRUCTION
      : webSearchMode === "auto"
        ? WEB_SEARCH_AUTO_INSTRUCTION
        : "";

  const deepResearchInstruction = deepResearchEnabled ? `\n\n${DEEP_RESEARCH_INSTRUCTION}` : "";
  const dateTimeInstruction = getCurrentDateTimeInstruction();
  const voiceCalibrationInstruction = buildVoiceCalibrationInstruction({
    styleId,
    latestUserMessage,
    recentMessages,
  });
  const voiceInstruction = voiceCalibrationInstruction ? `\n\n${voiceCalibrationInstruction}` : "";

  return `${BASE_SYSTEM_INSTRUCTION}\n\n${dateTimeInstruction}\n\n${style.instruction}${voiceInstruction}${deepResearchInstruction}${webSearchInstruction}`;
};
