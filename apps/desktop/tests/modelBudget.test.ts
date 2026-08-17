import { describe, expect, it } from "vitest";
import {
  GEMINI_37_FLASH_MODEL_ID,
  GPT_56_LUNA_MODEL_ID,
  GPT_56_SOL_MODEL_ID,
  GPT_56_TERRA_MODEL_ID,
  OPENROUTER_MINIMAX_M3_MODEL_ID,
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
    expect(getModelOption("deepseek/deepseek-v4-flash")).toMatchObject({
      contextWindowTokens: 1_048_576,
      maxOutputTokens: 393_216,
      defaultOutputTokens: 4_096,
      supportsImageInput: false,
    });
    expect(getModelOption("nvidia/nemotron-3-super-120b-a12b:free")).toMatchObject({
      contextWindowTokens: 262_144,
      maxOutputTokens: 262_144,
      defaultOutputTokens: 4_096,
    });
    expect(getModelOption(OPENROUTER_MINIMAX_M3_MODEL_ID)).toMatchObject({
      provider: "openrouter",
      contextWindowTokens: 524_288,
      maxOutputTokens: 512_000,
      defaultOutputTokens: 4_096,
      supportsImageInput: true,
      supportsReasoning: true,
      supportsTools: true,
    });
  });

  it("exposes only verified reasoning levels and rejects unsupported selections", () => {
    expect(getModelOption(GPT_56_SOL_MODEL_ID).reasoningEfforts).toEqual(["none", "low", "medium", "high", "xhigh", "max"]);
    expect(getModelOption(GEMINI_37_FLASH_MODEL_ID).reasoningEfforts).toEqual(["low", "medium", "high"]);
    expect(getModelOption("deepseek/deepseek-v4-flash").reasoningEfforts).toEqual(["none", "high", "xhigh"]);
    expect(getModelOption("nvidia/nemotron-3-super-120b-a12b:free").reasoningEfforts).toEqual(["none", "low", "medium"]);
    expect(getModelOption(OPENROUTER_MINIMAX_M3_MODEL_ID).reasoningControl).toBe("toggle");
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

  it("uses cost-safe OpenRouter output defaults while preserving long input budgets", () => {
    const deepseek = resolveModelRuntimeBudget("deepseek/deepseek-v4-flash", "normal");
    const nemotron = resolveModelRuntimeBudget("nvidia/nemotron-3-super-120b-a12b:free", "normal");
    const minimax = resolveModelRuntimeBudget(OPENROUTER_MINIMAX_M3_MODEL_ID, "normal");

    expect(deepseek.outputTokens).toBe(4_096);
    expect(deepseek.inputBudgetTokens).toBe(1_013_023);
    expect(nemotron.outputTokens).toBe(4_096);
    expect(nemotron.hardInputBudgetTokens).toBe(250_048);
    expect(minimax.outputTokens).toBe(4_096);
    expect(minimax.inputBudgetTokens).toBe(504_464);
  });
});
