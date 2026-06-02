import type { CharacterCategory, CharacterRecord } from "../../../lib/db";
import { createId } from "../../../lib/db";
import { starterDefinitions } from "./starterLibrary";

export const characterCategories: CharacterCategory[] = [
  "Companions",
  "Historical Minds",
  "Travel Guides",
  "Mentors",
  "Tutors",
  "Creative Partners",
  "Cinema & Manga",
  "Story Worlds",
  "Games",
  "Productivity",
  "Wellness-lite",
  "Debate",
  "Originals",
];

export const characterCategoryDescriptions: Record<CharacterCategory, string> = {
  Companions: "Warm conversational characters for open-ended company.",
  "Historical Minds": "Inspired-by guides for invention, science, philosophy, and strategy.",
  "Travel Guides": "Local, budget, luxury, food, and adventure planning companions.",
  Mentors: "Guides with taste, feedback, and long-horizon perspective.",
  Tutors: "Patient explainers for learning and practice.",
  "Creative Partners": "Co-writers, brainstormers, critics, and directors.",
  "Cinema & Manga": "Movie, series, manga, anime, and cinematic concept partners.",
  "Story Worlds": "Narrative settings with lore, stakes, and recurring cast.",
  Games: "Text adventures, puzzles, simulations, and playful challenges.",
  Productivity: "Focused assistants for planning, habits, and execution.",
  "Wellness-lite": "Reflective journaling and grounding, never a clinician.",
  Debate: "Socratic opponents and structured argument partners.",
  Originals: "Private original characters and inspired-by personas.",
};

export const createStarterCharacters = (): CharacterRecord[] => {
  const createdAt = Date.now();
  return starterDefinitions.map((definition, index) => ({
    ...definition,
    id: createId("char"),
    starterKey: definition.starterKey,
    visibility: "private",
    createdAt: createdAt + index,
    updatedAt: createdAt + index,
  }));
};

export const starterNameToKey = new Map(
  starterDefinitions.map(definition => [definition.name.trim().toLowerCase(), definition.starterKey])
);
