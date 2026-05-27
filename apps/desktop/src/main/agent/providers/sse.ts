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
      const lines = raw.split("\n");
      const event = lines.find((line) => line.startsWith("event:"))?.slice("event:".length).trim();
      lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trim())
        .forEach((data) => {
          if (data && data !== "[DONE]") onEvent(event, data);
        });
    });
  }
  if (buffer.trim()) {
    const lines = buffer.split("\n");
    const event = lines.find((line) => line.startsWith("event:"))?.slice("event:".length).trim();
    lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .forEach((data) => {
        if (data && data !== "[DONE]") onEvent(event, data);
      });
  }
};
