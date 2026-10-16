import { useMemo, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import type { ComposerDraftRecord } from "../../../shared/composerDraft";
import { composerDraftSession } from "./composerDraftSession";

export function useComposerDraft(threadId: string | null) {
  const session = useMemo(() => composerDraftSession(threadId, window.privoraDesktop), [threadId]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const setters = useMemo(() => {
    const setter = <K extends keyof Omit<ComposerDraftRecord, "revision">>(key: K): Dispatch<SetStateAction<ComposerDraftRecord[K]>> => (value) => session.update(key, value);
    return { setValue: setter("text"), setAttachments: setter("attachments"), setContextMentions: setter("contextMentions"), setPastedBlocks: setter("pastedBlocks") };
  }, [session]);
  return { ...state, ...setters, session };
}
