import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useRef } from "react";

// A message can span several screens. Resizing its tool details must not move
// the viewport merely because the message's beginning is above the fold.
// Only compensate for rows which were entirely above the visible content.
export function adjustForHiddenRow(
  item: VirtualItem,
  _delta: number,
  instance: Virtualizer<HTMLDivElement, Element>,
): boolean {
  // Read the DOM offset: the observed offset can lag behind earlier writes in
  // the same measurement batch when many prepended rows resize together.
  return item.end <= (instance.scrollElement?.scrollTop ?? instance.scrollOffset ?? 0);
}

export function useReadingAnchor(element: { current: HTMLDivElement | null }, firstKey: string | undefined) {
  const anchor = useRef<{ id: string; top: number; firstKey: string | undefined; until: number } | null>(null);
  const release = () => { anchor.current = null; };
  const capture = () => {
    const root = element.current;
    if (!root) return;
    const fold = root.getBoundingClientRect().top;
    const row = Array.from(root.querySelectorAll<HTMLElement>("[data-message-id]")).find((item) => item.getBoundingClientRect().bottom > fold);
    if (row?.dataset.messageId) anchor.current = { id: row.dataset.messageId, top: row.getBoundingClientRect().top - fold, firstKey, until: 0 };
  };
  useLayoutEffect(() => {
    const current = anchor.current;
    const root = element.current;
    if (!current || !root || current.firstKey === firstKey) return;
    if (!current.until) current.until = Date.now() + 1000;
    if (Date.now() > current.until) { release(); return; }
    const row = Array.from(root.querySelectorAll<HTMLElement>("[data-message-id]")).find((item) => item.dataset.messageId === current.id);
    if (!row) return;
    const delta = row.getBoundingClientRect().top - root.getBoundingClientRect().top - current.top;
    if (Math.abs(delta) > 0.5) root.scrollTop += delta;
  });
  return { capture, release };
}
