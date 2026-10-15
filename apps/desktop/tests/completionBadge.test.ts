import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { DesktopStore } from "../src/main/db/store";
import { completionBadgeBitmap } from "../src/main/notifications/completionBadge";

let root: string; let store: DesktopStore;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "privora-unread-")); store = new DesktopStore(root); });
afterEach(() => { store.close(); fs.rmSync(root, { recursive: true, force: true }); });
const complete = (threadId: string, id: string, at = 1) => {
  store.upsertMessage({ id, threadId, role: "assistant", content: "Done", status: "completed", createdAt: at, updatedAt: at });
  return store.recordChatCompletion(threadId, id);
};

it("counts chats once, deduplicates delivery, and ignores hidden subagents", () => {
  const first = store.createThread(null); const second = store.createThread(null); const child = store.createThread(null, { hidden: true });
  expect(complete(first.id, "one")).toBe(true);
  expect(store.recordChatCompletion(first.id, "one")).toBe(false);
  complete(first.id, "two", 2); complete(second.id, "three"); complete(child.id, "hidden");
  expect(store.unreadCompletionCount()).toBe(2);
  expect(store.getThread(first.id)?.unreadCompletionId).toBe("two");
});

it("acks only the exact completion and cannot clear a newer result", () => {
  const thread = store.createThread(null); complete(thread.id, "one"); complete(thread.id, "two", 2);
  expect(store.markChatCompletionRead(thread.id, "one")).toBe(false);
  expect(store.unreadCompletionCount()).toBe(1);
  expect(store.markChatCompletionRead(thread.id, "two")).toBe(true);
  expect(store.unreadCompletionCount()).toBe(0);
  expect(store.recordChatCompletion(thread.id, "two")).toBe(false);
  expect(store.recordChatCompletion(thread.id, "one")).toBe(false);
  expect(store.listMessages(thread.id)).toHaveLength(2);
});

it("persists unread results across restarts and removes deleted chats from the count", () => {
  const thread = store.createThread(null); complete(thread.id, "saved");
  store.close(); store = new DesktopStore(root);
  expect(store.unreadCompletionCount()).toBe(1);
  store.deleteThread(thread.id);
  expect(store.unreadCompletionCount()).toBe(0);
});

it("does not mark failed, stopped, or user messages as completed", () => {
  const thread = store.createThread(null);
  for (const status of ["failed", "stopped", "running"] as const) {
    store.upsertMessage({ id: status, threadId: thread.id, role: "assistant", content: status, status, createdAt: 1, updatedAt: 1 });
    expect(store.recordChatCompletion(thread.id, status)).toBe(false);
  }
  store.upsertMessage({ id: "user", threadId: thread.id, role: "user", content: "Hello", status: "completed", createdAt: 1, updatedAt: 1 });
  expect(store.recordChatCompletion(thread.id, "user")).toBe(false);
  expect(store.unreadCompletionCount()).toBe(0);
});

it("renders a bounded native bitmap with a transparent exterior and 9+ overflow", () => {
  for (const count of [1, 2, 9, 10, 1000]) {
    const badge = completionBadgeBitmap(count);
    expect(badge.pixels.length).toBe(32 * 32 * 4);
    expect(badge.pixels[3]).toBe(0);
    expect(badge.pixels.some((value) => value > 0)).toBe(true);
    expect(badge.label).toBe(count > 9 ? "9+" : String(count));
  }
});
