import { appLogger } from "./logger";
import { DEFAULT_IMAGE_MODEL_ID, getImageModelOption, type ImageModelId } from "./imageModels";
import { modelOptions } from "./models";
import { DEFAULT_RESPONSE_STYLE_ID, getResponseStyle, type ResponseStyleId } from "./prompt";

export const SETTINGS_STORAGE_KEY = "privora-ui-settings";
export const DEFAULT_MODEL_ID = "gemini-3.1-flash-lite-preview";

export interface UiSettings {
  workspaceMode: "chat" | "web-dev" | "characters";
  selectedModel: string;
  selectedStyle: ResponseStyleId;
  isThinkingEnabled: boolean;
  isWebSearchEnabled: boolean;
  isDeepResearchEnabled: boolean;
  isDebateModeEnabled: boolean;
  isDarkMode: boolean;
  composerMode: "chat" | "image";
  debateSettings: DebateSettings;
  imageSettings: ImageSettings;
}

export interface DebateSettings {
  agentAModel?: string;
  agentBModel?: string;
  judgeModel?: string;
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
  model: ImageModelId;
  sizePreset: ImageSizePreset;
  quality: ImageQuality;
  count: ImageCount;
  partialImages: 0;
  outputFormat: "png";
}

export const defaultUiSettings: UiSettings = {
  workspaceMode: "chat",
  selectedModel: DEFAULT_MODEL_ID,
  selectedStyle: DEFAULT_RESPONSE_STYLE_ID,
  isThinkingEnabled: false,
  isWebSearchEnabled: false,
  isDeepResearchEnabled: false,
  isDebateModeEnabled: false,
  isDarkMode: false,
  composerMode: "chat",
  debateSettings: {},
  imageSettings: {
    model: DEFAULT_IMAGE_MODEL_ID,
    sizePreset: "square",
    quality: "medium",
    count: 1,
    partialImages: 0,
    outputFormat: "png",
  },
};

const normalizeDebateSettings = (settings?: Partial<DebateSettings>): DebateSettings => {
  const normalizeModel = (modelId?: string) =>
    modelId && modelOptions.some(option => option.id === modelId) ? modelId : undefined;
  return {
    agentAModel: normalizeModel(settings?.agentAModel),
    agentBModel: normalizeModel(settings?.agentBModel),
    judgeModel: normalizeModel(settings?.judgeModel),
  };
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
  const model = getImageModelOption(settings?.model).id;
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
    model,
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
      workspaceMode: parsedSettings.workspaceMode === "web-dev" || parsedSettings.workspaceMode === "characters"
        ? parsedSettings.workspaceMode
        : "chat",
      selectedModel,
      selectedStyle,
      isThinkingEnabled: Boolean(parsedSettings.isThinkingEnabled),
      isWebSearchEnabled: Boolean(parsedSettings.isWebSearchEnabled) || isDeepResearchEnabled,
      isDeepResearchEnabled,
      isDebateModeEnabled: Boolean(parsedSettings.isDebateModeEnabled) && !isDeepResearchEnabled,
      isDarkMode: Boolean(parsedSettings.isDarkMode),
      composerMode: parsedSettings.composerMode === "image" ? "image" : "chat",
      debateSettings: normalizeDebateSettings(parsedSettings.debateSettings),
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
