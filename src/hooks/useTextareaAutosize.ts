import { useLayoutEffect, type RefObject } from "react";

export function useTextareaAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;

    const maxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight);
    textarea.style.height = "auto";

    const nextHeight = Number.isFinite(maxHeight)
      ? Math.min(textarea.scrollHeight, maxHeight)
      : textarea.scrollHeight;

    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = Number.isFinite(maxHeight) && textarea.scrollHeight > maxHeight
      ? "auto"
      : "hidden";
  }, [ref, value]);
}
