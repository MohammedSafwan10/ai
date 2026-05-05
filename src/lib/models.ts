export type ProviderId = "gemini" | "cliproxy";

export interface ModelOption {
  id: string;
  label: string;
  provider: ProviderId;
  description: string;
}

export type ReasoningMode = "instant" | "thinking";

export const modelOptions: ModelOption[] = [
  {
    id: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash Lite",
    provider: "gemini",
    description: "Fast Gemini model through Google GenAI.",
  },
  {
    id: "gemini-3-flash-preview",
    label: "Gemini 3 Flash",
    provider: "gemini",
    description: "Balanced Gemini model with native Gemini tools.",
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro",
    provider: "gemini",
    description: "Stronger Gemini model for harder prompts.",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    provider: "cliproxy",
    description: "GPT-5.5 through CLIProxy.",
  },
];

export const getModelOption = (modelId: string) =>
  modelOptions.find((option) => option.id === modelId);

export const getModelLabel = (modelId: string) =>
  getModelOption(modelId)?.label ?? modelId;

export const isGeminiModel = (modelId: string) =>
  getModelOption(modelId)?.provider === "gemini";

export const isCliproxyModel = (modelId: string) =>
  getModelOption(modelId)?.provider === "cliproxy";

export const getReasoningModeLabel = (provider: ProviderId | undefined, mode: ReasoningMode) => {
  if (mode === "instant") return "Instant";
  return "Medium";
};
