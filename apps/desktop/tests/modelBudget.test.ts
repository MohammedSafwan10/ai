import { describe, expect, it } from "vitest";
import {
  GEMINI_37_FLASH_MODEL_ID,
  GPT_56_LUNA_MODEL_ID,
  GPT_56_SOL_MODEL_ID,
  GPT_56_TERRA_MODEL_ID,
  assertModelSupportsReasoningEffort,
  getModelOption,
  resolveModelRuntimeBudget,
} from "../src/shared/models";

describe("desktop model metadata and runtime budgets", () => {
  it("defines verified long-context metadata for primary desktop models", () => {
    expect(getModelOption(GPT_56_SOL_MODEL_ID)).toMatchObject({
      contextWindowTokens: 1_050_000,
      maxOutputTokens: 128_000,
      defaultOutputTokens: 32_000,
      supportsImageInput: true,
      supportsReasoning: true,
    });
    expect(getModelOption(GPT_56_TERRA_MODEL_ID)).toMatchObject({
      contextWindowTokens: 1_050_000,
      maxOutputTokens: 128_000,
      supportsImageInput: true,
      supportsReasoning: true,
    });
    expect(getModelOption(GPT_56_LUNA_MODEL_ID)).toMatchObject({
      contextWindowTokens: 1_050_000,
      maxOutputTokens: 128_000,
      supportsImageInput: true,
      supportsReasoning: true,
    });
    expect(getModelOption(GEMINI_37_FLASH_MODEL_ID)).toMatchObject({
      label: "Gemini 3.7 Flash",
      contextWindowTokens: 1_048_576,
      maxOutputTokens: 65_536,
      defaultOutputTokens: 32_000,
    });
    expect(getModelOption("opencode-go/deepseek-v4.1-flash")).toMatchObject({
      contextWindowTokens: 1_048_576,
      maxOutputTokens: 131_072,
      defaultOutputTokens: 16_384,
      supportsImageInput: true,
    });

  });

  it("exposes only verified reasoning levels and rejects unsupported selections", () => {
    expect(getModelOption(GPT_56_SOL_MODEL_ID).reasoningEfforts).toEqual(["none", "low", "medium", "high", "xhigh", "max"]);
    expect(getModelOption(GEMINI_37_FLASH_MODEL_ID).reasoningEfforts).toEqual(["low", "medium", "high"]);
    expect(getModelOption("opencode-go/deepseek-v4.1-flash").reasoningEfforts).toEqual(["none", "high", "xhigh"]);
    expect(() => assertModelSupportsReasoningEffort(GEMINI_37_FLASH_MODEL_ID, "minimal")).toThrow(/does not support minimal/i);
    expect(() => assertModelSupportsReasoningEffort(GPT_56_SOL_MODEL_ID, "max")).not.toThrow();
  });

  it("uses the verified model budget in both standard and large-attachment modes", () => {
    const normal = resolveModelRuntimeBudget("gpt-5.6-sol", "normal");
    const large = resolveModelRuntimeBudget("gpt-5.6-sol", "large_context");

    expect(normal.inputBudgetTokens).toBe(986_500);
    expect(large.inputBudgetTokens).toBe(986_500);
    expect(normal.outputTokens).toBeLessThanOrEqual(getModelOption("gpt-5.6-sol").maxOutputTokens || 0);
    expect(large.messageCharLimit).toBe(40_000);
    expect(large.toolResultCharLimit).toBe(60_000);
  });

});
