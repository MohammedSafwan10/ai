import type { ChatMessageRecord, ThreadHistoryPage } from "../../shared/types";
import { encodeHistoryCursor } from "../../shared/historyCursor";
import { isActiveTurnStatus } from "../../shared/runStatus";

export const HISTORY_MESSAGE_LIMIT = 300;
export const HISTORY_TEXT_LIMIT = 4_000_000;
export const HISTORY_TOOL_LIMIT = 2000;

const footprintCache = new WeakMap<object, number>();
/** Records are immutable renderer snapshots; weak keys do not keep evicted records alive. */
function retainedText(value: unknown, ancestors = new Set<object>()): number {
  if (typeof value === "string") return value.length;
  if (!value || typeof value !== "object" || ancestors.has(value)) return 0;
  const cached = footprintCache.get(value);
  if (cached !== undefined) return cached;
  ancestors.add(value);
  let total = 0;
  for (const item of Object.values(value)) total += retainedText(item, ancestors);
  ancestors.delete(value);
  footprintCache.set(value, total);
  return total;
}

/** A soft UI budget, never a deletion policy. Active turns and their inline messages stay together. */
export function retainRecentHistory(page: ThreadHistoryPage, protectedIds: string[] = []): ThreadHistoryPage {
  if (page.messages.length < 2) return page;
  const costs = new Map<string, { text: number; tools: number }>();
  for (const tool of page.toolEvents) {
    const cost = costs.get(tool.messageId) || { text: 0, tools: 0 };
    cost.text += retainedText(tool);
    cost.tools++;
    costs.set(tool.messageId, cost);
  }
  for (const undo of page.turnUndos) {
    const cost = costs.get(undo.messageId) || { text: 0, tools: 0 };
    cost.text += retainedText(undo); costs.set(undo.messageId, cost);
  }
  let start = page.messages.length - 1;
  let text = 0;
  let tools = 0;
  for (let index = page.messages.length - 1; index >= 0; index--) {
    const message = page.messages[index];
    const cost = costs.get(message.id);
    const nextText = text + retainedText(message) + (cost?.text || 0);
    const nextTools = tools + (cost?.tools || 0);
    if (index < page.messages.length - 1 && (page.messages.length - index > HISTORY_MESSAGE_LIMIT || nextText > HISTORY_TEXT_LIMIT || nextTools > HISTORY_TOOL_LIMIT)) break;
    start = index; text = nextText; tools = nextTools;
  }
  const protectedSet = new Set(protectedIds);
  page.messages.forEach((message, index) => { if (protectedSet.has(message.id) || isActiveTurnStatus(message.status)) start = Math.min(start, index); });
  // An inline steer must not outlive its assistant anchor when the window moves.
  const indexes = new Map(page.messages.map((message, index) => [message.id, index]));
  for (let index = page.messages.length - 1; index >= start; index--) {
    const anchor = page.messages[index].steeredTurnId;
    if (anchor && indexes.has(anchor)) start = Math.min(start, indexes.get(anchor)!);
  }
  // Include the prompt belonging to the oldest retained answer.
  if (page.messages[start]?.role === "assistant") {
    const previous = page.messages[start - 1];
    if (previous?.role === "user" && !previous.agentMessage && !previous.steeredTurnId) start--;
  }
  if (start === 0) return page;
  const messages: ChatMessageRecord[] = page.messages.slice(start);
  const ids = new Set(messages.map((message) => message.id));
  return { ...page, messages, toolEvents: page.toolEvents.filter((tool) => ids.has(tool.messageId)),
    turnUndos: page.turnUndos.filter((undo) => ids.has(undo.messageId)), hasOlder: true, beforeCursor: encodeHistoryCursor(messages[0]) };
}
