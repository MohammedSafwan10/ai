import { useEffect, useRef, useState } from "react";
import type { WheelEvent as ReactWheelEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ChatMessageRecord } from "../../../shared/types";

interface MessageAutoScrollInput {
  activeThreadId: string | null;
  hasOlder: boolean;
  historyLoading: boolean;
  latestActivityKey: string;
  messages: ChatMessageRecord[];
  onLoadOlder: () => Promise<boolean>;
  settingsOpen: boolean;
}

export const useMessageAutoScroll = ({
  activeThreadId,
  hasOlder,
  historyLoading,
  latestActivityKey,
  messages,
  onLoadOlder,
  settingsOpen,
}: MessageAutoScrollInput) => {
  const [showJumpButton, setShowJumpButton] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const followBottomRef = useRef(true);
  const manualScrollHoldUntilRef = useRef(0);
  const userScrollLockRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const programmaticClearTimerRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const loadOlderRequestedRef = useRef(false);
  const messageVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 190,
    overscan: 8,
    getItemKey: (index) => messages[index]?.id ?? index,
    anchorTo: "end",
    followOnAppend: false,
    scrollEndThreshold: 96,
  });

  const getBottomDistance = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return 0;
    return Math.max(0, scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight);
  };

  const markProgrammaticScroll = () => {
    programmaticScrollRef.current = true;
    if (programmaticClearTimerRef.current) {
      window.clearTimeout(programmaticClearTimerRef.current);
    }
    programmaticClearTimerRef.current = window.setTimeout(() => {
      programmaticScrollRef.current = false;
      programmaticClearTimerRef.current = null;
    }, 120);
  };

  const scheduleScrollToLatest = (behavior: ScrollBehavior = "auto") => {
    if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      markProgrammaticScroll();
      if (messages.length > 0) {
        messageVirtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      } else {
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior });
      }
      setShowJumpButton(false);
    });
  };

  const scrollToLatestMessage = (behavior: ScrollBehavior = "auto") => {
    followBottomRef.current = true;
    userScrollLockRef.current = false;
    manualScrollHoldUntilRef.current = 0;
    scheduleScrollToLatest(behavior);
  };

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
      if (programmaticClearTimerRef.current) window.clearTimeout(programmaticClearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (settingsOpen || !scrollerRef.current) return;
    const distance = getBottomDistance();
    const now = Date.now();
    if (userScrollLockRef.current || now < manualScrollHoldUntilRef.current) {
      setShowJumpButton((value) => value || distance > 96);
      return;
    }
    if (!followBottomRef.current) {
      setShowJumpButton((value) => value || distance > 220);
      return;
    }
    scheduleScrollToLatest();
  }, [latestActivityKey, messageVirtualizer, messages.length, settingsOpen]);

  useEffect(() => {
    if (settingsOpen) return;
    if (userScrollLockRef.current) return;
    scrollToLatestMessage();
  }, [activeThreadId, settingsOpen]);

  const handleMessageWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const distance = getBottomDistance();
    if (event.deltaY < 0 || distance > 24) {
      userScrollLockRef.current = true;
      manualScrollHoldUntilRef.current = Date.now() + 1200;
      followBottomRef.current = false;
    }
  };

  const handleMessagePointerDown = () => {
    manualScrollHoldUntilRef.current = Date.now() + 900;
  };

  const handleMessageScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (hasOlder && !historyLoading && scroller.scrollTop < 420 && !loadOlderRequestedRef.current) {
      loadOlderRequestedRef.current = true;
      void onLoadOlder().finally(() => {
        loadOlderRequestedRef.current = false;
      });
    }
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    if (!programmaticScrollRef.current) {
      if (userScrollLockRef.current) {
        if (distance < 24 && Date.now() >= manualScrollHoldUntilRef.current) {
          userScrollLockRef.current = false;
          followBottomRef.current = true;
        } else {
          followBottomRef.current = false;
          setShowJumpButton((value) => value || distance > 96);
          return;
        }
      }
      followBottomRef.current = distance < 96;
      if (distance >= 96) manualScrollHoldUntilRef.current = Date.now() + 900;
    }
    const shouldShow = distance > 220;
    setShowJumpButton((value) => value === shouldShow ? value : shouldShow);
  };

  return {
    handleMessagePointerDown,
    handleMessageScroll,
    handleMessageWheel,
    messageVirtualizer,
    scrollToLatestMessage,
    scrollerRef,
    showJumpButton,
  };
};
