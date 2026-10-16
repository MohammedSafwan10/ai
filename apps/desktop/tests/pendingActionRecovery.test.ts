import { describe, expect, it } from "vitest";
import { resolveNoToolOutcome } from "../src/main/agent/harness/support/recovery";

const outcome = (iterationText: string, recoveryAttempts = 0, afterToolResults = true) => resolveNoToolOutcome({ iterationText, iterationThought: "", recoveryAttempts, afterToolResults });

describe("unfinished promised actions", () => {
  it.each([
    "With longer spacing the requests work. Let me wait a moment and re-run the full recon script.",
    "The check is complete. I'll now save the final report.",
    "I will verify the remaining result.",
    "Bundle extracted cleanly. Generating an E20 self-managed license file:",
    "The images are ready. Starting the stack:",
    "Now copying the verified bundle:",
    "Found it — Extracting the true secret's **hash only** to check against the stored one (nothing printed):",
    "Found it — `token2-create-resp.json` is the real create capture Extracting the true secret's **hash only** to check against the stored one (nothing printed):",
  ])("recovers an explicit unexecuted trailing action: %s", (text) => {
    expect(outcome(text).action).toBe("recover");
  });
  it("bounds retries and reports incomplete work", () => {
    expect(outcome("Let me re-run the script.", 2)).toMatchObject({ action: "incomplete" });
    expect(outcome("Starting the stack:", 2).action).toBe("incomplete");
  });
  it.each([
    "Verified both findings and saved the report.",
    "The assessment is finished. Let me know if you want to run another test.",
    "I will not run that action because it is outside the approved scope.",
    "I can run another check if you want.",
    "Starting the stack succeeded. All checks passed.",
    "Installing is not necessary:",
    "The log contains the phrase 'Starting the stack:'.",
    "I am not extracting any more data:",
  ])("does not prolong a final answer or conditional offer: %s", (text) => {
    expect(outcome(text).action).toBe("complete");
  });
  it("does not reinterpret a plan that has not executed tools", () => {
    expect(outcome("I will run a check.", 0, false).action).toBe("complete");
  });
});
