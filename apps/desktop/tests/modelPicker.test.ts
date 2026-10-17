import { describe, expect, it } from "vitest";
import { filterModelGroups } from "../src/renderer/components/ModelPicker";
import type { ModelOption, ModelProviderGroup } from "../src/shared/models";

const model = (provider: ModelOption["provider"], label = "DeepSeek V4.1 Flash"): ModelOption => ({
  id: `${provider}/deepseek-flash`, upstreamModelId: "deepseek-flash", provider, label,
  supportsTools: true, supportsImageInput: true, supportsReasoning: true,
  reasoningEfforts: ["low", "high"], defaultReasoningEffort: "high", description: "",
});
const groups: ModelProviderGroup[] = [
  { id: "deepseek", label: "DeepSeek", description: "", models: [model("deepseek")] },
  { id: "opencode-go", label: "OpenCode Go", description: "", models: [model("opencode-go")] },
  { id: "openrouter", label: "OpenRouter", description: "", models: [model("openrouter")] },
];

describe("model picker search", () => {
  it("keeps identical names separate by provider and exact selection ID", () => {
    expect(filterModelGroups(groups, "deepseek").flatMap((g) => g.models.map((m) => m.id)))
      .toEqual(["deepseek/deepseek-flash", "opencode-go/deepseek-flash", "openrouter/deepseek-flash"]);
    expect(filterModelGroups(groups, "GO flash").map((g) => g.id)).toEqual(["opencode-go"]);
    expect(filterModelGroups(groups, "openrouter deepseek-flash").map((g) => g.id)).toEqual(["openrouter"]);
  });
  it("matches punctuation differences without turning punctuation-only queries into wildcards", () => {
    expect(filterModelGroups(groups, "v41")).toHaveLength(3);
    expect(filterModelGroups(groups, "???")).toHaveLength(0);
    expect(filterModelGroups(groups, "   ")).toHaveLength(3);
  });
  it("supports non-Latin names and retains unavailable entries for the picker to disable", () => {
    const input = [{ ...groups[0], models: [{ ...model("deepseek", "深度求索 模型"), unavailable: true }] }];
    expect(filterModelGroups(input, "深度")[0].models[0].unavailable).toBe(true);
    expect(filterModelGroups(input, "无匹配")).toEqual([]);
    expect(input[0].models).toHaveLength(1);
  });
});
