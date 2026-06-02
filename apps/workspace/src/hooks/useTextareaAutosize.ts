import { useLayoutEffect, type RefObject } from "react";

export function useTextareaAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;

    const computedStyle = window.getComputedStyle(textarea);
    const maxHeight = Number.parseFloat(computedStyle.maxHeight);
    const minHeight = Number.parseFloat(computedStyle.minHeight);

    textarea.style.height = "0px";

    const contentHeight = textarea.scrollHeight;
    const cappedHeight = Number.isFinite(maxHeight)
      ? Math.min(contentHeight, maxHeight)
      : contentHeight;
    const nextHeight = value.trim()
      ? Math.max(Number.isFinite(minHeight) ? minHeight : 0, cappedHeight)
      : Number.isFinite(minHeight) ? minHeight : cappedHeight;

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = Number.isFinite(maxHeight) && contentHeight > maxHeight
      ? "auto"
      : "hidden";
  }, [ref, value]);
}
