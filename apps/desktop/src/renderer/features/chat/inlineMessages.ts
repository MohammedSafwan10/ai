import type { ChatMessageRecord, ToolEventRecord } from "../../../shared/types";

/** Keep coordination at its captured stream position, with a fallback for older records. */
export function groupInlineMessages(messages: ChatMessageRecord[], tools: ToolEventRecord[] = []) {
  const available = new Map(messages.map((message) => [message.id, message]));
  const inlineByTurn = new Map<string, ChatMessageRecord[]>();
  const roots: ChatMessageRecord[] = [];
  for (const message of messages) {
    let anchor = message.steeredTurnId ? available.get(message.steeredTurnId) : undefined;
    if (!anchor && !message.steeredTurnId && message.agentMessage) {
      anchor = messages.filter((candidate) => candidate.threadId === message.threadId && candidate.role === "assistant" && !candidate.agentMessage && candidate.createdAt <= message.createdAt)
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      // Equal timestamps cannot establish that coordination arrived during this
      // turn; it may be the queued prompt which started the assistant itself.
      if (anchor && (anchor.createdAt >= message.createdAt || (anchor.status !== "running" && anchor.updatedAt < message.createdAt))) anchor = undefined;
      if (anchor && messages.some((candidate) => candidate.role === "user" && !candidate.agentMessage && !candidate.steeredTurnId && candidate.threadId === message.threadId && candidate.createdAt > anchor!.createdAt && candidate.createdAt <= message.createdAt)) anchor = undefined;
    }
    if (!anchor || anchor.threadId !== message.threadId || anchor.role !== "assistant" || anchor.agentMessage) { roots.push(message); continue; }
    const nearbyTool = tools.filter((tool) => tool.threadId === message.threadId && tool.messageId === anchor!.id && tool.createdAt < message.createdAt && Number.isFinite(tool.textOffset) && tool.textOffset! >= 0).sort((a, b) => b.createdAt - a.createdAt)[0];
    // A current text length is not a historical position: it moves on every
    // streamed update and can push all text ahead of earlier tools/thoughts.
    if (!message.steeredTurnId && !nearbyTool) { roots.push(message); continue; }
    const inline = message.steeredTurnId ? message : { ...message, steeredTurnId: anchor.id, steerTextOffset: nearbyTool!.textOffset };
    const items = inlineByTurn.get(anchor.id) ?? [];
    items.push(inline);
    inlineByTurn.set(anchor.id, items);
  }
  // Older child starts could share a millisecond with their incoming prompt.
  // UUID lexical order must not put the response before that user message.
  roots.sort((a, b) => a.createdAt - b.createdAt || Number(a.role !== "user") - Number(b.role !== "user") || a.id.localeCompare(b.id));
  return { roots, inlineByTurn };
}
