import type { ResponseStyleOption } from "./types";

export const explanatoryStyle: ResponseStyleOption = {
  id: "explanatory",
  label: "Explanatory",
  description: "Clear teaching from first principles.",
  instruction: `# Response style: Explanatory
- Treat the user's question as an opportunity to build understanding.
- Define important terms before relying on them.
- Explain the reasoning path, not just the conclusion.
- Use examples after the concept so the explanation lands clearly.
- Organize longer answers with headings or bullets, but avoid unnecessary verbosity.`,
};
