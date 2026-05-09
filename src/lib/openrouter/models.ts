export interface OpenRouterModelCapabilities {
  id: string;
  label: string;
  description: string;
  contextLength: number;
  maxCompletionTokens?: number;
  inputModalities: Array<"text" | "image" | "file" | "audio" | "video">;
  supportsReasoning: boolean;
  supportsTools: boolean;
  supportsToolChoice: boolean;
  supportsStructuredOutputs: boolean;
  supportedParameters: string[];
  notes: string;
}

export const openRouterModelCapabilities: OpenRouterModelCapabilities[] = [
  {
    id: "qwen/qwen3-coder:free",
    label: "Qwen3 Coder 480B",
    description: "Free OpenRouter coding model optimized for agentic coding, tool use, and long-context repository work.",
    contextLength: 262000,
    maxCompletionTokens: 262000,
    inputModalities: ["text"],
    supportsReasoning: false,
    supportsTools: true,
    supportsToolChoice: true,
    supportsStructuredOutputs: false,
    supportedParameters: [
      "frequency_penalty",
      "max_tokens",
      "presence_penalty",
      "stop",
      "temperature",
      "tool_choice",
      "tools",
      "top_k",
      "top_p",
    ],
    notes: "Text-only. Strong fit for code/artifact tool calls, but no advertised reasoning parameter.",
  },
  {
    id: "inclusionai/ring-2.6-1t:free",
    label: "Ring 2.6 1T",
    description: "Free OpenRouter 1T-scale thinking model for coding agents and multi-step workflows.",
    contextLength: 262144,
    maxCompletionTokens: 65536,
    inputModalities: ["text"],
    supportsReasoning: true,
    supportsTools: true,
    supportsToolChoice: true,
    supportsStructuredOutputs: false,
    supportedParameters: [
      "frequency_penalty",
      "include_reasoning",
      "max_tokens",
      "presence_penalty",
      "reasoning",
      "repetition_penalty",
      "seed",
      "stop",
      "temperature",
      "tool_choice",
      "tools",
      "top_k",
      "top_p",
    ],
    notes: "Text-only thinking model. Good candidate for reasoning, web-search server tool, and Canvas tool calls.",
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

export const modelSupportsOpenRouterParameter = (modelId: string, parameter: string) =>
  getOpenRouterModelCapabilities(modelId)?.supportedParameters.includes(parameter) ?? false;
