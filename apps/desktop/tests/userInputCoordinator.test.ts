import { describe, expect, it, vi } from "vitest";
import { UserInputCoordinator } from "../src/main/agent/harness/userInputCoordinator";
import type { AgentRunTracker } from "../src/main/agent/runState";
import type { PrivoraEventPayload } from "../src/shared/types";

describe("UserInputCoordinator", () => {
  it("owns request, answer, and pending-thread lifecycle", async () => {
    const events: PrivoraEventPayload[] = [];
    const coordinator = new UserInputCoordinator({
      emitRun: vi.fn(),
      emitEvent: (event) => events.push(event),
      persistPending: vi.fn(),
      persistResolved: vi.fn(),
    });
    const run = tracker();
    const pending = coordinator.request({
      call: {
        id: "question-1",
        name: "request_user_input",
        arguments: {
          questions: [{
            id: "choice",
            header: "Choice",
            question: "Pick one",
            options: [
              { label: "A", description: "First" },
              { label: "B", description: "Second" },
            ],
          }],
        },
      },
      controller: run.controller,
      run,
      threadId: run.threadId,
      messageId: run.assistantMessageId,
      isPlanMode: true,
    });

    expect(coordinator.hasThread(run.threadId)).toBe(true);
    expect(run.phase).toBe("waiting_tool");
    coordinator.answer({
      threadId: run.threadId,
      callId: "question-1",
      answers: { choice: { answers: ["A"] } },
    });

    await expect(pending).resolves.toMatchObject({ success: true });
    expect(coordinator.hasThread(run.threadId)).toBe(false);
    expect(events.map((event) => event.type)).toEqual(["user_input.requested", "user_input.resolved"]);
  });

  it("cancels pending questions when the parent thread stops", async () => {
    const coordinator = new UserInputCoordinator({
      emitRun: vi.fn(),
      emitEvent: vi.fn(),
      persistPending: vi.fn(),
      persistResolved: vi.fn(),
    });
    const run = tracker();
    const pending = coordinator.request({
      call: {
        id: "question-1",
        name: "request_user_input",
        arguments: {
          questions: [{
            id: "choice",
            header: "Choice",
            question: "Pick one",
            options: [
              { label: "A", description: "First" },
              { label: "B", description: "Second" },
            ],
          }],
        },
      },
      controller: run.controller,
      run,
      threadId: run.threadId,
      messageId: run.assistantMessageId,
      isPlanMode: true,
    });

    coordinator.cancelThread(run.threadId);

    await expect(pending).resolves.toMatchObject({ success: false, data: { interrupted: true } });
    expect(coordinator.hasThread(run.threadId)).toBe(false);
  });
});

const tracker = (): AgentRunTracker => ({
  threadId: "thread-1",
  assistantMessageId: "assistant-1",
  controller: new AbortController(),
  phase: "sampling",
  startedAt: 1,
  updatedAt: 1,
  iteration: 0,
  toolCount: 0,
  lastProgressAt: 1,
  recoveryAttempts: 0,
});
