import { describe, expect, it, vi } from "vitest";
import { beginPromptSubmission, promptSubmissionError } from "../src/renderer/features/chat/promptSubmission";

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

describe("prompt submission ownership", () => {
  it("retains the actionable send failure while removing Electron transport wording", () => {
    expect(promptSubmissionError(new Error("Error invoking remote method 'desktop:startTurn': Error: Workspace folder is missing: D:\\old. Restore the folder."))).toBe("Workspace folder is missing: D:\\old. Restore the folder.");
    expect(promptSubmissionError(null)).toContain("Could not send");
  });
  it("prevents a queued send from racing a direct send before running is observed", async () => {
    const pending = new Set<string>();
    const first = deferred();
    const send = vi.fn(() => first.promise);
    const started = beginPromptSubmission(pending, "chat-a", send)!;
    expect(beginPromptSubmission(pending, "chat-a", send)).toBeNull();
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);
    first.resolve();
    await started;
    expect(pending.has("chat-a")).toBe(false);
    await beginPromptSubmission(pending, "chat-a", send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("preserves each chat's in-flight lock when switching away and back", async () => {
    const pending = new Set<string>();
    const a = deferred();
    const b = deferred();
    const sendA = beginPromptSubmission(pending, "chat-a", () => a.promise)!;
    const sendB = beginPromptSubmission(pending, "chat-b", () => b.promise)!;
    expect(beginPromptSubmission(pending, "chat-a", () => Promise.resolve())).toBeNull();
    a.resolve();
    await sendA;
    expect(pending.has("chat-b")).toBe(true);
    expect(beginPromptSubmission(pending, "chat-b", () => Promise.resolve())).toBeNull();
    b.resolve();
    await sendB;
    expect(pending.size).toBe(0);
  });

  it("releases rejected and synchronously throwing submissions so manual retry works", async () => {
    const pending = new Set<string>();
    const first = deferred();
    const submission = beginPromptSubmission(pending, "chat-a", () => first.promise)!;
    first.reject(new Error("Unavailable"));
    await expect(submission).rejects.toThrow("Unavailable");
    await expect(beginPromptSubmission(pending, "chat-a", () => { throw new Error("Invalid model"); })!).rejects.toThrow("Invalid model");
    await beginPromptSubmission(pending, "chat-a", () => Promise.resolve());
    expect(pending.size).toBe(0);
  });
});
