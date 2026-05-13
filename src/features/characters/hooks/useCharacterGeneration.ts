import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { streamCliproxyResponse } from "../../../lib/cliproxy/responses";
import { streamGeminiResponse, toGeminiContents } from "../../../lib/gemini/client";
import { streamOpenRouterResponse } from "../../../lib/openrouter/responses";
import { getModelOption } from "../../../lib/models";
import {
  createId,
  type AttachmentRecord,
  type CharacterMemoryRecord,
  type CharacterMessageRecord,
  type CharacterRecord,
  type CharacterSessionRecord,
  type UserPersonaRecord,
} from "../../../lib/db";
import { appLogger } from "../../../lib/logger";
import type { ResponseStyleId } from "../../../lib/prompt";
import type { Attachment } from "../../../lib/attachments";
import { compileCharacterPrompt } from "../prompts/system";
import { replaceCharacterMessages, updateCharacterSession } from "../lib/storage";

const toChatMessages = (messages: CharacterMessageRecord[]) =>
  messages.map(message => ({
    id: message.id,
    chatId: message.sessionId,
    role: message.role,
    content: message.content,
    thought: message.thought,
    isThinking: message.isThinking,
    attachments: message.attachments,
    createdAt: message.createdAt,
  }));

const toProviderHistory = (messages: CharacterMessageRecord[]) =>
  messages.map(message => ({
    role: message.role,
    content: message.content,
    attachments: message.attachments as Attachment[] | undefined,
  }));

const buildSessionTitle = (characterName: string, text: string) => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return characterName;
  return clean.length > 42 ? `${clean.slice(0, 42).trim()}...` : clean;
};

export function useCharacterGeneration({
  character,
  session,
  persona,
  memories,
  messages,
  setMessages,
  setSessions,
  selectedModel,
  selectedStyle,
  isThinkingEnabled,
  isWebSearchEnabled,
}: {
  character?: CharacterRecord;
  session?: CharacterSessionRecord;
  persona?: UserPersonaRecord;
  memories: CharacterMemoryRecord[];
  messages: CharacterMessageRecord[];
  setMessages: Dispatch<SetStateAction<CharacterMessageRecord[]>>;
  setSessions: Dispatch<SetStateAction<CharacterSessionRecord[]>>;
  selectedModel: string;
  selectedStyle: ResponseStyleId;
  isThinkingEnabled: boolean;
  isWebSearchEnabled: boolean;
}) {
  const abortRef = useRef<AbortController | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
    setMessages(prev => prev.map(message => message.isThinking ? { ...message, isThinking: false } : message));
  };

  const submit = async (
    content: string,
    attachments: AttachmentRecord[] = [],
    baseMessages: CharacterMessageRecord[] = messages
  ) => {
    if (!character || !session || !content.trim()) return;
    stop();

    const now = Date.now();
    const userMessage: CharacterMessageRecord = {
      id: createId("char_msg"),
      sessionId: session.id,
      role: "user",
      content: content.trim(),
      attachments,
      createdAt: now,
    };
    const assistantMessage: CharacterMessageRecord = {
      id: createId("char_msg"),
      sessionId: session.id,
      role: "model",
      content: "",
      thought: "",
      isThinking: false,
      createdAt: now + 1,
    };

    const pendingMessages = [...baseMessages, userMessage, assistantMessage];
    setMessages(pendingMessages);

    const model = selectedModel;
    const provider = getModelOption(model)?.provider;
    const titlePatch =
      session.title === character.name || session.title === "New character chat"
        ? { title: buildSessionTitle(character.name, content) }
        : {};
    setSessions(prev => prev.map(item =>
      item.id === session.id
        ? { ...item, ...titlePatch, model, updatedAt: now }
        : item
    ));
    await replaceCharacterMessages(session.id, pendingMessages, { ...titlePatch, model, updatedAt: now });

    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);

    const updateAssistant = (patch: Partial<CharacterMessageRecord>) => {
      setMessages(prev => prev.map(message =>
        message.id === assistantMessage.id ? { ...message, ...patch } : message
      ));
    };

    let assistantContent = "";
    let assistantThought = "";

    const instructions = compileCharacterPrompt({
      character,
      session,
      persona,
      memories,
      recentMessages: baseMessages,
      styleId: selectedStyle,
      provider,
      webSearchMode: isWebSearchEnabled ? "auto" : "off",
    });

    try {
      if (provider === "cliproxy") {
        await streamCliproxyResponse({
          model,
          instructions,
          history: toProviderHistory(pendingMessages.slice(0, -1)),
          reasoningEffort: isThinkingEnabled ? "medium" : "none",
          webSearchEnabled: isWebSearchEnabled,
          artifactToolsEnabled: false,
          signal: controller.signal,
          onTextDelta: (delta) => {
            assistantContent += delta;
            updateAssistant({ content: assistantContent });
          },
          onThoughtDelta: (delta) => {
            if (!delta) return;
            assistantThought += delta;
            updateAssistant({ thought: assistantThought, isThinking: assistantThought.trim().length > 0 });
          },
        });
      } else if (provider === "openrouter") {
        await streamOpenRouterResponse({
          model,
          instructions,
          history: pendingMessages.slice(0, -1).map(message => ({ role: message.role, content: message.content })),
          reasoningEnabled: isThinkingEnabled,
          webSearchEnabled: isWebSearchEnabled,
          artifactToolsEnabled: false,
          signal: controller.signal,
          onTextDelta: (delta) => {
            assistantContent += delta;
            updateAssistant({ content: assistantContent });
          },
          onThoughtDelta: (delta) => {
            if (!delta) return;
            assistantThought += delta;
            updateAssistant({ thought: assistantThought, isThinking: assistantThought.trim().length > 0 });
          },
        });
      } else {
        await streamGeminiResponse({
          model,
          contents: toGeminiContents(toChatMessages(pendingMessages.slice(0, -1))),
          systemInstruction: instructions,
          thinkingEnabled: isThinkingEnabled,
          webSearchEnabled: isWebSearchEnabled,
          artifactToolsEnabled: false,
          signal: controller.signal,
          onTextDelta: (delta) => {
            assistantContent += delta;
            updateAssistant({ content: assistantContent });
          },
          onThoughtDelta: (delta) => {
            if (!delta) return;
            assistantThought += delta;
            updateAssistant({ thought: assistantThought, isThinking: assistantThought.trim().length > 0 });
          },
          onWebSearch: () => undefined,
          onArtifactToolCall: () => undefined,
        });
      }

      const finalMessages = pendingMessages.map(message =>
        message.id === assistantMessage.id
          ? {
              ...message,
              content: assistantContent.trim(),
              thought: assistantThought,
              isThinking: false,
            }
          : message
      );
      setMessages(finalMessages);
      await replaceCharacterMessages(session.id, finalMessages, { model, updatedAt: Date.now() });
      await updateCharacterSession(session.id, { model, updatedAt: Date.now() });
    } catch (error) {
      if (controller.signal.aborted) {
        const stoppedMessages = pendingMessages.map(message =>
          message.id === assistantMessage.id ? { ...message, content: assistantContent, thought: assistantThought, isThinking: false } : message
        );
        setMessages(stoppedMessages);
        await replaceCharacterMessages(session.id, stoppedMessages, { model, updatedAt: Date.now() });
        return;
      }

      const message = error instanceof Error ? error.message : "Character response failed.";
      appLogger.error("Character generation failed", { err: error, sessionId: session.id, model });
      const failedMessages = pendingMessages.map(item =>
        item.id === assistantMessage.id
          ? { ...item, content: `I hit an error while replying: ${message}`, isThinking: false }
          : item
      );
      setMessages(failedMessages);
      await replaceCharacterMessages(session.id, failedMessages, { model, updatedAt: Date.now() });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setIsGenerating(false);
    }
  };

  return { submit, stop, isGenerating };
}
