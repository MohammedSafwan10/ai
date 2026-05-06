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
}

export const defaultUiSettings: UiSettings = {
  selectedModel: DEFAULT_MODEL_ID,
  selectedStyle: DEFAULT_RESPONSE_STYLE_ID,
  isThinkingEnabled: false,
  isWebSearchEnabled: false,
  isDeepResearchEnabled: false,
  isDarkMode: false,
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
