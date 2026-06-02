export type ImageModelProvider = "cliproxy" | "gemini";
export type ImageModelId = "gpt-image-2" | "gemini-3.1-flash-image-preview";

export interface ImageModelOption {
  id: ImageModelId;
  label: string;
  provider: ImageModelProvider;
  description: string;
  supportsPartialImages: boolean;
}

export const GPT_IMAGE_MODEL_ID: ImageModelId = "gpt-image-2";
export const GEMINI_NANO_BANANA_2_IMAGE_MODEL_ID: ImageModelId = "gemini-3.1-flash-image-preview";
export const DEFAULT_IMAGE_MODEL_ID = GPT_IMAGE_MODEL_ID;

export const imageModelOptions: ImageModelOption[] = [
  {
    id: GPT_IMAGE_MODEL_ID,
    label: "GPT Image",
    provider: "cliproxy",
    description: "GPT image generation through CLIProxy with partial image streaming.",
    supportsPartialImages: true,
  },
  {
    id: GEMINI_NANO_BANANA_2_IMAGE_MODEL_ID,
    label: "Nano Banana 2",
    provider: "gemini",
    description: "Gemini 3.1 Flash Image Preview through the Gemini API.",
    supportsPartialImages: false,
  },
];

export const getImageModelOption = (modelId: string | undefined) =>
  imageModelOptions.find(option => option.id === modelId) || imageModelOptions[0];
