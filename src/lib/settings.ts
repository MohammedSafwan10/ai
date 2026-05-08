import { appLogger } from "./logger";
import { modelOptions } from "./models";
import { DEFAULT_RESPONSE_STYLE_ID, getResponseStyle, type ResponseStyleId } from "./prompt";

export const SETTINGS_STORAGE_KEY = "privora-ui-settings";
export const DEFAULT_MODEL_ID = "gemini-3.1-flash-lite-preview";

export interface UiSettings {
  selectedModel: string;
  selectedStyle: ResponseStyleId;
  isThinkingEnabled: boolean;
  isWebSearchEnabled: boolean;
  isDeepResearchEnabled: boolean;
  isDarkMode: boolean;
  composerMode: "chat" | "image";
  imageSettings: ImageSettings;
}

export type ImageSizePreset =
  | "square"
  | "square_2k"
  | "landscape"
  | "widescreen"
  | "widescreen_4k"
  | "portrait"
  | "story_4k"
  | "auto";
export type ImageQuality = "low" | "medium" | "high";
export type ImageCount = 1 | 2 | 3 | 4;

export interface ImageSettings {
  sizePreset: ImageSizePreset;
  quality: ImageQuality;
  count: ImageCount;
  partialImages: 0;
  outputFormat: "png";
}

export const defaultUiSettings: UiSettings = {
  selectedModel: DEFAULT_MODEL_ID,
  selectedStyle: DEFAULT_RESPONSE_STYLE_ID,
  isThinkingEnabled: false,
  isWebSearchEnabled: false,
  isDeepResearchEnabled: false,
  isDarkMode: false,
  composerMode: "chat",
  imageSettings: {
    sizePreset: "square",
    quality: "medium",
    count: 1,
    partialImages: 0,
    outputFormat: "png",
  },
};

const imageSizePresets: ImageSizePreset[] = [
  "square",
  "square_2k",
  "landscape",
  "widescreen",
  "widescreen_4k",
  "portrait",
  "story_4k",
  "auto",
];

const normalizeImageSettings = (settings?: Partial<ImageSettings> & { aspectRatio?: "square" | "landscape" | "portrait" }): ImageSettings => {
  const legacyAspectRatio = settings?.aspectRatio;
  const sizePreset: ImageSizePreset = settings?.sizePreset && imageSizePresets.includes(settings.sizePreset)
    ? settings.sizePreset
    : legacyAspectRatio === "landscape" || legacyAspectRatio === "portrait" || legacyAspectRatio === "square"
      ? legacyAspectRatio
      : "square";
  const quality: ImageQuality =
    settings?.quality === "low" || settings?.quality === "high" || settings?.quality === "medium"
      ? settings.quality
      : "medium";
  const count: ImageCount = [1, 2, 3, 4].includes(Number(settings?.count))
    ? (Number(settings?.count) as ImageCount)
    : 1;

  return {
    sizePreset,
    quality,
    count,
    partialImages: 0,
    outputFormat: "png",
  };
};

export const loadUiSettings = (): UiSettings => {
  try {
    const rawSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!rawSettings) return defaultUiSettings;

    const parsedSettings = JSON.parse(rawSettings) as Partial<UiSettings>;
    const selectedModel = modelOptions.some(option => option.id === parsedSettings.selectedModel)
      ? parsedSettings.selectedModel!
      : DEFAULT_MODEL_ID;
    const selectedStyle = getResponseStyle(parsedSettings.selectedStyle).id;

    const isDeepResearchEnabled = Boolean(parsedSettings.isDeepResearchEnabled);

    return {
      selectedModel,
      selectedStyle,
      isThinkingEnabled: Boolean(parsedSettings.isThinkingEnabled),
      isWebSearchEnabled: Boolean(parsedSettings.isWebSearchEnabled) || isDeepResearchEnabled,
      isDeepResearchEnabled,
      isDarkMode: Boolean(parsedSettings.isDarkMode),
      composerMode: parsedSettings.composerMode === "image" ? "image" : "chat",
      imageSettings: normalizeImageSettings(parsedSettings.imageSettings),
    };
  } catch {
    return defaultUiSettings;
  }
};

export const saveUiSettings = (settings: UiSettings) => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    appLogger.error("Failed to save UI settings", { err: error });
  }
};
