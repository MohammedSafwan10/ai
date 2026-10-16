import { projectMarkdown, type MarkdownProjection } from "./markdownProjection";
import type { MarkdownRequest, MarkdownResponse } from "./markdownWorkerClient";

const projections = new Map<string, MarkdownProjection>();
self.onmessage = (event: MessageEvent<MarkdownRequest>) => {
  const request = event.data;
  if (request.type === "dispose") { projections.delete(request.key); return; }
  try {
    const projection = projectMarkdown(projections.get(request.key), request.text, request.active);
    projections.set(request.key, projection);
    // The client already owns the source; only send rendered blocks back.
    self.postMessage({ key: request.key, generation: request.generation, blocks: projection.blocks } satisfies MarkdownResponse);
  } catch {
    self.postMessage({ key: request.key, generation: request.generation, failed: true } satisfies MarkdownResponse);
  }
};
