import type { SaveSettingsInput } from "../../../shared/types";

export const splitComposerSettingsForPersistence = (settings: SaveSettingsInput) => {
  const threadSettings = {
    model: settings.model,
    subagentModel: settings.subagentModel,
    subagentReasoningEffort: settings.subagentReasoningEffort,
    subagentSettingsScope: settings.subagentSettingsScope,
    reasoningEffort: settings.reasoningEffort,
    collaborationMode: settings.collaborationMode,
    agentHarnessMode: settings.agentHarnessMode,
  };
  const globalSettings: SaveSettingsInput = { ...settings };
  delete globalSettings.collaborationMode;
  delete globalSettings.agentHarnessMode;
  delete globalSettings.subagentSettingsScope;
  return { globalSettings, threadSettings };
};
