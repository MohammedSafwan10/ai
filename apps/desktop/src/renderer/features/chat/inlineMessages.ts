import type { ChatMessageRecord, ToolEventRecord } from "../../../shared/types";

/** Keep coordination at its captured stream position, with a fallback for older records. */
export function groupInlineMessages(messages: ChatMessageRecord[], tools: ToolEventRecord[] = []) {
  const available = new Map(messages.map((message) => [message.id, message]));
  const inlineByTurn = new Map<string, ChatMessageRecord[]>();
  const roots: ChatMessageRecord[] = [];
  for (const message of messages) {
    let anchor = message.steeredTurnId ? available.get(message.steeredTurnId) : undefined;
    if (!anchor && !message.steeredTurnId && message.agentMessage) {
      anchor = messages.filter((candidate) => candidate.threadId === message.threadId && candidate.role === "assistant" && !candidate.agentMessage && candidate.createdAt <= message.createdAt && (candidate.status === "running" || candidate.updatedAt >= message.createdAt))
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (anchor && messages.some((candidate) => candidate.role === "user" && !candidate.agentMessage && !candidate.steeredTurnId && candidate.threadId === message.threadId && candidate.createdAt > anchor!.createdAt && candidate.createdAt < message.createdAt)) anchor = undefined;
    }
    if (!anchor || anchor.threadId !== message.threadId || anchor.role !== "assistant" || anchor.agentMessage) { roots.push(message); continue; }
    const nearbyTool = tools.filter((tool) => tool.threadId === message.threadId && tool.messageId === anchor!.id && tool.createdAt <= message.createdAt).sort((a, b) => b.createdAt - a.createdAt)[0];
    const inline = message.steeredTurnId ? message : { ...message, steeredTurnId: anchor.id, steerTextOffset: nearbyTool?.textOffset ?? anchor.content.length };
    const items = inlineByTurn.get(anchor.id) ?? [];
    items.push(inline);
    inlineByTurn.set(anchor.id, items);
  }
  return { roots, inlineByTurn };
}
