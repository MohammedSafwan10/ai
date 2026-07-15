import { describe, expect, it } from "vitest";
import { splitComposerSettingsForPersistence } from "../src/renderer/features/chat/settingsPersistence";

describe("composer settings persistence", () => {
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
