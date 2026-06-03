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
) => {
  if (!response.body) throw new Error("Provider did not return a stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const split = splitSseEvents(buffer);
    buffer = split.remaining;
    split.events.forEach((raw) => {
      const parsed = parseSseEvent(raw);
      if (parsed) onEvent(parsed.event, parsed.data);
    });
  }
  if (buffer.trim()) {
    const parsed = parseSseEvent(buffer);
    if (parsed) onEvent(parsed.event, parsed.data);
  }
};
