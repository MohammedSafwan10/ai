import { useEffect, useRef, useState } from "react";
import type { WheelEvent as ReactWheelEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ChatMessageRecord } from "../../../shared/types";

interface MessageAutoScrollInput {
  activeThreadId: string | null;
  latestActivityKey: string;
  messages: ChatMessageRecord[];
  settingsOpen: boolean;
}

export const useMessageAutoScroll = ({
  activeThreadId,
  latestActivityKey,
  messages,
  settingsOpen,
}: MessageAutoScrollInput) => {
  const [showJumpButton, setShowJumpButton] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const followBottomRef = useRef(true);
  const manualScrollHoldUntilRef = useRef(0);
  const userScrollLockRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const messageVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 190,
    overscan: 6,
    getItemKey: (index) => messages[index]?.id ?? index,
  });

  const scrollToLatestMessage = (behavior: ScrollBehavior = "auto") => {
    followBottomRef.current = true;
    userScrollLockRef.current = false;
    manualScrollHoldUntilRef.current = 0;
    window.requestAnimationFrame(() => {
      programmaticScrollRef.current = true;
      if (messages.length > 0) {
        messageVirtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      } else {
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior });
      }
      window.setTimeout(() => {
        if (messages.length > 0) {
          messageVirtualizer.scrollToIndex(messages.length - 1, { align: "end" });
        } else {
          scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior });
        }
        programmaticScrollRef.current = false;
      }, 90);
      setShowJumpButton(false);
    });
  };

  useEffect(() => {
    if (settingsOpen) return;
    if (userScrollLockRef.current) {
      setShowJumpButton((value) => value ? value : true);
      return;
    }
    if (Date.now() < manualScrollHoldUntilRef.current) {
      setShowJumpButton((value) => value ? value : true);
      return;
    }
    if (!followBottomRef.current || !scrollerRef.current) {
      setShowJumpButton((value) => value ? value : true);
      return;
    }
    window.requestAnimationFrame(() => {
      programmaticScrollRef.current = true;
      if (messages.length > 0) {
        messageVirtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      } else {
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
      }
      window.setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 90);
      setShowJumpButton((value) => value && false);
    });
  }, [latestActivityKey, messageVirtualizer, messages.length, settingsOpen]);

  useEffect(() => {
    if (settingsOpen) return;
    if (userScrollLockRef.current) return;
    scrollToLatestMessage();
  }, [activeThreadId, settingsOpen, messages.length]);

  const handleMessageWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) {
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
