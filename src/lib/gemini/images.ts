import type { Attachment } from "../attachments";
import { GEMINI_NANO_BANANA_2_IMAGE_MODEL_ID, type ImageModelId } from "../imageModels";

export interface GeminiImageResult {
  base64: string;
  mimeType: string;
  outputFormat: string;
  index?: number;
}

export interface GeminiImageRequestOptions {
  aspectRatio?: string;
  imageSize?: "1K" | "2K" | "4K";
  count: 1;
  outputFormat: "png";
}

interface GenerateGeminiImageOptions {
  model?: ImageModelId;
  prompt: string;
  images?: Attachment[];
  options: GeminiImageRequestOptions;
  signal: AbortSignal;
  onCompletedImage: (image: GeminiImageResult, index: number) => void;
}

export async function generateGeminiImage({
  model = GEMINI_NANO_BANANA_2_IMAGE_MODEL_ID,
  prompt,
  images = [],
  options,
  signal,
  onCompletedImage,
}: GenerateGeminiImageOptions) {
  const response = await fetch("/api/gemini/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      images: images.map(image => ({
        base64: image.base64,
        mimeType: image.mimeType,
      })),
      aspectRatio: options.aspectRatio,
      imageSize: options.imageSize,
    }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || `Gemini image request failed with ${response.status}`);
  }

  const data = await response.json() as { images?: GeminiImageResult[] };
  const completedImages = data.images || [];
  completedImages.forEach((image, index) => onCompletedImage(image, index));
}
