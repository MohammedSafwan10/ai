import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContextMentionRecord, DesktopAttachmentRecord, StartTurnInput, SteerTurnInput, SteerTurnResult } from "../../../shared/types";
import { beginPromptSubmission, promptSubmissionError } from "./promptSubmission";

type TurnSettings = Pick<StartTurnInput, "model" | "reasoningEffort" | "collaborationMode" | "agentHarnessMode">;

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
  activeTurnId?: string | null;
  running: boolean;
  resumableBlocked?: boolean;
  onDraft: (draft: ComposerDraft | null) => void;
  startTurn: (input: StartTurnInput) => Promise<void>;
  steerTurn: (input: SteerTurnInput) => Promise<SteerTurnResult>;
  stopTurn: (threadId: string) => Promise<void>;
  turnSettings?: TurnSettings;
}

export const usePromptQueue = ({
  activeThreadId,
  activeTurnId = null,
  running,
  resumableBlocked = false,
  onDraft,
  startTurn,
  steerTurn,
  stopTurn,
  turnSettings = {},
}: PromptQueueInput) => {
  const [queuedPromptsByThread, setQueuedPromptsByThread] = useState<Record<string, QueuedPrompt[]>>({});
  const queuedPrompts = activeThreadId ? queuedPromptsByThread[activeThreadId] || [] : [];
  const setQueuedPrompts = useCallback((update: QueuedPrompt[] | ((current: QueuedPrompt[]) => QueuedPrompt[])) => {
    if (!activeThreadId) return;
    setQueuedPromptsByThread((current) => {
      const previous = current[activeThreadId] || [];
      const next = typeof update === "function" ? update(previous) : update;
      if (next === previous) return current;
      if (next.length === 0) {
        const rest = { ...current };
        delete rest[activeThreadId];
        return rest;
      }
      return { ...current, [activeThreadId]: next };
    });
  }, [activeThreadId]);
  const [pausedThreads, setPausedThreads] = useState<Record<string, boolean>>({});
  const queuePaused = Boolean(activeThreadId && pausedThreads[activeThreadId]);
  const setQueuePaused = useCallback((paused: boolean) => {
    if (activeThreadId) setPausedThreads((current) => ({ ...current, [activeThreadId]: paused }));
  }, [activeThreadId]);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [stoppingThreadId, setStoppingThreadId] = useState<string | null>(null);
  const [steeringPromptId, setSteeringPromptId] = useState<string | null>(null);
  const [steerError, setSteerError] = useState<string | null>(null);
  const pendingSubmissionsRef = useRef(new Set<string>());
  const pendingSteersRef = useRef(new Set<string>());
  const currentThreadRef = useRef(activeThreadId);
  currentThreadRef.current = activeThreadId;
  const [submissionVersion, setSubmissionVersion] = useState(0);

  const stopping = Boolean(activeThreadId && stoppingThreadId === activeThreadId && running);

  useEffect(() => {
    setQueueExpanded(false);
    setStoppingThreadId(null);
    setSteeringPromptId(null);
    setSteerError(null);
  }, [activeThreadId]);

  useEffect(() => {
    if (queuedPrompts.length <= 1) setQueueExpanded(false);
  }, [queuedPrompts.length]);

  useEffect(() => {
    if (!running && stoppingThreadId === activeThreadId) setStoppingThreadId(null);
  }, [activeThreadId, running, stoppingThreadId]);

  useEffect(() => {
    if (resumableBlocked && queuedPrompts.length > 0) setQueuePaused(true);
  }, [queuedPrompts.length, resumableBlocked, setQueuePaused]);

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
  }, [setQueuedPrompts, turnSettings]);

  const startPrompt = useCallback(async (
    prompt: string,
    attachments?: DesktopAttachmentRecord[],
    contextMentions?: ContextMentionRecord[],
  ) => {
    if (!activeThreadId) return false;
    if (running || pendingSubmissionsRef.current.has(activeThreadId)) {
      enqueuePrompt(prompt, attachments, contextMentions);
      return true;
    }
    const submission = beginPromptSubmission(pendingSubmissionsRef.current, activeThreadId, () =>
      startTurn({ threadId: activeThreadId, prompt, attachments, contextMentions, ...turnSettings }));
    if (!submission) return false;
    void submission
      .then(() => { if (currentThreadRef.current === activeThreadId) setSteerError(null); })
      .catch((error) => {
        console.error(error);
        setQueuedPrompts((current) => [{ id: crypto.randomUUID(), prompt, attachments, contextMentions, turnSettings }, ...current]);
        setQueuePaused(true);
        if (currentThreadRef.current === activeThreadId) setSteerError(promptSubmissionError(error));
      })
      .finally(() => {
        setSubmissionVersion((version) => version + 1);
      });
    return true;
  }, [activeThreadId, enqueuePrompt, running, setQueuedPrompts, setQueuePaused, startTurn, turnSettings]);

  useEffect(() => {
    if (!activeThreadId || running || resumableBlocked || queuePaused || pendingSubmissionsRef.current.has(activeThreadId) || queuedPrompts.length === 0) return;
    const [next, ...rest] = queuedPrompts;
    const submission = beginPromptSubmission(pendingSubmissionsRef.current, activeThreadId, () => startTurn({
      threadId: activeThreadId, prompt: next.prompt, attachments: next.attachments,
      contextMentions: next.contextMentions, ...next.turnSettings,
    }));
    if (!submission) return;
    setQueuedPrompts(rest);
    void submission.then(() => { if (currentThreadRef.current === activeThreadId) setSteerError(null); }).catch((error) => {
      setQueuedPrompts((current) => [next, ...current]);
      setQueuePaused(true);
      if (currentThreadRef.current === activeThreadId) setSteerError(promptSubmissionError(error));
    }).finally(() => setSubmissionVersion((version) => version + 1));
  }, [activeThreadId, queuePaused, queuedPrompts, resumableBlocked, running, setQueuedPrompts, setQueuePaused, startTurn, submissionVersion]);

  const runQueuedPrompt = useCallback((item: QueuedPrompt) => {
    if (!activeThreadId || running) return;
    const submission = beginPromptSubmission(pendingSubmissionsRef.current, activeThreadId, () => startTurn({
      threadId: activeThreadId, prompt: item.prompt, attachments: item.attachments,
      contextMentions: item.contextMentions, ...item.turnSettings,
    }));
    if (!submission) return;
    setQueuePaused(false);
    setQueuedPrompts((current) => current.filter((candidate) => candidate.id !== item.id));
    void submission.then(() => { if (currentThreadRef.current === activeThreadId) setSteerError(null); }).catch((error) => {
      setQueuedPrompts((current) => [item, ...current]);
      setQueuePaused(true);
      if (currentThreadRef.current === activeThreadId) setSteerError(promptSubmissionError(error));
    }).finally(() => setSubmissionVersion((version) => version + 1));
  }, [activeThreadId, running, setQueuedPrompts, setQueuePaused, startTurn]);

  const stopActiveTurn = useCallback(() => {
    if (!activeThreadId || stoppingThreadId === activeThreadId) return;
    setStoppingThreadId(activeThreadId);
    if (queuedPrompts.length > 0) setQueuePaused(true);
    void stopTurn(activeThreadId).catch((error) => {
      setStoppingThreadId((current) => current === activeThreadId ? null : current);
      if (currentThreadRef.current === activeThreadId) setSteerError(error instanceof Error ? error.message : "Could not stop this turn.");
    });
  }, [activeThreadId, queuedPrompts.length, setQueuePaused, stoppingThreadId, stopTurn]);

  const editQueuedPrompt = useCallback((item: QueuedPrompt) => {
    onDraft({
      id: Date.now(),
      text: item.prompt,
      attachments: item.attachments,
      contextMentions: item.contextMentions,
    });
    setQueuedPrompts((current) => current.filter((candidate) => candidate.id !== item.id));
  }, [onDraft, setQueuedPrompts]);

  const removeQueuedPrompt = useCallback((item: QueuedPrompt) => {
    setQueuedPrompts((current) => current.filter((candidate) => candidate.id !== item.id));
  }, [setQueuedPrompts]);

  const steerQueuedPrompt = useCallback(async (item: QueuedPrompt) => {
    if (!activeThreadId || !activeTurnId || !running || pendingSteersRef.current.has(activeThreadId)) return;
    pendingSteersRef.current.add(activeThreadId);
    setSteeringPromptId(item.id);
    setSteerError(null);
    try {
      const result = await steerTurn({
        threadId: activeThreadId,
        expectedTurnId: activeTurnId,
        prompt: item.prompt,
        attachments: item.attachments,
        contextMentions: item.contextMentions,
      });
      if (result.turnId !== activeTurnId) throw new Error("The active turn changed before steering completed.");
      setQueuedPrompts((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (error) {
      if (currentThreadRef.current === activeThreadId) setSteerError(error instanceof Error ? error.message : "Could not steer the active turn.");
    } finally {
      pendingSteersRef.current.delete(activeThreadId);
      if (currentThreadRef.current === activeThreadId) setSteeringPromptId(null);
    }
  }, [activeThreadId, activeTurnId, running, setQueuedPrompts, steerTurn]);

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
    steerError,
    steerQueuedPrompt,
    steeringPromptId,
    startPrompt,
    stopActiveTurn,
    stopping,
  };
};
