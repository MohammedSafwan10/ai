import { describe, expect, it } from "vitest";
import { splitComposerSettingsForPersistence } from "../src/renderer/features/chat/settingsPersistence";

describe("composer settings persistence", () => {
  it("keeps existing-agent model scope in this chat instead of global defaults", () => {
    const result = splitComposerSettingsForPersistence({ subagentSettingsScope: "next_turn" });
    expect(result.globalSettings).toEqual({});
    expect(result.threadSettings.subagentSettingsScope).toBe("next_turn");
  });
  it("carries a child model and explicit inheritance reset through both save paths", () => {
    for (const subagentModel of ["gemini-3.7-flash", null]) {
      const result = splitComposerSettingsForPersistence({ subagentModel });
      expect(result.globalSettings).toEqual({ subagentModel });
      expect(result.threadSettings.subagentModel).toBe(subagentModel);
    }
  });
  it("saves model and reasoning as global defaults for new chats", () => {
    const { globalSettings, threadSettings } = splitComposerSettingsForPersistence({
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
    });

    expect(globalSettings).toEqual({
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
    });
    expect(threadSettings).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
    });
  });

  it("keeps composer harness toggles scoped to the current thread", () => {
    const { globalSettings, threadSettings } = splitComposerSettingsForPersistence({
      collaborationMode: "plan",
      agentHarnessMode: "review_swarm",
    });

    expect(globalSettings).toEqual({});
    expect(threadSettings).toMatchObject({
      collaborationMode: "plan",
      agentHarnessMode: "review_swarm",
    });
  });
});
