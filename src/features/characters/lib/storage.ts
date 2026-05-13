import { appLogger } from "../../../lib/logger";
import {
  createId,
  db,
  type CharacterMemoryRecord,
  type CharacterMessageRecord,
  type CharacterRecord,
  type CharacterSessionRecord,
  type UserPersonaRecord,
} from "../../../lib/db";
import { createStarterCharacters, starterNameToKey } from "./defaults";

const normalizeCharacterName = (name: string) => name.trim().toLowerCase();

const getStarterKeyForCharacter = (character: CharacterRecord) =>
  character.starterKey || starterNameToKey.get(normalizeCharacterName(character.name));

export const loadCharacters = async () => {
  let characters = await db.characters.orderBy("updatedAt").reverse().toArray();
  const starters = createStarterCharacters();
  if (characters.length === 0) {
    characters = starters;
    await db.characters.bulkPut(characters);
    appLogger.info("Starter characters seeded", { count: characters.length });
    return characters;
  }

  const sessions = await db.characterSessions.toArray();
  const memories = await db.characterMemories.toArray();
  const referencedCharacterIds = new Set([
    ...sessions.map(session => session.characterId),
    ...memories.map(memory => memory.characterId),
  ]);
  const starterGroups = new Map<string, CharacterRecord[]>();

  for (const character of characters) {
    const starterKey = getStarterKeyForCharacter(character);
    if (!starterKey) continue;
    const group = starterGroups.get(starterKey) || [];
    group.push(character);
    starterGroups.set(starterKey, group);
  }

  const starterKeyBackfills = new Map<string, string>();
  const duplicateStarterIdsToDelete = new Set<string>();

  for (const [starterKey, group] of starterGroups) {
    const canonical = [...group].sort((a, b) => {
      const referencedDelta = Number(referencedCharacterIds.has(b.id)) - Number(referencedCharacterIds.has(a.id));
      if (referencedDelta !== 0) return referencedDelta;
      const legacyDelta = Number(!b.starterKey) - Number(!a.starterKey);
      if (legacyDelta !== 0) return legacyDelta;
      return a.createdAt - b.createdAt;
    })[0];

    if (canonical && !canonical.starterKey) {
      starterKeyBackfills.set(canonical.id, starterKey);
    }

    for (const duplicate of group) {
      if (duplicate.id === canonical?.id) continue;
      if (duplicate.starterKey && !referencedCharacterIds.has(duplicate.id)) {
        duplicateStarterIdsToDelete.add(duplicate.id);
      }
    }
  }

  const survivingStarterKeys = new Set<string>();
  for (const character of characters) {
    if (duplicateStarterIdsToDelete.has(character.id)) continue;
    const starterKey = starterKeyBackfills.get(character.id) || getStarterKeyForCharacter(character);
    if (starterKey) survivingStarterKeys.add(starterKey);
  }

  const missingStarters = starters.filter(starter => starter.starterKey && !survivingStarterKeys.has(starter.starterKey));

  if (starterKeyBackfills.size > 0 || duplicateStarterIdsToDelete.size > 0 || missingStarters.length > 0) {
    await db.transaction("rw", db.characters, async () => {
      await Promise.all(Array.from(starterKeyBackfills.entries()).map(([id, starterKey]) =>
        db.characters.update(id, { starterKey })
      ));
      await Promise.all(Array.from(duplicateStarterIdsToDelete).map(id => db.characters.delete(id)));
      if (missingStarters.length > 0) await db.characters.bulkPut(missingStarters);
    });
    appLogger.info("Starter characters backfilled", {
      added: missingStarters.length,
      taggedExisting: starterKeyBackfills.size,
      removedDuplicates: duplicateStarterIdsToDelete.size,
    });
    characters = await db.characters.orderBy("updatedAt").reverse().toArray();
  }
  return characters;
};

export const loadCharacterSessions = async () =>
  db.characterSessions.orderBy("updatedAt").reverse().toArray();

export const loadCharacterMessages = async (sessionId: string) =>
  db.characterMessages.where("sessionId").equals(sessionId).sortBy("createdAt");

export const loadCharacterMemories = async (characterId: string, sessionId?: string) => {
  const all = await db.characterMemories.where("characterId").equals(characterId).sortBy("updatedAt");
  return all
    .filter(memory => memory.pinned || !memory.sessionId || memory.sessionId === sessionId)
    .reverse();
};

export const loadUserPersonas = async () => {
  const personas = await db.userPersonas.orderBy("updatedAt").reverse().toArray();
  if (personas.length > 0) return personas;

  const now = Date.now();
  const defaultPersona: UserPersonaRecord = {
    id: createId("persona"),
    name: "Default persona",
    description: "",
    preferences: "",
    boundaries: "",
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  };
  await db.userPersonas.put(defaultPersona);
  return [defaultPersona];
};

export const createCharacter = async (character: Omit<CharacterRecord, "id" | "createdAt" | "updatedAt">) => {
  const now = Date.now();
  const next: CharacterRecord = {
    ...character,
    id: createId("char"),
    createdAt: now,
    updatedAt: now,
  };
  await db.characters.put(next);
  return next;
};

export const updateCharacter = async (id: string, patch: Partial<Omit<CharacterRecord, "id" | "createdAt">>) => {
  await db.characters.update(id, { ...patch, updatedAt: Date.now() });
};

export const deleteCharacter = async (id: string) => {
  const sessions = await db.characterSessions.where("characterId").equals(id).toArray();
  const sessionIds = sessions.map(session => session.id);
  await db.transaction("rw", db.characters, db.characterSessions, db.characterMessages, db.characterMemories, async () => {
    await db.characters.delete(id);
    await db.characterSessions.where("characterId").equals(id).delete();
    await db.characterMemories.where("characterId").equals(id).delete();
    await Promise.all(sessionIds.map(sessionId => db.characterMessages.where("sessionId").equals(sessionId).delete()));
  });
};

export const createCharacterSession = async ({
  character,
  model,
  userPersonaId,
}: {
  character: CharacterRecord;
  model?: string;
  userPersonaId?: string;
}) => {
  const now = Date.now();
  const session: CharacterSessionRecord = {
    id: createId("char_session"),
    characterId: character.id,
    title: character.name,
    model,
    userPersonaId,
    memoryEnabled: true,
    createdAt: now,
    updatedAt: now,
  };
  const greeting: CharacterMessageRecord = {
    id: createId("char_msg"),
    sessionId: session.id,
    role: "model",
    content: character.greeting,
    createdAt: now + 1,
  };
  await db.transaction("rw", db.characterSessions, db.characterMessages, async () => {
    await db.characterSessions.put(session);
    await db.characterMessages.put(greeting);
  });
  return { session, messages: [greeting] };
};

export const updateCharacterSession = async (
  id: string,
  patch: Partial<Pick<CharacterSessionRecord, "title" | "model" | "userPersonaId" | "isStarred" | "memoryEnabled" | "updatedAt">>
) => {
  await db.characterSessions.update(id, { ...patch, updatedAt: patch.updatedAt || Date.now() });
};

export const deleteCharacterSession = async (id: string) => {
  await db.transaction("rw", db.characterSessions, db.characterMessages, db.characterMemories, async () => {
    await db.characterSessions.delete(id);
    await db.characterMessages.where("sessionId").equals(id).delete();
    await db.characterMemories.where("sessionId").equals(id).delete();
  });
};

export const replaceCharacterMessages = async (
  sessionId: string,
  messages: CharacterMessageRecord[],
  sessionPatch: Partial<Pick<CharacterSessionRecord, "title" | "model" | "updatedAt">> = {}
) => {
  await db.transaction("rw", db.characterSessions, db.characterMessages, async () => {
    await db.characterMessages.where("sessionId").equals(sessionId).delete();
    if (messages.length > 0) {
      await db.characterMessages.bulkPut(messages);
    }
    await db.characterSessions.update(sessionId, { ...sessionPatch, updatedAt: sessionPatch.updatedAt || Date.now() });
  });
};

export const createCharacterMemory = async (
  memory: Omit<CharacterMemoryRecord, "id" | "createdAt" | "updatedAt">
) => {
  const now = Date.now();
  const next: CharacterMemoryRecord = {
    ...memory,
    id: createId("char_memory"),
    createdAt: now,
    updatedAt: now,
  };
  await db.characterMemories.put(next);
  return next;
};

export const updateCharacterMemory = async (
  id: string,
  patch: Partial<Pick<CharacterMemoryRecord, "content" | "pinned" | "type">>
) => {
  await db.characterMemories.update(id, { ...patch, updatedAt: Date.now() });
};

export const deleteCharacterMemory = async (id: string) => {
  await db.characterMemories.delete(id);
};
