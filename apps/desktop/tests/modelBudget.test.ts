import { describe, expect, it } from "vitest";
import {
  GEMINI_31_FLASH_LITE_MODEL_ID,
  GPT_56_LUNA_MODEL_ID,
  GPT_56_SOL_MODEL_ID,
  GPT_56_TERRA_MODEL_ID,
  OPENROUTER_MINIMAX_M3_MODEL_ID,
  getModelOption,
  normalizeModelId,
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
      contextWindowTokens: 400_000,
      maxOutputTokens: 128_000,
      supportsImageInput: true,
      supportsReasoning: true,
    });
    expect(getModelOption("gemini-3.5-flash")).toMatchObject({
      contextWindowTokens: 1_048_576,
      maxOutputTokens: 65_536,
      defaultOutputTokens: 32_000,
    });
    expect(getModelOption("gemini-3.1-pro-preview")).toMatchObject({
      contextWindowTokens: 1_048_576,
      maxOutputTokens: 65_536,
      defaultOutputTokens: 32_000,
    });
    expect(getModelOption(GEMINI_31_FLASH_LITE_MODEL_ID)).toMatchObject({
      contextWindowTokens: 1_048_576,
      maxOutputTokens: 65_536,
      defaultOutputTokens: 16_000,
    });
    expect(getModelOption("deepseek/deepseek-v4-flash")).toMatchObject({
      contextWindowTokens: 1_048_576,
      maxOutputTokens: 131_072,
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

  it("normalizes the retired flash-lite preview id to the stable model", () => {
    expect(normalizeModelId("gemini-3.1-flash-lite-preview")).toBe(GEMINI_31_FLASH_LITE_MODEL_ID);
  });

  it("migrates the retired GPT-5.5 id to GPT-5.6 Sol", () => {
    expect(normalizeModelId("gpt-5.5")).toBe(GPT_56_SOL_MODEL_ID);
  });

  it("caps normal input budget while preserving a larger explicit context budget", () => {
    const normal = resolveModelRuntimeBudget("gpt-5.6-sol", "normal");
    const large = resolveModelRuntimeBudget("gpt-5.6-sol", "large_context");

    expect(normal.inputBudgetTokens).toBe(350_000);
    expect(large.inputBudgetTokens).toBe(965_500);
    expect(normal.outputTokens).toBeLessThanOrEqual(getModelOption("gpt-5.6-sol").maxOutputTokens || 0);
    expect(large.messageCharLimit).toBe(40_000);
    expect(large.toolResultCharLimit).toBe(60_000);
  });

  it("uses cost-safe OpenRouter output defaults while preserving long input budgets", () => {
    const deepseek = resolveModelRuntimeBudget("deepseek/deepseek-v4-flash", "normal");
    const nemotron = resolveModelRuntimeBudget("nvidia/nemotron-3-super-120b-a12b:free", "normal");
    const minimax = resolveModelRuntimeBudget(OPENROUTER_MINIMAX_M3_MODEL_ID, "normal");

    expect(deepseek.outputTokens).toBe(4_096);
    expect(deepseek.inputBudgetTokens).toBe(350_000);
    expect(nemotron.outputTokens).toBe(4_096);
    expect(nemotron.hardInputBudgetTokens).toBeLessThanOrEqual(245_000);
    expect(minimax.outputTokens).toBe(4_096);
    expect(minimax.inputBudgetTokens).toBe(350_000);
  });
});
