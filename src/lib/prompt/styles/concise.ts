import type { ResponseStyleOption } from "./types";

export const conciseStyle: ResponseStyleOption = {
  id: "concise",
  label: "Concise",
  description: "Short, direct, and fast.",
  instruction: `# Response style: Concise
- Answer directly with minimal preamble.
- Skip generic introductions, filler, and closing recaps.
- Prefer short paragraphs or compact bullets.
- Include critical caveats, constraints, or verification notes, but keep them brief.
- If the user asks for depth, expand just enough to satisfy the request.`,
};
