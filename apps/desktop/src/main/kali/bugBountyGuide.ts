import guide from "./bugBountyGuide.md?raw";

const bountyContext = /\bbug[\s-]*bount(?:y|ies)\b|\b(?:bugcrowd|hackerone)\b/i;
const assessmentIntent = /\b(?:test(?:ing)?|assess(?:ment|ing)?|audit(?:ing)?|hunt(?:ing)?|investigat(?:e|ing|ion)|evaluat(?:e|ing|ion)|reproduc(?:e|ing)|verify|verif(?:ying|ication))\b|\b(?:find|discover|validate)\b[^.!?\n]{0,60}\b(?:bugs?|vulnerabilit(?:y|ies)|findings?)\b/i;

/** Only operator messages/project objectives select this workflow, never tool or web output. */
export const needsBugBountyGuide = (objective: string, userMessages: string[]) =>
  [objective, ...userMessages].some((text) => bountyContext.test(text) && assessmentIntent.test(text));

export const bugBountyAssessmentGuide = guide.trim();
