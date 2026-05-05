export type ProviderId = "gemini" | "cliproxy";

export interface ModelOption {
  id: string;
  label: string;
  provider: ProviderId;
  description: string;
}

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
    label: "GPT-5.5 Instant",
    provider: "cliproxy",
    description: "GPT-5.5 through CLIProxy with reasoning effort set to none.",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5 Thinking",
    provider: "cliproxy",
    description: "GPT-5.5 through CLIProxy with reasoning effort set to medium.",
  },
];

export const getModelOption = (modelId: string, thinkingEnabled: boolean) => {
  if (modelId === "gpt-5.5") {
    return modelOptions.find(
      (option) =>
        option.provider === "cliproxy" &&
        option.label === (thinkingEnabled ? "GPT-5.5 Thinking" : "GPT-5.5 Instant"),
    );
  }

  return modelOptions.find((option) => option.id === modelId);
};

export const getModelLabel = (modelId: string, thinkingEnabled: boolean) =>
  getModelOption(modelId, thinkingEnabled)?.label ?? modelId;

export const isGeminiModel = (modelId: string) =>
  getModelOption(modelId, false)?.provider === "gemini";

export const isCliproxyModel = (modelId: string) =>
  getModelOption(modelId, false)?.provider === "cliproxy";
