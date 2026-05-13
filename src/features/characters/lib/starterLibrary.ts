import type { StarterCharacterDefinition } from "./starters/types";
import { creativeStarterCharacters } from "./starters/creative";
import { mentorStarterCharacters } from "./starters/mentors";
import { storyWorldStarterCharacters } from "./starters/storyWorlds";
import { historicalStarterCharacters } from "./starters/historical";
import { travelStarterCharacters } from "./starters/travel";
import { productivityStarterCharacters } from "./starters/productivity";
import { wellnessStarterCharacters } from "./starters/wellness";
import { gameStarterCharacters } from "./starters/games";
import { cinemaMangaStarterCharacters } from "./starters/cinemaManga";
export { featuredStarterKeys } from "./starters/shared";

export const starterDefinitions: StarterCharacterDefinition[] = [
  ...creativeStarterCharacters,
  ...mentorStarterCharacters,
  ...storyWorldStarterCharacters,
  ...historicalStarterCharacters,
  ...travelStarterCharacters,
  ...productivityStarterCharacters,
  ...wellnessStarterCharacters,
  ...gameStarterCharacters,
  ...cinemaMangaStarterCharacters,
];
