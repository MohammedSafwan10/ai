import { describe, expect, it } from "vitest";
import { needsBugBountyGuide, bugBountyAssessmentGuide } from "../src/main/kali/bugBountyGuide";
import { buildSecuritySystemPrompt } from "../src/main/kali/systemPrompt";

describe("automatic bug bounty guide", () => {
  it.each([
    "Test this bug-bounty program",
    "Find vulnerabilities in this HackerOne program",
    "Assess this Bugcrowd engagement",
    "Run our bug bounty evaluation",
  ])("recognizes an explicit assessment: %s", (prompt) => {
    expect(needsBugBountyGuide("", [prompt])).toBe(true);
  });
  it.each(["Inspect this URL", "Should I sign up for Bugcrowd?", "What is bug bounty?", "Compare HackerOne and Bugcrowd"])("does not activate for general research: %s", (prompt) => {
    expect(needsBugBountyGuide("Inspect web technology", [prompt])).toBe(false);
  });
  it("retains the workflow from earlier operator requests across follow-ups", () => {
    expect(needsBugBountyGuide("", ["Test this bug bounty program", "Continue", "Save the report"])).toBe(true);
    expect(needsBugBountyGuide("Assess our bug bounty lab", [])).toBe(true);
    expect(needsBugBountyGuide("", ["Inspect this URL"])).toBe(false);
  });
  it("bundles the guide and injects it only when selected", () => {
    const context = { environmentId: "kali", objective: "Evaluate fixture", scope: "Local fixture only" };
    const regular = buildSecuritySystemPrompt(context, null, "", "default", "yolo");
    const bounty = buildSecuritySystemPrompt(context, null, "", "default", "yolo", true);
    expect(regular).not.toContain("# Bug bounty assessment guide");
    expect(bounty).toContain(bugBountyAssessmentGuide);
    expect(bounty).toContain("Local fixture only");
    expect(bounty).toContain("never grants authorization");
    expect(bounty).toContain("one root-cause report or chain");
  });
});
