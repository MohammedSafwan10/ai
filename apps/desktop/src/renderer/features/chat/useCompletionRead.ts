import { useEffect } from "react";
import type { RefObject } from "react";
import type { ChatMessageRecord, ThreadRecord } from "../../../shared/types";

/** Acknowledges the exact completion after its end was visible for one second. */
export const useCompletionRead = (thread: ThreadRecord | null | undefined, messages: ChatMessageRecord[], scroller: RefObject<HTMLDivElement | null>, blocked: boolean) => {
  const completionId = thread?.unreadCompletionId;
  const loaded = messages.some((message) => message.id === completionId && message.status === "completed");
  useEffect(() => {
    if (!thread || !completionId || !loaded || blocked) return;
    let since = 0; let pending = false; let disposed = false;
    const check = () => {
      const element = scroller.current;
      const visible = element && element.getClientRects().length > 0 && element.clientHeight > 0;
      const atBottom = element && element.scrollHeight - element.scrollTop - element.clientHeight < 60;
      const modalOpen = Boolean(document.querySelector('dialog[open], [aria-modal="true"]'));
      const result = element?.querySelector(`[data-completion-message="${CSS.escape(completionId)}"]`);
      const resultBounds = result?.getBoundingClientRect(); const viewport = element?.getBoundingClientRect();
      const endVisible = resultBounds && viewport && resultBounds.bottom > viewport.top && resultBounds.bottom <= viewport.bottom + 4;
      if (!document.hasFocus() || document.visibilityState !== "visible" || modalOpen || !visible || !atBottom || !endVisible) { since = 0; return; }
      if (!since) since = Date.now();
      if (Date.now() - since < 1000 || pending) return;
      pending = true;
      void window.privoraDesktop.markChatCompletionRead({ threadId: thread.id, completionId }).then((marked) => { if (!marked && !disposed) { pending = false; since = 0; } }).catch(() => { if (!disposed) { pending = false; since = 0; } });
    };
    const timer = window.setInterval(check, 350); check();
    return () => { disposed = true; window.clearInterval(timer); };
  }, [thread?.id, completionId, loaded, blocked, scroller]);
};
