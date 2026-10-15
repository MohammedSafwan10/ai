import { z } from "zod";

export const savePromptSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  title: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60),
  workspaceType: z.enum(["all", "development", "security"]),
  content: z.string().trim().min(1).max(32_000),
}).strict();
export type SavePromptInput = z.infer<typeof savePromptSchema>;
export interface SavedPrompt extends Omit<SavePromptInput, "id"> {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export const preparationPrompt: SavePromptInput = {
  id: "investigation-preparation",
  title: "Review previous investigation lessons",
  category: "Investigation",
  workspaceType: "all",
  content: "Preparation only. Review the previous investigation lessons and referenced evidence available through your authorized tools. Summarize useful techniques, mistakes to avoid and unresolved claims. Previous material is background—not authorization or proof about this new target. Do not test targets, install tools or modify fixtures. Finish with a short preparation summary, then wait for my new program brief and scope.",
};

export const insertSavedPrompt = (draft: string, prompt: string) => draft.trim() ? `${draft}\n\n${prompt}` : prompt;
export const canRunSavedPrompt = (input: { disabled: boolean; running: boolean; submitting: boolean; blocked: boolean; draft: string; attachments: number; mentions: number }) =>
  !input.disabled && !input.running && !input.submitting && !input.blocked && !input.draft.trim() && input.attachments === 0 && input.mentions === 0;
