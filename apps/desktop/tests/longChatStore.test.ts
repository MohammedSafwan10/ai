import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildProviderHistoryWithCompaction } from "../src/main/agent/context";
import { DesktopStore } from "../src/main/db/store";
import type { ChatMessageRecord, CompactionCheckpointRecord, ToolEventRecord } from "../src/shared/types";

let tempDir = "";
let store: DesktopStore | null = null;

const createStore = () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-long-chat-"));
  store = new DesktopStore(tempDir);
  return store;
};

afterEach(() => {
  store?.close();
  store = null;
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = "";
});

describe("long chat SQLite repository", () => {
  it("finds unfinished streamed tools after a provider assigns a real call id", () => {
    const db = createStore();
    const thread = db.createThread(null);
    const assistant = message("assistant", thread.id, 1);
    db.upsertMessage(assistant);
    db.upsertToolEvent({
      ...tool("draft-tool", thread.id, assistant.id, ""),
      callId: "call_provider_assigned",
      status: "preparing",
    });

    expect(db.listActiveDraftToolEvents(thread.id, assistant.id)).toEqual([
      expect.objectContaining({ callId: "call_provider_assigned", status: "preparing" }),
    ]);
  });

  it("scopes preparing streamed tools to their assistant turn", () => {
    const db = createStore();
    const thread = db.createThread(null);
    const first = message("assistant", thread.id, 1);
    const second = message("assistant-2", thread.id, 2);
    db.upsertMessage(first);
    db.upsertMessage(second);
    db.upsertToolEvent({ ...tool("first-draft", thread.id, first.id, ""), name: "desktop_write_file", status: "preparing" });
    db.upsertToolEvent({ ...tool("second-draft", thread.id, second.id, ""), name: "desktop_write_file", status: "preparing" });

    expect(db.listPreparingToolEvents(thread.id, second.id, "desktop_write_file")).toEqual([
      expect.objectContaining({ messageId: second.id }),
    ]);
  });


  it("keeps the bootstrap page bounded with 10,000 messages", { timeout: 120_000 }, () => {
    const db = createStore();
    const thread = db.createThread(null);
    for (let index = 0; index < 10_000; index += 1) {
      db.upsertMessage(message(`stress-${String(index).padStart(5, "0")}`, thread.id, index));
    }

    const startedAt = performance.now();
    const page = db.getThreadHistoryPage(thread.id, { limit: 60 });

    expect(page.messages).toHaveLength(60);
    expect(page.hasOlder).toBe(true);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  it("keeps a pathological 100,000-tool turn bounded", { timeout: 120_000 }, () => {
    const db = createStore();
    const thread = db.createThread(null);
    const assistant = message("assistant", thread.id, 1);
    db.upsertMessage(assistant);
    for (let index = 0; index < 100_000; index += 1) {
      db.upsertToolEvent(tool(`stress-tool-${index}`, thread.id, assistant.id, "ok"));
    }

    const startedAt = performance.now();
    const page = db.getThreadHistoryPage(thread.id, { limit: 60 });

    expect(page.toolEvents).toHaveLength(2_000);
    expect(page.toolEventsTruncated).toBe(true);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });

  it("pages backwards without duplicates when timestamps match", () => {
    const db = createStore();
    const thread = db.createThread(null);
    for (let index = 0; index < 125; index += 1) {
      db.upsertMessage(message(`m-${String(index).padStart(3, "0")}`, thread.id, 10));
    }

    const latest = db.getThreadHistoryPage(thread.id, { limit: 60 });
    const middle = db.getThreadHistoryPage(thread.id, { before: latest.beforeCursor, limit: 50 });
    const oldest = db.getThreadHistoryPage(thread.id, { before: middle.beforeCursor, limit: 50 });
    const ids = [...oldest.messages, ...middle.messages, ...latest.messages].map((item) => item.id);

    expect(latest.hasOlder).toBe(true);
    expect(middle.hasOlder).toBe(true);
    expect(oldest.hasOlder).toBe(false);
    expect(ids).toHaveLength(125);
    expect(new Set(ids).size).toBe(125);
    expect(ids[0]).toBe("m-000");
    expect(ids.at(-1)).toBe("m-124");
  });

  it("keeps large tool output outside SQLite and hydrates it on detail reads", () => {
    const db = createStore();
    const thread = db.createThread(null);
    const assistant = message("assistant", thread.id, 1);
    db.upsertMessage(assistant);
    const output = "large-output\n".repeat(8_000);
    db.upsertToolEvent(tool("tool", thread.id, assistant.id, output));

    const page = db.getThreadHistoryPage(thread.id);
    const detail = db.getToolEvent("tool");
    const sqliteBytes = fs.statSync(path.join(tempDir, "privora-desktop.sqlite")).size;

    expect(page.toolEvents[0].detailAvailable).toBe(true);
    expect(page.toolEvents[0].output?.length).toBeLessThan(output.length);
    expect(detail?.output).toBe(output);
    expect(fs.readdirSync(path.join(tempDir, "chat-artifacts")).length).toBeGreaterThan(0);
    expect(sqliteBytes).toBeLessThan(Buffer.byteLength(output) * 2);
  });

  it("keeps attachment bytes out of paginated history IPC records", () => {
    const db = createStore();
    const thread = db.createThread(null);
    const attachment = db.importAttachment({
      id: "attachment",
      name: "pixel.png",
      mimeType: "image/png",
      bytes: new Uint8Array([137, 80, 78, 71]),
      createdAt: 1,
    });
    db.upsertMessage({ ...message("with-attachment", thread.id, 1), attachments: [attachment] });

    const pageAttachment = db.getThreadHistoryPage(thread.id).messages[0].attachments?.[0];
    const providerAttachment = db.getMessage("with-attachment")?.attachments?.[0];

    expect(pageAttachment?.url).toMatch(/^privora-attachment:\/\/artifact\//);
    expect(pageAttachment?.base64).toBeUndefined();
    expect(providerAttachment?.base64).toBe(Buffer.from([137, 80, 78, 71]).toString("base64"));
  });

  it("hydrates image attachments for provider history without bloating the history page", () => {
    const db = createStore();
    const thread = db.createThread(null);
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const attachment = db.importAttachment({
      id: "attachment",
      name: "screenshot.png",
      mimeType: "image/png",
      bytes: imageBytes,
      createdAt: 1,
    });
    db.upsertMessage({ ...message("see image", thread.id, 1), role: "user", attachments: [attachment] });

    const pageAttachment = db.getThreadHistoryPage(thread.id).messages[0].attachments?.[0];
    const providerHistory = buildProviderHistoryWithCompaction(db, thread.id, "next-assistant");
    const providerImage = providerHistory[0]?.parts?.find((part) => part.type === "image");

    expect(pageAttachment?.base64).toBeUndefined();
    expect(providerImage).toMatchObject({
      type: "image",
      name: "screenshot.png",
      mimeType: "image/png",
      data: Buffer.from(imageBytes).toString("base64"),
    });
  });

  it("deletes thread records and unreferenced artifacts together", () => {
    const db = createStore();
    const thread = db.createThread(null);
    const assistant = message("assistant", thread.id, 1);
    db.upsertMessage(assistant);
    db.upsertToolEvent(tool("tool", thread.id, assistant.id, "x".repeat(80_000)));

    db.deleteThread(thread.id);

    expect(db.getThread(thread.id)).toBeNull();
    expect(db.getMessage(assistant.id)).toBeNull();
    expect(db.getToolEvent("tool")).toBeNull();
    expect(fs.readdirSync(path.join(tempDir, "chat-artifacts"))).toEqual([]);
  });

  it("restores persisted chat state after a clean restart", () => {
    const db = createStore();
    const thread = db.createThread(null);
    db.upsertMessage(message("persisted", thread.id, 1));
    db.close();

    store = new DesktopStore(tempDir);

    expect(store.getThread(thread.id)?.id).toBe(thread.id);
    expect(store.getMessage("persisted")?.content).toBe("persisted");
  });

  it("keeps hosted endpoints trusted and rejects remote CLI proxy settings", () => {
    const db = createStore();
    const settings = db.saveSettings({ appwriteEndpoint: "https://attacker.example/v1" } as never);
    expect(settings.appwriteEndpoint).toBe("https://sgp.cloud.appwrite.io/v1");
    expect(() => db.saveSettings({ cliproxyBaseUrl: "https://attacker.example" })).toThrow(/localhost/i);
  });

  it("persists compaction checkpoints without deleting visible chat history", () => {
    const db = createStore();
    const thread = db.createThread(null);
    const assistant = message("assistant", thread.id, 1);
    const user = message("user", thread.id, 0);
    db.upsertMessage(user);
    db.upsertMessage(assistant);
    const checkpoint: CompactionCheckpointRecord = {
      id: "compact-1",
      threadId: thread.id,
      assistantMessageId: assistant.id,
      compactedThroughMessageId: user.id,
      compactedThroughMessageCreatedAt: user.createdAt,
      workspaceRoot: tempDir,
      model: "gemini-3.6-flash",
      trigger: "pre_turn",
      reason: "context_limit",
      status: "completed",
      summary: "Summary",
      replacementHistory: [{ role: "user", content: "Summary", parts: [{ type: "text", text: "Summary" }] }],
      beforeTokens: 100_000,
      afterTokens: 4_000,
      createdAt: 10,
    };

    db.saveCompactionCheckpoint(checkpoint);

    expect(db.getLatestCompactionCheckpoint(thread.id)?.summary).toBe("Summary");
    expect(db.listCompactionCheckpoints(thread.id)).toHaveLength(1);
    expect(db.getThreadHistoryPage(thread.id).messages.map((item) => item.id)).toEqual(["user", "assistant"]);

    const providerHistory = buildProviderHistoryWithCompaction(db, thread.id, "next-assistant");
    expect(providerHistory.some((item) => item.content === "Summary")).toBe(true);
    expect(providerHistory.some((item) => item.content === "assistant")).toBe(true);
    expect(providerHistory.filter((item) => item.content === "user")).toHaveLength(0);
  });

  it("drops stale compaction checkpoints when a thread is pruned", () => {
    const db = createStore();
    const thread = db.createThread(null);
    const user = message("user", thread.id, 0);
    const assistant = message("assistant", thread.id, 1);
    db.upsertMessage(user);
    db.upsertMessage(assistant);
    db.saveCompactionCheckpoint({
      id: "compact-1",
      threadId: thread.id,
      assistantMessageId: assistant.id,
      compactedThroughMessageId: user.id,
      compactedThroughMessageCreatedAt: user.createdAt,
      workspaceRoot: tempDir,
      model: "gemini-3.6-flash",
      trigger: "pre_turn",
      reason: "context_limit",
      status: "completed",
      summary: "Stale summary",
      replacementHistory: [{ role: "user", content: "Stale summary", parts: [{ type: "text", text: "Stale summary" }] }],
      beforeTokens: 100_000,
      afterTokens: 4_000,
      createdAt: 10,
    });

    db.pruneThreadAfterMessage(thread.id, user.id);

    expect(db.getLatestCompactionCheckpoint(thread.id)).toBeNull();
    expect(buildProviderHistoryWithCompaction(db, thread.id, "next-assistant").some((item) => item.content === "Stale summary")).toBe(false);
  });

  it("deletes tool events and undo records when their messages are pruned", () => {
    const db = createStore();
    const thread = db.createThread(null);
    const user = message("user", thread.id, 0);
    const assistant = message("assistant", thread.id, 1);
    db.upsertMessage(user);
    db.upsertMessage(assistant);
    db.upsertToolEvent(tool("tool", thread.id, assistant.id, "private output"));
    db.upsertTurnUndo({
      id: "undo",
      threadId: thread.id,
      messageId: assistant.id,
      workspaceId: null,
      status: "available",
      operations: [],
      summary: { files: 0, additions: 0, deletions: 0, paths: [] },
      conflicts: [],
      createdAt: 2,
      updatedAt: 2,
    });

    db.pruneThreadAfterMessage(thread.id, user.id);

    expect(db.getToolEvent("tool")).toBeNull();
    expect(db.getTurnUndo(assistant.id)).toBeNull();
  });

  it("ignores malformed compaction replacement history", () => {
    const db = createStore();
    const thread = db.createThread(null);
    db.upsertMessage(message("visible", thread.id, 0));
    db.saveCompactionCheckpoint({
      id: "compact-1",
      threadId: thread.id,
      workspaceRoot: tempDir,
      model: "gemini-3.6-flash",
      trigger: "pre_turn",
      reason: "context_limit",
      status: "completed",
      summary: "Malformed summary",
      replacementHistory: [{ role: "user", content: "bad checkpoint", parts: [{ type: "bogus" }] }],
      beforeTokens: 100_000,
      afterTokens: 4_000,
      createdAt: 10,
    } as CompactionCheckpointRecord);

    const providerHistory = buildProviderHistoryWithCompaction(db, thread.id, "next-assistant");

    expect(providerHistory.some((item) => item.content === "bad checkpoint")).toBe(false);
    expect(providerHistory.some((item) => item.content === "visible")).toBe(true);
  });

});

const message = (id: string, threadId: string, createdAt: number): ChatMessageRecord => ({
  id,
  threadId,
  role: id === "assistant" ? "assistant" : "user",
  content: id,
  status: "completed",
  createdAt,
  updatedAt: createdAt,
});

const tool = (id: string, threadId: string, messageId: string, output: string): ToolEventRecord => ({
  id,
  threadId,
  messageId,
  callId: `${id}-call`,
  name: "exec_command",
  title: "Run command",
  status: "done",
  risk: "safe",
  args: {},
  output,
  createdAt: 2,
  updatedAt: 2,
});
