import { useEffect, useRef, useState } from "react";
import type { WheelEvent as ReactWheelEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ChatMessageRecord } from "../../../shared/types";
import { adjustForHiddenRow, useReadingAnchor } from "./scrollAnchoring";

interface MessageAutoScrollInput {
  activeThreadId: string | null;
  hasOlder: boolean;
  historyLoading: boolean;
  latestActivityKey: string;
  messages: ChatMessageRecord[];
  onLoadOlder: () => Promise<boolean>;
  settingsOpen: boolean;
  onFollowingLatestChange?: (following: boolean) => void;
}

export const useMessageAutoScroll = ({
  activeThreadId,
  hasOlder,
  historyLoading,
  latestActivityKey,
  messages,
  onLoadOlder,
  settingsOpen,
  onFollowingLatestChange,
}: MessageAutoScrollInput) => {
  const [showJumpButton, setShowJumpButton] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const readingAnchor = useReadingAnchor(scrollerRef, messages[0]?.id);
  const followBottomRef = useRef(true);
  const manualScrollHoldUntilRef = useRef(0);
  const userScrollLockRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const programmaticClearTimerRef = useRef<number | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const loadOlderRequestedRef = useRef(false);
  const previousThreadRef = useRef(activeThreadId);
  const messageVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 190,
    overscan: 8,
    getItemKey: (index) => messages[index]?.id ?? index,
    // Keep keyed prepend anchoring even while reading. A negative end threshold
    // disables resize-driven bottom pinning until the user follows again.
    anchorTo: "end",
    followOnAppend: false,
    scrollEndThreshold: followBottomRef.current ? 96 : -1,
  });
  messageVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = adjustForHiddenRow;

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
    readingAnchor.release();
    onFollowingLatestChange?.(true);
    followBottomRef.current = true;
    messageVirtualizer.setOptions({ ...messageVirtualizer.options, scrollEndThreshold: 96 });
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
      setShowJumpButton(distance > 96);
      return;
    }
    if (!followBottomRef.current) {
      setShowJumpButton(distance > 96);
      return;
    }
    scheduleScrollToLatest();
  }, [latestActivityKey, messageVirtualizer, messages.length, settingsOpen]);

  useEffect(() => {
    if (previousThreadRef.current !== activeThreadId) {
      // A reader's scroll lock belongs to one chat, not to every subsequent chat.
      previousThreadRef.current = activeThreadId;
      userScrollLockRef.current = false;
      followBottomRef.current = true;
      manualScrollHoldUntilRef.current = 0;
      programmaticScrollRef.current = false;
      if (scrollFrameRef.current) window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
    if (settingsOpen) return;
    if (userScrollLockRef.current) return;
    scrollToLatestMessage();
  }, [activeThreadId, settingsOpen]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || settingsOpen || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const distance = getBottomDistance();
      if (distance < 24) { setShowJumpButton(false); return; }
      if (followBottomRef.current && Date.now() >= manualScrollHoldUntilRef.current) scheduleScrollToLatest();
      else setShowJumpButton(distance > 96);
    });
    observer.observe(scroller);
    const content = scroller.querySelector(".virtual-message-spacer");
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [activeThreadId, messages.length, settingsOpen]);

  const handleMessageWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    readingAnchor.release();
    const distance = getBottomDistance();
    if (event.deltaY < 0 || distance > 24) {
      userScrollLockRef.current = true;
      manualScrollHoldUntilRef.current = Date.now() + 1200;
      followBottomRef.current = false;
      messageVirtualizer.setOptions({ ...messageVirtualizer.options, scrollEndThreshold: -1 });
      onFollowingLatestChange?.(false);
    }
  };

  const handleMessagePointerDown = () => {
    readingAnchor.release();
    manualScrollHoldUntilRef.current = Date.now() + 900;
  };

  const handleMessageScroll = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const distance = getBottomDistance();
    if (distance <= 1) {
      userScrollLockRef.current = false;
      followBottomRef.current = true;
      messageVirtualizer.setOptions({ ...messageVirtualizer.options, scrollEndThreshold: 96 });
      manualScrollHoldUntilRef.current = 0;
      setShowJumpButton(false);
      onFollowingLatestChange?.(true);
      return;
    }
    if (hasOlder && !historyLoading && !programmaticScrollRef.current && scroller.scrollTop < 420 && !loadOlderRequestedRef.current) {
      loadOlderRequestedRef.current = true;
      readingAnchor.capture();
      void onLoadOlder().finally(() => {
        loadOlderRequestedRef.current = false;
      });
    }
    if (!programmaticScrollRef.current) {
      if (userScrollLockRef.current) {
        followBottomRef.current = false;
        setShowJumpButton(distance > 96);
        return;
      }
      followBottomRef.current = distance < 96;
      messageVirtualizer.setOptions({ ...messageVirtualizer.options, scrollEndThreshold: followBottomRef.current ? 96 : -1 });
      onFollowingLatestChange?.(followBottomRef.current);
      if (distance >= 96) manualScrollHoldUntilRef.current = Date.now() + 900;
    }
    const shouldShow = distance > 96;
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
