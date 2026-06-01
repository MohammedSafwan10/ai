import { normalizeThreadTitle } from "../../db/store";
import type {
  AssistantTextPartRecord,
  AssistantTextPhase,
  ChatMessageRecord,
} from "../../../shared/types";

const REPEAT_FINGERPRINT_MIN_CHARS = 72;
const RECENT_VISIBLE_TEXT_CHARS = 5000;
const now = () => Date.now();

export const buildVisibleFingerprints = (text: string) => {
  const fingerprints = new Set<string>();
  splitVisibleUnits(text).forEach((unit) => {
    const fingerprint = fingerprintVisibleText(unit);
    if (fingerprint.length >= REPEAT_FINGERPRINT_MIN_CHARS) fingerprints.add(fingerprint);
  });
  return fingerprints;
};

export const recordAssistantTextPart = (
  message: ChatMessageRecord,
  phase: AssistantTextPhase,
  startOffset: number,
  endOffset: number,
) => {
  if (endOffset <= startOffset) return;
  const timestamp = now();
  const parts = normalizeAssistantTextParts(message.textParts || [], endOffset);
  const last = parts[parts.length - 1];
  if (last && last.phase === phase && last.endOffset === startOffset) {
    last.endOffset = endOffset;
    last.updatedAt = timestamp;
    message.textParts = parts;
    return;
  }
  message.textParts = [
    ...parts,
    {
      id: crypto.randomUUID(),
      phase,
      startOffset,
      endOffset,
      streamOrder: nextTextPartOrder(parts),
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
};

export const markAssistantTextRangePhase = (
  message: ChatMessageRecord,
  startOffset: number,
  endOffset: number,
  phase: AssistantTextPhase,
) => {
  if (endOffset <= startOffset) return;
  const timestamp = now();
  const parts = normalizeAssistantTextParts(message.textParts || [], endOffset);
  const next: AssistantTextPartRecord[] = [];
  let coveredUntil = startOffset;
  parts.forEach((part) => {
    if (part.endOffset <= startOffset || part.startOffset >= endOffset) {
      next.push(part);
      return;
    }
    if (part.startOffset < startOffset) {
      next.push({ ...part, endOffset: startOffset, updatedAt: timestamp });
    }
    const phaseStart = Math.max(part.startOffset, startOffset);
    const phaseEnd = Math.min(part.endOffset, endOffset);
    if (phaseStart > coveredUntil) {
      next.push({
        id: crypto.randomUUID(),
        phase,
        startOffset: coveredUntil,
        endOffset: phaseStart,
        streamOrder: nextTextPartOrder(next),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    next.push({
      ...part,
      id: part.startOffset < startOffset || part.endOffset > endOffset ? crypto.randomUUID() : part.id,
      phase,
      startOffset: phaseStart,
      endOffset: phaseEnd,
      updatedAt: timestamp,
    });
    coveredUntil = Math.max(coveredUntil, phaseEnd);
    if (part.endOffset > endOffset) {
      next.push({ ...part, id: crypto.randomUUID(), startOffset: endOffset, updatedAt: timestamp });
    }
  });
  if (coveredUntil < endOffset) {
    next.push({
      id: crypto.randomUUID(),
      phase,
      startOffset: coveredUntil,
      endOffset,
      streamOrder: nextTextPartOrder(next),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  message.textParts = mergeAdjacentTextParts(next);
};

const normalizeAssistantTextParts = (parts: AssistantTextPartRecord[], contentLength: number) =>
  mergeAdjacentTextParts(
    parts
      .filter((part) =>
        (part.phase === "commentary" || part.phase === "final_answer") &&
        Number.isFinite(part.startOffset) &&
        Number.isFinite(part.endOffset)
      )
      .map((part) => ({
        ...part,
        startOffset: Math.max(0, Math.min(contentLength, part.startOffset)),
        endOffset: Math.max(0, Math.min(contentLength, part.endOffset)),
      }))
      .filter((part) => part.endOffset > part.startOffset)
      .sort((a, b) => a.startOffset - b.startOffset || a.createdAt - b.createdAt),
  );

const mergeAdjacentTextParts = (parts: AssistantTextPartRecord[]) => {
  const merged: AssistantTextPartRecord[] = [];
  parts.forEach((part) => {
    const last = merged[merged.length - 1];
    if (last && last.phase === part.phase && last.endOffset >= part.startOffset) {
      last.endOffset = Math.max(last.endOffset, part.endOffset);
      last.updatedAt = Math.max(last.updatedAt, part.updatedAt);
      return;
    }
    merged.push({ ...part });
  });
  return merged;
};

const nextTextPartOrder = (parts: AssistantTextPartRecord[]) =>
  Math.max(0, ...parts.map((part) => part.streamOrder ?? 0)) + 1;

interface ThreadTitleFilterState {
  enabled: boolean;
  done: boolean;
  mode: "normal" | "title";
  buffer: string;
  titleBuffer: string;
}

const THREAD_TITLE_OPEN = "<thread_title>";
const THREAD_TITLE_CLOSE = "</thread_title>";
const MAX_THREAD_TITLE_TAG_CONTENT = 240;

export const createThreadTitleFilterState = (enabled: boolean): ThreadTitleFilterState => ({
  enabled,
  done: !enabled,
  mode: "normal",
  buffer: "",
  titleBuffer: "",
});

export const filterThreadTitleDelta = (
  delta: string,
  state: ThreadTitleFilterState,
  onTitle: (title: string) => void,
) => {
  if (!delta || state.done) return delta;
  state.buffer += delta;
  let visible = "";

  while (state.buffer) {
    if (state.mode === "title") {
      const closeIndex = state.buffer.indexOf(THREAD_TITLE_CLOSE);
      if (closeIndex === -1) {
        state.titleBuffer += state.buffer;
        state.buffer = "";
        if (state.titleBuffer.length > MAX_THREAD_TITLE_TAG_CONTENT) {
          state.done = true;
          state.mode = "normal";
          state.titleBuffer = "";
        }
        break;
      }

      state.titleBuffer += state.buffer.slice(0, closeIndex);
      const title = normalizeThreadTitle(state.titleBuffer);
      if (title) onTitle(title);
      state.done = true;
      state.mode = "normal";
      state.titleBuffer = "";
      visible += state.buffer.slice(closeIndex + THREAD_TITLE_CLOSE.length);
      state.buffer = "";
      break;
    }

    const openIndex = state.buffer.indexOf(THREAD_TITLE_OPEN);
    if (openIndex !== -1) {
      visible += state.buffer.slice(0, openIndex);
      state.buffer = state.buffer.slice(openIndex + THREAD_TITLE_OPEN.length);
      state.mode = "title";
      continue;
    }

    const keep = partialTagPrefixLength(state.buffer, THREAD_TITLE_OPEN);
    visible += state.buffer.slice(0, state.buffer.length - keep);
    state.buffer = state.buffer.slice(state.buffer.length - keep);
    break;
  }

  return visible;
};

const partialTagPrefixLength = (value: string, tag: string) => {
  const max = Math.min(value.length, tag.length - 1);
  for (let length = max; length > 0; length -= 1) {
    if (tag.startsWith(value.slice(value.length - length))) return length;
  }
  return 0;
};

export const fallbackThreadTitle = (prompt: string) =>
  normalizeThreadTitle(prompt
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " "));

export const filterVisibleDelta = (current: string, delta: string, fingerprints: Set<string>) => {
  if (!delta || isInsideMarkdownCodeFence(current)) return delta;
  const recent = fingerprintVisibleText(current.slice(-RECENT_VISIBLE_TEXT_CHARS));
  const accepted: string[] = [];
  splitVisibleUnits(delta).forEach((unit) => {
    const fingerprint = fingerprintVisibleText(unit);
    if (
      fingerprint.length >= REPEAT_FINGERPRINT_MIN_CHARS &&
      (fingerprints.has(fingerprint) || recent.includes(fingerprint))
    ) {
      return;
    }
    if (fingerprint.length >= REPEAT_FINGERPRINT_MIN_CHARS) fingerprints.add(fingerprint);
    accepted.push(unit);
  });
  return accepted.join("");
};

const splitVisibleUnits = (text: string) =>
  text.match(/[^.!?\n]+[.!?\n]+|\n+|[^.!?\n]+$/g) || [text];

const fingerprintVisibleText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[`*_#[\](){}<>.,!?;:'"\\/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isInsideMarkdownCodeFence = (text: string) =>
  ((text.match(/```/g) || []).length % 2) === 1;
