export interface OpenRouterModelCapabilities {
  id: string;
  label: string;
  description: string;
  contextLength: number;
  maxCompletionTokens?: number;
  inputModalities: Array<"text" | "image" | "file" | "audio" | "video">;
  supportsReasoning: boolean;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  supportsTools: boolean;
  supportsToolChoice: boolean;
  supportsStructuredOutputs: boolean;
  supportedParameters: string[];
  notes: string;
}

export const openRouterModelCapabilities: OpenRouterModelCapabilities[] = [
  {
    id: "deepseek/deepseek-v4-flash:free",
    label: "DeepSeek V4 Flash",
    description: "Free fast DeepSeek MoE model with 1M context for coding, chat, and agent workflows.",
    contextLength: 1048576,
    maxCompletionTokens: 384000,
    inputModalities: ["text"],
    supportsReasoning: true,
    reasoningEffort: "high",
    supportsTools: true,
    supportsToolChoice: true,
    supportsStructuredOutputs: false,
    supportedParameters: ["include_reasoning", "reasoning", "tool_choice", "tools"],
    notes: "Text-only free model. Supports high/xhigh reasoning on OpenRouter and is optimized for fast, high-throughput long-context use.",
  },
  {
    id: "baidu/cobuddy:free",
    label: "Baidu CoBuddy",
    description: "Free OpenRouter code-generation model for coding tasks and AI agent workflows.",
    contextLength: 131072,
    maxCompletionTokens: 65536,
    inputModalities: ["text"],
    supportsReasoning: true,
    supportsTools: true,
    supportsToolChoice: false,
    supportsStructuredOutputs: false,
    supportedParameters: ["include_reasoning", "max_tokens", "reasoning", "stop", "tools"],
    notes: "Text-only coding model. Tool calls and reasoning are advertised; temperature/tool_choice are not.",
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    label: "Nemotron 3 Super",
    description: "Free OpenRouter 120B hybrid MoE model for long-context reasoning and agent workflows.",
    contextLength: 262144,
    maxCompletionTokens: 262144,
    inputModalities: ["text"],
    supportsReasoning: true,
    supportsTools: true,
    supportsToolChoice: true,
    supportsStructuredOutputs: true,
    supportedParameters: [
      "include_reasoning",
      "max_tokens",
      "reasoning",
      "response_format",
      "seed",
      "structured_outputs",
      "temperature",
      "tool_choice",
      "tools",
      "top_p",
    ],
    notes: "Text-only. Strongest advertised capability mix here: reasoning, tools, structured output, and long output.",
  },
];

export const getOpenRouterModelCapabilities = (modelId: string) =>
  openRouterModelCapabilities.find(model => model.id === modelId);

export const getOpenRouterReasoningEffort = (modelId: string) =>
  getOpenRouterModelCapabilities(modelId)?.reasoningEffort || "medium";

export const modelSupportsOpenRouterParameter = (modelId: string, parameter: string) =>
  getOpenRouterModelCapabilities(modelId)?.supportedParameters.includes(parameter) ?? false;
