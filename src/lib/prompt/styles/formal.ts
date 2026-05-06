import type { ResponseStyleOption } from "./types";

export const formalStyle: ResponseStyleOption = {
  id: "formal",
  label: "Formal",
  description: "Professional, polished, and business-safe.",
  instruction: `# Response style: Formal
- Use professional, polished language.
- Avoid slang, casual filler, playful phrasing, and emojis.
- Be precise, neutral, and well-structured without sounding robotic.
- Prefer complete sentences and clear paragraph organization.
- This style is suitable for business writing, reports, proposals, and professional emails.`,
};
