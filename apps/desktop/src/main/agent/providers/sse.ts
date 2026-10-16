import type { ProviderStreamOutcome } from "../../../shared/providerOutcome";
import { ProviderStreamError, StreamOutcomeTracker } from "./streamOutcome";
import { providerEventError } from "./requestError";

export const splitSseEvents = (buffer: string) => {
  const events: string[] = [];
  const delimiter = /\r?\n\r?\n/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = delimiter.exec(buffer))) {
    events.push(buffer.slice(cursor, match.index));
    cursor = delimiter.lastIndex;
  }
  return { events, remaining: buffer.slice(cursor) };
};

const parseSseEvent = (raw: string) => {
  const lines = raw.split(/\r?\n/);
  const dataLines: string[] = [];
  let event: string | undefined;

  lines.forEach((line) => {
    if (line.startsWith(":")) return;
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      return;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  });

  const data = dataLines.join("\n").trimEnd();
  return data && data !== "[DONE]" ? { event, data } : null;
};

export const readSse = async (
  response: Response,
  onEvent: (event: string | undefined, data: string) => void,
  onProgress?: () => void,
  onOutcome?: (outcome: ProviderStreamOutcome) => void,
  onProviderError?: (data: any, event?: string) => Error | undefined,
) => {
  if (!response.body) throw new ProviderStreamError({ status: "interrupted", reason: "missing_finish" });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const outcome = new StreamOutcomeTracker();
  const deliver = (event: string | undefined, data: string) => {
    if (onOutcome) {
      let parsed: unknown;
      try { parsed = JSON.parse(data); }
      catch { throw new ProviderStreamError({ status: "incomplete", reason: "invalid_stream_event" }); }
      outcome.observe(event, parsed);
      const failure = onProviderError?.(parsed, event) || providerEventError(parsed, event);
      if (failure) throw failure;
    }
    onEvent(event, data);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onProgress?.();
      buffer += decoder.decode(value, { stream: true });
      const split = splitSseEvents(buffer);
      buffer = split.remaining;
      split.events.forEach((raw) => {
        const parsed = parseSseEvent(raw);
        if (parsed) {
          onProgress?.();
          deliver(parsed.event, parsed.data);
        }
      });
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      onProgress?.();
      const parsed = parseSseEvent(buffer);
      if (parsed) deliver(parsed.event, parsed.data);
    }
    onOutcome?.(outcome.finish());
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
};
