import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContextMentionRecord, DesktopAttachmentRecord, StartTurnInput } from "../../../shared/types";

type TurnSettings = Pick<StartTurnInput, "model" | "reasoningEffort" | "collaborationMode">;

export interface ComposerDraft {
  id: number;
  text: string;
  attachments?: DesktopAttachmentRecord[];
  contextMentions?: ContextMentionRecord[];
  turnSettings?: TurnSettings;
}

export interface QueuedPrompt {
  id: string;
  prompt: string;
  attachments?: DesktopAttachmentRecord[];
  contextMentions?: ContextMentionRecord[];
  turnSettings?: TurnSettings;
}

interface PromptQueueInput {
  activeThreadId: string | null;
  running: boolean;
  resumableBlocked?: boolean;
  onDraft: (draft: ComposerDraft | null) => void;
  startTurn: (input: StartTurnInput) => Promise<void>;
  stopTurn: (threadId: string) => Promise<void>;
  turnSettings?: TurnSettings;
}

export const usePromptQueue = ({
  activeThreadId,
  running,
  resumableBlocked = false,
  onDraft,
  startTurn,
  stopTurn,
  turnSettings = {},
}: PromptQueueInput) => {
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const [queuePaused, setQueuePaused] = useState(false);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [stoppingThreadId, setStoppingThreadId] = useState<string | null>(null);
  const directSubmitInFlightRef = useRef(false);
  const queuedSubmitInFlightRef = useRef(false);

  const stopping = Boolean(activeThreadId && stoppingThreadId === activeThreadId && running);

  useEffect(() => {
    setQueuedPrompts([]);
    setQueuePaused(false);
    setQueueExpanded(false);
    setStoppingThreadId(null);
    directSubmitInFlightRef.current = false;
    queuedSubmitInFlightRef.current = false;
  }, [activeThreadId]);

  useEffect(() => {
    if (queuedPrompts.length <= 1) setQueueExpanded(false);
  }, [queuedPrompts.length]);

  useEffect(() => {
    if (!running && stoppingThreadId === activeThreadId) setStoppingThreadId(null);
  }, [activeThreadId, running, stoppingThreadId]);

  useEffect(() => {
    if (resumableBlocked && queuedPrompts.length > 0) setQueuePaused(true);
  }, [queuedPrompts.length, resumableBlocked]);

  useEffect(() => {
    if (running) {
      directSubmitInFlightRef.current = false;
      queuedSubmitInFlightRef.current = false;
    }
  }, [running]);

  const enqueuePrompt = useCallback((
    prompt: string,
    attachments?: DesktopAttachmentRecord[],
    contextMentions?: ContextMentionRecord[],
  ) => {
    setQueuedPrompts((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        prompt,
        attachments,
        contextMentions,
        turnSettings,
      },
    ]);
  }, [turnSettings]);

  const startPrompt = useCallback(async (
    prompt: string,
    attachments?: DesktopAttachmentRecord[],
    contextMentions?: ContextMentionRecord[],
  ) => {
    if (!activeThreadId) return false;
    if (running || directSubmitInFlightRef.current) {
      enqueuePrompt(prompt, attachments, contextMentions);
      return true;
    }
    directSubmitInFlightRef.current = true;
    void startTurn({ threadId: activeThreadId, prompt, attachments, contextMentions, ...turnSettings })
      .catch((error) => {
        console.error(error);
        onDraft({
          id: Date.now(),
          text: prompt,
          attachments,
          contextMentions,
        });
      })
      .finally(() => {
        directSubmitInFlightRef.current = false;
      });
    return true;
  }, [activeThreadId, enqueuePrompt, onDraft, running, startTurn, turnSettings]);

  useEffect(() => {
    if (running) queuedSubmitInFlightRef.current = false;
    if (!activeThreadId || running || resumableBlocked || queuePaused || queuedSubmitInFlightRef.current || queuedPrompts.length === 0) return;
    const [next, ...rest] = queuedPrompts;
    queuedSubmitInFlightRef.current = true;
    setQueuedPrompts(rest);
    void startTurn({
      threadId: activeThreadId,
      prompt: next.prompt,
      attachments: next.attachments,
      contextMentions: next.contextMentions,
      ...next.turnSettings,
    }).catch(() => {
      queuedSubmitInFlightRef.current = false;
      setQueuedPrompts((current) => [next, ...current]);
    });
  }, [activeThreadId, queuePaused, queuedPrompts, resumableBlocked, running, startTurn]);

  const runQueuedPrompt = useCallback((item: QueuedPrompt) => {
    if (!activeThreadId || running || queuedSubmitInFlightRef.current) return;
    queuedSubmitInFlightRef.current = true;
    setQueuePaused(false);
    setQueuedPrompts((current) => current.filter((candidate) => candidate.id !== item.id));
    void startTurn({
      threadId: activeThreadId,
      prompt: item.prompt,
      attachments: item.attachments,
      contextMentions: item.contextMentions,
      ...item.turnSettings,
    }).catch(() => {
      queuedSubmitInFlightRef.current = false;
      setQueuedPrompts((current) => [item, ...current]);
      setQueuePaused(true);
    });
  }, [activeThreadId, running, startTurn]);

  const stopActiveTurn = useCallback(() => {
    if (!activeThreadId || stoppingThreadId === activeThreadId) return;
    setStoppingThreadId(activeThreadId);
    if (queuedPrompts.length > 0) setQueuePaused(true);
    void stopTurn(activeThreadId);
  }, [activeThreadId, queuedPrompts.length, stoppingThreadId, stopTurn]);

  const editQueuedPrompt = useCallback((item: QueuedPrompt) => {
    onDraft({
      id: Date.now(),
      text: item.prompt,
      attachments: item.attachments,
      contextMentions: item.contextMentions,
    });
    setQueuedPrompts((current) => current.filter((candidate) => candidate.id !== item.id));
  }, [onDraft]);

  const removeQueuedPrompt = useCallback((item: QueuedPrompt) => {
    setQueuedPrompts((current) => current.filter((candidate) => candidate.id !== item.id));
  }, []);

  const queuedHead = queuedPrompts[0] || null;
  const queuedRest = useMemo(() => queuedPrompts.slice(1), [queuedPrompts]);

  return {
    editQueuedPrompt,
    queueExpanded,
    queuePaused,
    queuedHead,
    queuedPrompts,
    queuedRest,
    removeQueuedPrompt,
    runQueuedPrompt,
    setQueueExpanded,
    startPrompt,
    stopActiveTurn,
    stopping,
  };
};
