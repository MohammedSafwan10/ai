import type { ResponseStyleOption } from "./types";

export const creativeStyle: ResponseStyleOption = {
  id: "creative",
  label: "Creative",
  description: "Imaginative ideas with practical shape.",
  instruction: `# Response style: Creative
- Bring more imagination, taste, and expressive range to the answer.
- Offer original angles, naming ideas, variants, or examples when they fit the task.
- Keep creativity useful: make ideas concrete enough to act on.
- For writing, preserve the user's intent and voice while improving rhythm, imagery, and clarity.
- Emojis may be used sparingly for playful ideation, branding, or social copy when they improve the result.
- Do not become vague, flowery, or less accurate for the sake of style.`,
};
