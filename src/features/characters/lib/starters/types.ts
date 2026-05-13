import type { CharacterRecord } from "../../../../lib/db";

export type StarterCharacterDefinition = Omit<CharacterRecord, "id" | "createdAt" | "updatedAt" | "visibility">;

export type StarterInput = StarterCharacterDefinition;
