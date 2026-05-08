import { getAttachmentDataUrl, type Attachment } from "../attachments";

export const CLIPROXY_IMAGE_MODEL = "gpt-image-2";

export interface CliproxyImageResult {
  base64: string;
  mimeType: string;
  outputFormat: string;
  index?: number;
}

export interface CliproxyImageRequestOptions {
  size: string;
  quality: "low" | "medium" | "high";
  count: 1 | 2 | 3 | 4;
  partialImages: 0 | 1;
  outputFormat: "png";
}

interface StreamCliproxyImageOptions {
  mode: "generate" | "edit";
  prompt: string;
  images?: Attachment[];
  options: CliproxyImageRequestOptions;
  signal: AbortSignal;
  onPartialImage?: (image: CliproxyImageResult, index: number) => void;
  onCompletedImage: (image: CliproxyImageResult, index: number) => void;
}

const getCliproxyApiKey = () =>
  ((import.meta as any).env?.VITE_CLIPROXY_API_KEY as string | undefined) || "dummy-key";

const getDataBase64 = (value: unknown) => {
  if (typeof value !== "string") return "";
  const commaIndex = value.indexOf(",");
  return value.startsWith("data:") && commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
};

const getEventImageIndex = (data: any) => {
  const rawIndex =
    data?.index ??
    data?.partial_image_index ??
    data?.image?.index ??
    data?.data?.[0]?.index ??
    0;
  const index = Number(rawIndex);
  return Number.isFinite(index) && index >= 0 ? index : 0;
};

const getOutputFormat = (data: any) =>
  data?.output_format ||
  data?.image?.output_format ||
  data?.data?.[0]?.output_format ||
  "png";

const toImageResult = (candidate: unknown, outputFormat = "png", index = 0): CliproxyImageResult | null => {
  const base64 = getDataBase64(candidate);
  if (!base64) return null;

  return {
    base64,
    mimeType: outputFormat === "webp" ? "image/webp" : outputFormat === "jpeg" || outputFormat === "jpg" ? "image/jpeg" : "image/png",
    outputFormat,
    index,
  };
};

const extractImageResults = (data: any): CliproxyImageResult[] => {
  if (Array.isArray(data?.data)) {
    return data.data
      .map((item: any, index: number) =>
        toImageResult(
          item?.b64_json || item?.url || item?.image?.b64_json || item?.image?.url,
          item?.output_format || data?.output_format || "png",
          Number.isFinite(Number(item?.index)) ? Number(item.index) : index
        )
      )
      .filter((image: CliproxyImageResult | null): image is CliproxyImageResult => Boolean(image));
  }

  const candidate =
    data?.b64_json ||
    data?.image?.b64_json ||
    data?.data?.[0]?.b64_json ||
    data?.result?.b64_json ||
    data?.partial_image_b64 ||
    data?.url ||
    data?.image?.url ||
    data?.data?.[0]?.url;
  const image = toImageResult(candidate, getOutputFormat(data), getEventImageIndex(data));
  return image ? [image] : [];
};

const getFriendlyImageError = async (response: Response) => {
  const errorText = await response.text().catch(() => "");
  if (response.status === 404) {
    return "Image generation is disabled or unavailable in CLIProxy. Enable image generation in CLIProxy and restart it.";
  }
  return errorText || `CLIProxy image request failed with ${response.status}`;
};

export async function streamCliproxyImage({
  mode,
  prompt,
  images = [],
  options,
  signal,
  onPartialImage,
  onCompletedImage,
}: StreamCliproxyImageOptions) {
  const isEdit = mode === "edit";
  const endpoint = isEdit ? "/cliproxy/v1/images/edits" : "/cliproxy/v1/images/generations";
  const body: Record<string, unknown> = {
    model: CLIPROXY_IMAGE_MODEL,
    prompt,
    stream: true,
    response_format: "b64_json",
    output_format: options.outputFormat,
    partial_images: options.partialImages,
    size: options.size,
    quality: options.quality,
  };

  if (!isEdit && options.count > 1) {
    body.n = options.count;
  }

  if (isEdit) {
    body.images = images.map((image) => ({
      image_url: getAttachmentDataUrl(image),
    }));
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getCliproxyApiKey()}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(await getFriendlyImageError(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completedImages: CliproxyImageResult[] = [];
  let didNotifyCompleted = false;

  const flushEvent = (rawEvent: string) => {
    const lines = rawEvent.split("\n");
    const event = lines
      .find((line) => line.startsWith("event:"))
      ?.slice("event:".length)
      .trim();
    const dataLines = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim());

    for (const dataLine of dataLines) {
      if (!dataLine || dataLine === "[DONE]") continue;

      const data = JSON.parse(dataLine);
      if (data?.error) {
        throw new Error(typeof data.error === "string" ? data.error : data.error.message || "Image generation failed.");
      }

      const type = `${event || ""} ${data?.type || ""}`;
      const images = extractImageResults(data);
      if (images.length === 0) continue;

      if (type.includes("partial_image")) {
        images.forEach((image) => onPartialImage?.(image, Math.max(0, Math.min(options.count - 1, image.index || 0))));
      } else if (type.includes("completed")) {
        completedImages = images;
        didNotifyCompleted = true;
        images.forEach((image) => onCompletedImage(image, Math.max(0, Math.min(options.count - 1, image.index || 0))));
      } else if (completedImages.length === 0) {
        completedImages = images;
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    events.forEach(flushEvent);
  }

  if (buffer.trim()) flushEvent(buffer);
  if (completedImages.length > 0 && !didNotifyCompleted) {
    completedImages.forEach((image) => onCompletedImage(image, Math.max(0, Math.min(options.count - 1, image.index || 0))));
  }
}
