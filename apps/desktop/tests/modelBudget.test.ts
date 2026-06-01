import { describe, expect, it } from "vitest";
import {
  GEMINI_31_FLASH_LITE_MODEL_ID,
  getModelOption,
  normalizeModelId,
  resolveModelRuntimeBudget,
} from "../src/shared/models";

describe("desktop model metadata and runtime budgets", () => {
  it("defines verified long-context metadata for primary desktop models", () => {
    expect(getModelOption("gpt-5.5")).toMatchObject({
      contextWindowTokens: 1_050_000,
      maxOutputTokens: 128_000,
      defaultOutputTokens: 32_000,
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
  });

  it("normalizes the retired flash-lite preview id to the stable model", () => {
    expect(normalizeModelId("gemini-3.1-flash-lite-preview")).toBe(GEMINI_31_FLASH_LITE_MODEL_ID);
  });

  it("caps normal input budget while preserving a larger explicit context budget", () => {
    const normal = resolveModelRuntimeBudget("gpt-5.5", "normal");
    const large = resolveModelRuntimeBudget("gpt-5.5", "large_context");

    expect(normal.inputBudgetTokens).toBe(350_000);
    expect(large.inputBudgetTokens).toBe(965_500);
    expect(normal.outputTokens).toBeLessThanOrEqual(getModelOption("gpt-5.5").maxOutputTokens || 0);
    expect(large.messageCharLimit).toBe(40_000);
    expect(large.toolResultCharLimit).toBe(60_000);
  });
});
