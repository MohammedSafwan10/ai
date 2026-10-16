import { useEffect, useId, useRef, useState } from "react";
import { projectMarkdown, type MarkdownProjection } from "./markdownProjection";
import { markdownWorker, type MarkdownWorkerClient } from "./markdownWorkerClient";

const UPDATE_MS = 80;
export function useStreamingMarkdown(text: string, active: boolean) {
  const key = useId();
  const [initial] = useState(() => projectMarkdown(undefined, text, active));
  const [blocks, setBlocks] = useState(initial.blocks);
  const fallback = useRef<MarkdownProjection | undefined>(initial);
  const initialInput = useRef({ text, active });
  const client = useRef<MarkdownWorkerClient | undefined>(undefined);
  const latest = useRef({ text, active });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFlush = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
      client.current?.dispose(key);
    };
  }, [key]);
  useEffect(() => {
    latest.current = { text, active };
    if (!active && !initialInput.current.active && text === initialInput.current.text) return;
    const flush = () => {
      timer.current = null;
      lastFlush.current = Date.now();
      const current = latest.current;
      const receive = (value: typeof blocks | null) => {
        if (!alive.current || !latest.current.text.startsWith(current.text) || latest.current.active !== current.active) return;
        if (value) {
          setBlocks(value);
          if (!current.active) client.current?.dispose(key);
          return;
        }
        fallback.current = projectMarkdown(fallback.current, current.text, current.active);
        setBlocks(fallback.current.blocks);
      };
      try { (client.current ??= markdownWorker()).update(key, current.text, current.active, receive); }
      catch { receive(null); }
    };
    const elapsed = Date.now() - lastFlush.current;
    if (!active || elapsed >= UPDATE_MS) {
      if (timer.current !== null) clearTimeout(timer.current);
      flush();
    } else if (timer.current === null) timer.current = setTimeout(flush, UPDATE_MS - elapsed);
  }, [active, key, text]);
  return blocks;
}
