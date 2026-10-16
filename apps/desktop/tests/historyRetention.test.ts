import { describe, expect, it } from "vitest";
import { retainRecentHistory, HISTORY_MESSAGE_LIMIT, HISTORY_TEXT_LIMIT } from "../src/renderer/state/historyRetention";
import { retainAgentTranscript } from "../src/renderer/features/chat/SubagentsPanel";
import { retainRecentSnapshot } from "../src/renderer/state/useDesktopState";
import { encodeHistoryCursor } from "../src/shared/historyCursor";
import type { ChatMessageRecord, ThreadHistoryPage, ToolEventRecord } from "../src/shared/types";

const message = (index: number): ChatMessageRecord => ({ id: `m${index}`, threadId: "thread", role: index % 2 ? "assistant" : "user", status: "completed", content: `Message ${index}`, createdAt: index, updatedAt: index });
const page = (count: number): ThreadHistoryPage => ({ threadId: "thread", messages: Array.from({ length: count }, (_, index) => message(index)), toolEvents: [], turnUndos: [], hasOlder: false });
const tool = (index: number): ToolEventRecord => ({ id: `t${index}`, threadId: "thread", messageId: `m${index}`, callId: `c${index}`, name: "exec_command", title: "Command", args: {}, status: "done", risk: "safe", output: "done", createdAt: index, updatedAt: index });

describe("renderer history retention", () => {
  it("keeps a reloadable recent window and releases dependent tool and undo records", () => {
    const original = page(2000);
    original.toolEvents = original.messages.map((_, index) => tool(index));
    original.turnUndos = [{ messageId: "m0" }, { messageId: "m1999" }] as ThreadHistoryPage["turnUndos"];
    const retained = retainRecentHistory(original);
    expect(retained.messages).toHaveLength(HISTORY_MESSAGE_LIMIT);
    expect(retained.messages[0].id).toBe("m1700");
    expect(retained.toolEvents).toHaveLength(HISTORY_MESSAGE_LIMIT);
    expect(retained.turnUndos.map((undo) => undo.messageId)).toEqual(["m1999"]);
    expect(retained.hasOlder).toBe(true);
    expect(JSON.parse(Buffer.from(retained.beforeCursor!, "base64url").toString())).toEqual({ id: "m1700", createdAt: 1700 });
    expect(original.messages).toHaveLength(2000);
  });
  it("uses text budgets while preserving a single oversized message", () => {
    const original = page(8);
    original.messages = original.messages.map((item) => ({ ...item, content: "a".repeat(HISTORY_TEXT_LIMIT / 2 - 100) }));
    expect(retainRecentHistory(original).messages.map((item) => item.id)).toEqual(["m6", "m7"]);
    const oversized = page(1); oversized.messages[0].content = "a".repeat(HISTORY_TEXT_LIMIT + 1);
    expect(retainRecentHistory(oversized)).toBe(oversized);
  });
  it("protects active turns, approval targets and inline message anchors", () => {
    const original = page(600);
    original.messages[10].status = "awaiting_approval";
    expect(retainRecentHistory(original).messages.some((item) => item.id === "m10")).toBe(true);
    original.messages[10].status = "completed";
    expect(retainRecentHistory(original, ["m20"]).messages.some((item) => item.id === "m20")).toBe(true);
    original.messages[590].steeredTurnId = "m31";
    expect(retainRecentHistory(original).messages.some((item) => item.id === "m31")).toBe(true);
  });
  it("does not allocate a new page when no eviction is needed", () => {
    const original = page(30);
    expect(retainRecentHistory(original)).toBe(original);
  });
  it("includes large arguments, result payloads and structured diffs in the retained text budget", () => {
    const original = page(100);
    original.toolEvents = original.messages.map((_, index) => ({ ...tool(index), args: { content: "x".repeat(100_000) },
      result: { success: true, output: "y".repeat(100_000) }, diffFiles: [{ path: "example.ts", status: "created", additions: 1, deletions: 0,
        hunks: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: [{ kind: "add", text: "z".repeat(100_000) }] }] }] }));
    const recent = retainRecentHistory(original);
    expect(recent.messages.length).toBeLessThan(20);
    expect(recent.toolEvents).toHaveLength(recent.messages.length);
    expect(recent.messages.at(-1)?.id).toBe("m99");
  });
  it("bounds a sustained stream of completed messages in both main and subagent transcripts", () => {
    let recent = page(0);
    for (let index = 0; index < 3000; index++) recent = retainRecentHistory({ ...recent, messages: [...recent.messages, message(index)] });
    expect(recent.messages.length).toBeLessThanOrEqual(HISTORY_MESSAGE_LIMIT + 1);
    expect(recent.messages.at(-1)?.id).toBe("m2999");
    const agent = retainAgentTranscript({ page: page(900), sequence: 12, run: null });
    expect(agent.page.messages.length).toBeLessThanOrEqual(HISTORY_MESSAGE_LIMIT + 1);
    const snapshot = { activeThreadId: "thread", messages: page(900).messages, toolEvents: [], turnUndos: [], activeRun: null, pendingUserInput: null } as unknown as Parameters<typeof retainRecentSnapshot>[0];
    expect(retainRecentSnapshot(snapshot).historyPage?.hasOlder).toBe(true);
  });
  it("matches SQLite's UTF-8 cursor format, including non-ASCII IDs", () => {
    const anchor = { id: "chat-✓-日本", createdAt: 12 };
    expect(encodeHistoryCursor(anchor)).toBe(Buffer.from(JSON.stringify(anchor)).toString("base64url"));
  });
});
