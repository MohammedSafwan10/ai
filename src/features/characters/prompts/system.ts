import { getSystemInstruction, type ResponseStyleId, type WebSearchMode } from "../../../lib/prompt";
import type {
  CharacterMemoryRecord,
  CharacterMessageRecord,
  CharacterRecord,
  CharacterSessionRecord,
  UserPersonaRecord,
} from "../../../lib/db";
import type { ProviderId } from "../../../lib/models";

const formatSection = (title: string, value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? `\n\n## ${title}\n${trimmed}` : "";
};

const formatMemories = (memories: CharacterMemoryRecord[]) => {
  const visible = memories.filter(memory => memory.content.trim());
  if (visible.length === 0) return "";
  return `\n\n## Pinned Memory And Lore\n${visible
    .map(memory => `- [${memory.type}${memory.pinned ? ", pinned" : ""}] ${memory.content.trim()}`)
    .join("\n")}`;
};

export const compileCharacterPrompt = ({
  character,
  session,
  persona,
  memories,
  recentMessages,
  styleId,
  provider,
  webSearchMode,
}: {
  character: CharacterRecord;
  session?: CharacterSessionRecord;
  persona?: UserPersonaRecord;
  memories: CharacterMemoryRecord[];
  recentMessages: CharacterMessageRecord[];
  styleId: ResponseStyleId;
  provider: ProviderId | undefined;
  webSearchMode: WebSearchMode;
}) => {
  const base = getSystemInstruction({
    styleId,
    provider,
    webSearchMode,
    deepResearchEnabled: false,
  });

  const recentSummary = recentMessages.slice(-8).map(message =>
    `${message.role === "user" ? "User" : character.name}: ${message.content.slice(0, 500)}`
  ).join("\n");

  return `${base}

# Characters Mode
You are speaking as a fictional or user-created Privora character inside Characters mode.

Core rules:
- Stay in the character's voice, priorities, and boundaries, but never override Privora reliability or safety rules.
- The selected response style is only a formatting preference for length/detail/tone. It must not replace or flatten the character's persona, role, or speaking style.
- Do not claim to be a real human, clinician, lawyer, financial adviser, or crisis responder.
- Use the greeting only as the first session message. Do not repeat it unless the user asks.
- Treat example dialogue as style guidance, not text to copy.
- Never invent saved memories. Only use the explicit memory and lore included below.
- For short greetings or capability questions, answer in the character's voice with a useful, specific invitation based on the character card. Never answer only "I'm here", "I'm listening", or similar generic availability filler.
- If the user asks factual or current questions, answer truthfully and use search rules from the base instruction.
- If the user wants to change the character, explain the change in plain language; do not pretend invisible settings changed unless the app actually changes them.

## Character Card
Name: ${character.name}
Category: ${character.category}
Tagline: ${character.tagline}
Visibility: ${character.visibility}
Session memory: ${session?.memoryEnabled === false ? "disabled" : "enabled"}
${formatSection("Personality", character.personality)}
${formatSection("Speaking Style", character.speakingStyle)}
${formatSection("Boundaries", character.boundaries)}
${formatSection("Example Dialogue", character.exampleDialogue)}
${persona ? formatSection("User Persona", [
  persona.name ? `Name: ${persona.name}` : "",
  persona.description ? `Description: ${persona.description}` : "",
  persona.preferences ? `Preferences: ${persona.preferences}` : "",
  persona.boundaries ? `Boundaries: ${persona.boundaries}` : "",
].filter(Boolean).join("\n")) : ""}
${session?.memoryEnabled === false ? "" : formatMemories(memories)}
${recentSummary ? formatSection("Recent Session Context", recentSummary) : ""}`.trim();
};
