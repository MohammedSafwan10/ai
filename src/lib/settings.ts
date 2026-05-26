import { appLogger } from "./logger";
import { DEFAULT_IMAGE_MODEL_ID, getImageModelOption, type ImageModelId } from "./imageModels";
import { GEMINI_35_FLASH_MODEL_ID, normalizeModelId } from "./models";
import { DEFAULT_RESPONSE_STYLE_ID, getResponseStyle, type ResponseStyleId } from "./prompt";

export const SETTINGS_STORAGE_KEY = "privora-ui-settings";
export const DEFAULT_MODEL_ID = GEMINI_35_FLASH_MODEL_ID;

export interface UiSettings {
  workspaceMode: "chat" | "web-dev" | "characters" | "command-center";
  selectedModel: string;
  selectedStyle: ResponseStyleId;
  isThinkingEnabled: boolean;
  isWebSearchEnabled: boolean;
  isDeepResearchEnabled: boolean;
  isDebateModeEnabled: boolean;
  isClashModeEnabled: boolean;
  isAgentModeEnabled: boolean;
  isDarkMode: boolean;
  composerMode: "chat" | "image";
  debateSettings: DebateSettings;
  clashSettings: ClashSettings;
  imageSettings: ImageSettings;
}

export interface DebateSettings {
  agentAModel?: string;
  agentBModel?: string;
  judgeModel?: string;
}

export interface ClashSettings {
  agentAModel?: string;
  agentBModel?: string;
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
  isClashModeEnabled: false,
  isAgentModeEnabled: false,
  isDarkMode: false,
  composerMode: "chat",
  debateSettings: {},
  clashSettings: {},
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
  return {
    agentAModel: normalizeModelId(settings?.agentAModel),
    agentBModel: normalizeModelId(settings?.agentBModel),
    judgeModel: normalizeModelId(settings?.judgeModel),
  };
};

const normalizeClashSettings = (settings?: Partial<ClashSettings>): ClashSettings => {
  return {
    agentAModel: normalizeModelId(settings?.agentAModel),
    agentBModel: normalizeModelId(settings?.agentBModel),
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
    const selectedModel = normalizeModelId(parsedSettings.selectedModel) || DEFAULT_MODEL_ID;
    const selectedStyle = getResponseStyle(parsedSettings.selectedStyle).id;

    const isDeepResearchEnabled = Boolean(parsedSettings.isDeepResearchEnabled);
    const isClashModeEnabled = Boolean((parsedSettings as Partial<UiSettings>).isClashModeEnabled) && !isDeepResearchEnabled;
    const isDebateModeEnabled = Boolean(parsedSettings.isDebateModeEnabled) && !isDeepResearchEnabled && !isClashModeEnabled;
    const composerMode = parsedSettings.composerMode === "image" ? "image" : "chat";
    const isAgentModeEnabled = Boolean((parsedSettings as Partial<UiSettings>).isAgentModeEnabled) &&
      composerMode !== "image" &&
      !isDeepResearchEnabled &&
      !isDebateModeEnabled &&
      !isClashModeEnabled;

    return {
      workspaceMode: parsedSettings.workspaceMode === "web-dev" || parsedSettings.workspaceMode === "characters" || parsedSettings.workspaceMode === "command-center"
        ? parsedSettings.workspaceMode
        : "chat",
      selectedModel,
      selectedStyle,
      isThinkingEnabled: Boolean(parsedSettings.isThinkingEnabled),
      isWebSearchEnabled: Boolean(parsedSettings.isWebSearchEnabled) || isDeepResearchEnabled,
      isDeepResearchEnabled,
      isDebateModeEnabled,
      isClashModeEnabled,
      isAgentModeEnabled,
      isDarkMode: Boolean(parsedSettings.isDarkMode),
      composerMode,
      debateSettings: normalizeDebateSettings(parsedSettings.debateSettings),
      clashSettings: normalizeClashSettings((parsedSettings as Partial<UiSettings>).clashSettings),
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
