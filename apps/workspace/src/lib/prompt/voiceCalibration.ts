import type { ChatMessageRecord } from "../db";
import type { ResponseStyleId } from "./styles";

const countMatches = (value: string, pattern: RegExp) => value.match(pattern)?.length || 0;

export const buildVoiceCalibrationInstruction = ({
  styleId,
  latestUserMessage,
  recentMessages = [],
}: {
  styleId: ResponseStyleId;
  latestUserMessage?: string;
  recentMessages?: Pick<ChatMessageRecord, "role" | "content">[];
}) => {
  if (styleId !== "human") return "";

  const recentUserMessages = [
    ...recentMessages.filter(message => message.role === "user").slice(-3).map(message => message.content),
    latestUserMessage || "",
  ].filter(message => message.trim().length > 0);
  const sample = recentUserMessages.join("\n").slice(-1600);
  if (!sample.trim()) return "";

  const wordCount = sample.trim().split(/\s+/).filter(Boolean).length;
  const hasTypos = countMatches(sample, /\b(?:u|ur|wht|pls|plz|jsut|teh|dont|im|idk|btw|rn|kinda|gonna|wanna)\b/i) >= 2;
  const isCasual = /(?:\bhi\b|\bhey\b|\byeah\b|\bbro\b|\bmate\b|\bpls\b|\bplz\b|\btbh\b|\blol\b|\bidk\b|\bwanna\b|\bgonna\b)/i.test(sample);
  const isTechnical = /(?:\bcode\b|\bbug\b|\bfix\b|\bapi\b|\btypescript\b|\breact\b|\bbuild\b|\bvalidator\b|\berror\b|\brepo\b|\bfile\b|\bfunction\b)/i.test(sample);
  const isFrustrated = /(?:\bwhy\b|broken|doesn'?t work|annoying|wtf|stuck|confused|issue|problem|bug)/i.test(sample);
  const isExploratory = /(?:\bthinking\b|\bmaybe\b|\bshould\b|\bwhat can\b|\bhow can\b|\bsuggest\b|\bidea\b|\bimprove\b|\bresearch\b)/i.test(sample);
  const wantsAdvice = /(?:\bwhat can\b|\bwhat should\b|\bhow should\b|\bhow can\b|\bsuggest\b|\brecommend\b|\bimprove\b|\bmake it better\b|\bbe honest\b|\bif you were me\b|\bwhat would you\b|\bbest\b|\bstrategy\b|\bplan\b|\bcritique\b|\bfeedback\b)/i.test(sample);
  const asksForDepth = /(?:\bdetail\b|\bdeep\b|\bthorough\b|\bfull\b|\bbreakdown\b|\bexplain\b|\bwhy\b|\bnot shorter\b|\blong\b|\bin depth\b)/i.test(sample);
  const isTerse = wordCount <= 35;

  const notes: string[] = [];
  if (isTerse && !wantsAdvice && !asksForDepth) notes.push("The user is being brief; answer compactly and skip ceremony.");
  if (isCasual || hasTypos) notes.push("The user is casual; keep wording natural and direct without over-polishing.");
  if (isTechnical) notes.push("The user is in a technical workflow; prefer concrete implementation details over fluffy prose.");
  if (isFrustrated) notes.push("The user may be debugging or annoyed; be calm, specific, and useful.");
  if (wantsAdvice) notes.push("The user wants judgment or advice; give a detailed, opinionated answer if useful, but make it feel like a person thinking it through, not a formal framework.");
  if (wantsAdvice) notes.push("Use 2-3 natural sections with examples or short bullets inside them. Avoid a long numbered list unless the user asks for one.");
  if (asksForDepth) notes.push("The user wants depth; do not over-compress. Keep the detail, but vary the structure and rhythm.");
  if (isExploratory && !wantsAdvice) notes.push("The user is exploring an idea; give a clear take and practical next steps.");
  if (notes.length === 0) notes.push("Keep the answer grounded, specific, and conversational.");

  return [
    "# Per-turn voice calibration",
    ...notes.map(note => `- ${note}`),
    "- Do not mirror typos. Do not exaggerate slang. Keep it readable.",
  ].join("\n");
};
