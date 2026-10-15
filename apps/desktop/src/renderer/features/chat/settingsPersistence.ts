import type { SaveSettingsInput } from "../../../shared/types";

export const splitComposerSettingsForPersistence = (settings: SaveSettingsInput) => {
  const threadSettings = {
    model: settings.model,
    subagentModel: settings.subagentModel,
    subagentReasoningEffort: settings.subagentReasoningEffort,
    reasoningEffort: settings.reasoningEffort,
    collaborationMode: settings.collaborationMode,
    agentHarnessMode: settings.agentHarnessMode,
  };
  const globalSettings: SaveSettingsInput = { ...settings };
  delete globalSettings.collaborationMode;
  delete globalSettings.agentHarnessMode;
  return { globalSettings, threadSettings };
};
