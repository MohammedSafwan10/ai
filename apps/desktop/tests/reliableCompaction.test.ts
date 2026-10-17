import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { isPackaged: false, getPath: () => os.tmpdir() }, safeStorage: { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => "keychain", encryptString: (text: string) => Buffer.from(text), decryptString: (bytes: Buffer) => bytes.toString() } }));
const gemini = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { interactions = { create: gemini.create }; } }));
import { DesktopStore } from "../src/main/db/store";
import { buildProviderHistoryWithCompaction, messagesToProviderHistory, refreshCompactionObservations, sanitizeProviderHistoryForModel } from "../src/main/agent/context";
import { buildPreservedState, emptyHandoff, parseCompactionHandoff, redactCompactionText, retainCompleteRecentHistory } from "../src/main/agent/compactionState";
import { runReliableCompaction, type ReliableCompactionInput } from "../src/main/agent/reliableCompaction";
import type { ProviderMessage } from "../src/main/agent/providers/types";
import type { ProviderStreamOptions } from "../src/main/agent/providers/types";
import { OpenCodeGoAdapter } from "../src/main/agent/providers/opencodeGo";
import { GeminiAdapter } from "../src/main/agent/providers/gemini";
import type { SecurityJobRecord } from "../src/shared/securityWorkspace";

let folder: string;
let store: DesktopStore;
let threadId: string;
beforeEach(() => {
  folder = fs.mkdtempSync(path.join(os.tmpdir(), "privora-compact-"));
  store = new DesktopStore(folder);
  threadId = store.createThread(store.upsertWorkspace(folder).id).id;
  message("goal", "Only test our synthetic local instance. Do not submit reports.", 1);
});
afterEach(() => { vi.unstubAllGlobals(); store.close(); fs.rmSync(folder, { recursive: true, force: true }); });
function message(id: string, content: string, timestamp: number) {
  store.upsertMessage({ id, threadId, role: "user", content, status: "completed", createdAt: timestamp, updatedAt: timestamp });
}
function handoff(ids = ["goal"]) {
  return JSON.stringify({ ...emptyHandoff(), goals: ["Investigate synthetic local instance"], rejectedLeads: ["H1 is rejected, not a vulnerability"], nextActions: ["Verify H2 with positive and negative controls"], sourceMessageIds: ids });
}
function input(overrides: Partial<ReliableCompactionInput> = {}): ReliableCompactionInput {
  return {
    store, threadId, assistantMessageId: "active", workspaceRoot: folder, model: "opencode-go/glm-5.3-flash", history: messagesToProviderHistory(store.listMessages(threadId)),
    trigger: "pre_turn", reason: "context_limit", signal: new AbortController().signal,
    budget: { inputBudgetTokens: 28_000 } as ReliableCompactionInput["budget"], overheadTokens: 1_024, progress: () => undefined,
    summarize: async () => handoff(), rebuildHistory: () => messagesToProviderHistory(store.listMessages(threadId)), ...overrides,
  };
}

describe("reliable compaction lifecycle", () => {
  it("keeps appended instructions outside the captured boundary and restores after restart", async () => {
    const result = await runReliableCompaction(input({ summarize: async () => { message("later", "Correction: research only; stop runtime tests.", 2); return handoff(); } }));
    expect(result.checkpoint.compactedThroughMessageId).toBe("goal");
    store.close(); store = new DesktopStore(folder);
    const restored = buildProviderHistoryWithCompaction(store, threadId, "next");
    expect(restored.at(-1)?.content).toBe("Correction: research only; stop runtime tests.");
    expect(store.listMessages(threadId)).toHaveLength(2);
  });

  it("rejects an edited prefix, rebuilds once, and installs only the corrected source", async () => {
    let calls = 0;
    const result = await runReliableCompaction(input({ summarize: async () => { if (calls++ === 0) message("goal", "Updated goal: read-only research", 1); return handoff(); } }));
    expect(calls).toBe(2);
    expect(result.checkpoint.preservedState?.operatorInstructions[0].text).toBe("Updated goal: read-only research");
    expect(store.listCompactionCheckpoints(threadId)).toHaveLength(1);
  });

  it("pauses after two stale candidates without activating either", async () => {
    let calls = 0;
    await expect(runReliableCompaction(input({ summarize: async () => { message("goal", `Edit-${calls++}`, 1); return handoff(); } }))).rejects.toThrow("changed twice");
    expect(store.getLatestCompactionCheckpoint(threadId)).toBeNull();
  });

  it("does not install when a rewind deletes the captured source", async () => {
    await expect(runReliableCompaction(input({ summarize: async () => { store.pruneThreadAfterMessage(threadId, "goal", true); return handoff(); } }))).rejects.toThrow();
    expect(store.getLatestCompactionCheckpoint(threadId)).toBeNull();
  });

  it("keeps the prior checkpoint when cancellation races with a successful model response", async () => {
    const previous = await runReliableCompaction(input());
    const controller = new AbortController();
    await expect(runReliableCompaction(input({ signal: controller.signal, summarize: async () => { controller.abort(); return handoff(); } }))).rejects.toThrow();
    expect(store.getLatestCompactionCheckpoint(threadId)?.id).toBe(previous.checkpoint.id);
  });

  it("checks cancellation immediately before activation", async () => {
    const controller = new AbortController();
    await expect(runReliableCompaction(input({ signal: controller.signal, progress: (stage) => { if (stage === "Validating source history") controller.abort(); } }))).rejects.toThrow();
    expect(store.getLatestCompactionCheckpoint(threadId)).toBeNull();
  });

  it("restores assistant output created after compaction even when a steer is the source boundary", async () => {
    store.upsertMessage({ id: "active", threadId, role: "assistant", content: "Before compaction. ", status: "running", createdAt: 2, updatedAt: 2 });
    message("steer", "Preserve this correction", 3);
    await runReliableCompaction(input({ textOffset: 19 }));
    store.upsertMessage({ ...store.getMessage("active")!, content: "Before compaction. AFTER COMPACTION RESULT", status: "completed", updatedAt: 4 });
    message("next", "Continue", 5);
    const restored = buildProviderHistoryWithCompaction(store, threadId, "new-assistant");
    expect(restored.some((entry) => entry.role === "assistant" && entry.content === "AFTER COMPACTION RESULT")).toBe(true);
  });

  it("preserves executed live tool exchanges during stale-history rebuild", async () => {
    const pair: ProviderMessage[] = [
      { role: "assistant", content: "Already executed", parts: [{ type: "function_call", id: "done", name: "desktop_write_file", arguments: { path: "done.txt", content: "written" } }] },
      { role: "user", content: "", parts: [{ type: "function_response", id: "done", name: "desktop_write_file", response: { success: true, output: "Written once" } }] },
    ];
    let calls = 0;
    const result = await runReliableCompaction(input({ history: [...input().history, ...pair], summarize: async () => { if (calls++ === 0) message("goal", "Updated constraints", 1); return handoff(); } }));
    const parts = result.history.flatMap((entry) => entry.parts ?? []);
    expect(parts.some((part) => part.type === "function_response" && part.response.output === "Written once")).toBe(true);
    expect(parts.some((part) => part.type === "function_call" && part.id === "done")).toBe(true);
  });

  it("updates the resumable run history atomically with checkpoint activation", async () => {
    store.saveRunCheckpoint({ threadId, assistantMessageId: "active", history: input().history, workspaceRoot: folder, updatedAt: 1 } as Parameters<DesktopStore["saveRunCheckpoint"]>[0]);
    await runReliableCompaction(input({ summarize: async () => { message("during", "New instruction during activation", 2); return handoff(); } }));
    store.close(); store = new DesktopStore(folder);
    const history = JSON.stringify(store.getRunCheckpoint(threadId)?.history);
    expect(history).toContain("Preserved checkpoint state");
    expect(history).toContain("New instruction during activation");
  });

  it("rejects changed attachment bytes while preserving source identity", async () => {
    const attachment = store.importAttachment({ id: "image", name: "screen.png", mimeType: "image/png", bytes: Buffer.from("before"), createdAt: 1 });
    store.upsertMessage({ ...store.getMessage("goal")!, attachments: [attachment] });
    let calls = 0;
    await runReliableCompaction(input({ summarize: async () => { if (calls++ === 0) store.upsertMessage({ ...store.getMessage("goal")!, attachments: [{ ...attachment, base64: Buffer.from("after").toString("base64") }] }); return handoff(); } }));
    expect(calls).toBe(2);
  });

  it("repairs malformed structured output once", async () => {
    const summarize = vi.fn().mockResolvedValueOnce("not json").mockResolvedValueOnce(handoff());
    const result = await runReliableCompaction(input({ summarize }));
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(result.checkpoint.validation).toMatchObject({ method: "structured", attempts: 2, estimated: true });
    expect(result.checkpoint.error).toBeUndefined();
  });

  it("falls back without losing prior rejected leads or original constraints", async () => {
    await runReliableCompaction(input());
    message("next", "H2 remains unresolved. Never retry uncertain deliveries automatically.", 2);
    const summarize = vi.fn().mockRejectedValue(new Error("provider disconnected"));
    const result = await runReliableCompaction(input({ summarize }));
    expect(summarize).toHaveBeenCalledTimes(2);
    expect(result.checkpoint.validation?.method).toBe("deterministic");
    expect(result.checkpoint.preservedState?.summaryClaims.rejectedLeads).toContain("H1 is rejected, not a vulnerability");
    expect(JSON.stringify(result.history)).toContain("Never retry uncertain deliveries");
  });

  it("pauses when mandatory state exceeds the model budget", async () => {
    message("huge", "constraint ".repeat(30_000), 2);
    const summarize = vi.fn();
    await expect(runReliableCompaction(input({ summarize }))).rejects.toThrow("required task state exceeds");
    expect(summarize).not.toHaveBeenCalled();
    expect(store.listMessages(threadId)).toHaveLength(2);
    expect(store.getLatestCompactionCheckpoint(threadId)).toBeNull();
  });

  it("preserves source references and corrections across repeated synthetic investigations", async () => {
    for (let round = 0; round < 5; round++) {
      message(`round-${round}`, `H${round + 2} unfinished; source commit abcdef12; evidence remains unresolved until checked.`, round + 2);
      await runReliableCompaction(input());
    }
    const restored = JSON.stringify(buildProviderHistoryWithCompaction(store, threadId, "next"));
    expect(restored).toContain("Do not submit reports");
    expect(restored).toContain("H1 is rejected");
    expect(restored).toContain("H6 unfinished");
    expect(store.listMessages(threadId)).toHaveLength(6);
  });

  it("reduces large repeated investigation histories without losing scope or unfinished work", async () => {
    let history = input().history;
    for (let round = 0; round < 4; round++) {
      message(`task-${round}`, `H${round + 2} unfinished. Keep version 11.9.2 and source abcdef12 pinned. Evidence job unresolved-${round} must not be replaced.`, round * 20 + 2);
      const activity: ProviderMessage[] = [];
      for (let item = 0; item < 10; item++) {
        const content = `Synthetic analysis ${round}/${item}: ${"observation ".repeat(3_000)}`;
        store.upsertMessage({ id: `analysis-${round}-${item}`, threadId, role: "assistant", content, status: "completed", createdAt: round * 20 + item + 3, updatedAt: round * 20 + item + 3 });
        activity.push({ role: "assistant", content });
      }
      const result = await runReliableCompaction(input({ history: [...history, ...activity] }));
      expect(result.afterTokens).toBeLessThan(result.beforeTokens);
      expect(result.afterTokens + result.checkpoint.validation!.overheadTokens).toBeLessThan(28_000);
      history = result.history;
    }
    const restored = JSON.stringify(buildProviderHistoryWithCompaction(store, threadId, "next"));
    expect(restored).toContain("Do not submit reports");
    expect(restored).toContain("unresolved-3");
    expect(restored).toContain("H5 unfinished");
    expect(store.listMessages(threadId)).toHaveLength(45);
  });

  it.each(["opencode-go/glm-5.3-flash", "opencode-go/claude-haiku-5-5", "gemini-3.7-flash", "opencode-go/deepseek-v4.1-flash"])("preserves portable state when sanitizing for %s", async (model) => {
    await runReliableCompaction(input());
    const restored = sanitizeProviderHistoryForModel(buildProviderHistoryWithCompaction(store, threadId, "next"), model);
    expect(JSON.stringify(restored)).toContain("Do not submit reports");
    expect(JSON.stringify(restored)).toContain("H1 is rejected");
  });

  it("reads legacy checkpoints and invalidates new checkpoints after source edits", async () => {
    const result = await runReliableCompaction(input());
    message("goal", "Changed operator instruction", 1);
    expect(buildProviderHistoryWithCompaction(store, threadId, "next")[0].content).toBe("Changed operator instruction");
    store.saveCompactionCheckpoint({ ...result.checkpoint, id: "legacy", createdAt: Date.now() + 1, schemaVersion: undefined, preservedState: undefined, replacementHistory: [{ role: "user", content: "legacy summary" }] });
    expect(buildProviderHistoryWithCompaction(store, threadId, "next")[0].content).toBe("legacy summary");
  });
});

describe("handoff validation and tool boundaries", () => {
  it("rejects missing fields and fabricated source IDs", () => {
    expect(() => parseCompactionHandoff('{}', ["goal"])).toThrow();
    expect(() => parseCompactionHandoff(handoff(["fabricated"]), ["goal"])).toThrow();
  });
  it("redacts common credential forms while keeping source references", () => {
    const text = 'password="my secret value" Bearer abcdefghijklmnop mm_token=ABCDEFGHIJKLMNOP private source /synthetic-creds/mm_token';
    expect(redactCompactionText(text)).not.toContain("my secret");
    expect(redactCompactionText(text)).not.toContain("secret value");
    expect(redactCompactionText(text)).not.toContain("ABCDEFGHIJKLMNOP");
    expect(redactCompactionText(text)).toContain("/synthetic-creds/mm_token");
    const json = redactCompactionText('{"password":"hunter2", "access_token":"abc123", "secret":"with spaces"}');
    expect(json).not.toContain("hunter2");
    expect(json).not.toContain("abc123");
    expect(json).not.toContain("with spaces");
  });
  it("retains complete pairs or drops the whole split exchange", () => {
    const pair: ProviderMessage[] = [
      { role: "assistant", content: "", parts: [{ type: "function_call", id: "call", name: "kali_job_status", arguments: { payload: "x".repeat(4_000) } }] },
      { role: "user", content: "", parts: [{ type: "function_response", id: "call", name: "kali_job_status", response: { success: true, output: "succeeded" } }] },
      { role: "user", content: "Continue after the status check" },
    ];
    expect(retainCompleteRecentHistory(pair, 10_000)).toEqual(pair);
    expect(retainCompleteRecentHistory(pair, 100)).toEqual([pair[2]]);
  });
});

describe("security checkpoint observations", () => {
  it("refreshes uncertain jobs and keeps failed evidence IDs unresolved", async () => {
    store.saveSecurityEnvironment({ id: "env", name: "test", host: "127.0.0.1", port: 2222, username: "test", status: "connected" });
    const workspace = store.createSecurityWorkspace({ name: "lab", objective: "Verify synthetic controls", scope: "localhost only", environmentId: "env" });
    threadId = store.createThread(workspace.id).id;
    message("goal", "No external targets", 1);
    const job: SecurityJobRecord = { id: "original-job", remoteJobId: "remote", workspaceId: workspace.id, threadId, environmentId: "env", idempotencyKey: "key", projectId: "lab", state: "unknown", sequence: 1, outputPreview: "", commandPreview: "", exitCode: null, error: null, createdAt: 1, updatedAt: 1 };
    store.upsertSecurityJob(job);
    store.upsertSecurityFinding({ id: "finding", workspaceId: workspace.id, title: "H1 rejected", description: "No leak", severity: "info", state: "rejected", reproduction: "", remediation: "", evidenceJobIds: [job.id], createdAt: 1, updatedAt: 1 });
    const result = await runReliableCompaction(input());
    store.upsertSecurityJob({ ...job, state: "succeeded", exitCode: 0, updatedAt: 2 });
    const refreshed = refreshCompactionObservations(store, threadId, result.history);
    expect(refreshed[0].content).toContain('"state":"succeeded"');
    const db = new DatabaseSync(path.join(folder, "privora-desktop.sqlite"));
    db.prepare("DELETE FROM security_jobs WHERE id = ?").run(job.id); db.close();
    const state = buildPreservedState(store, threadId, store.listMessages(threadId));
    expect(state.evidence).toContainEqual({ id: "original-job", kind: "job", sourceId: "finding", availability: "unresolved" });
    expect(state.findings[0].evidenceJobIds).toEqual(["original-job"]);
  });
});

describe("compacted history through real provider serializers", () => {
  const pair: ProviderMessage[] = [
    { role: "assistant", content: "Checking prior job", parts: [{ type: "function_call", id: "call-fixture", name: "kali_job_status", arguments: { jobId: "original-job" } }] },
    { role: "user", content: "", parts: [{ type: "function_response", id: "call-fixture", name: "kali_job_status", response: { success: true, output: "Already succeeded, do not rerun" } }] },
  ];
  const options = (model: string, messages: ProviderMessage[]): ProviderStreamOptions => ({
    provider: model.startsWith("opencode-go/") ? "opencode-go" : "gemini", model, messages, systemInstruction: "Stable instructions", reasoning: "none", collaborationMode: "default",
    signal: new AbortController().signal, threadId, maxOutputTokens: 4_096, toolEnvironment: "security",
    cliproxyBaseUrl: "", openRouterApiKey: "", geminiApiKey: "fixture", deepseekApiKey: "", opencodeGoApiKey: "fixture",
    onTextDelta: vi.fn(), onThoughtDelta: vi.fn(), onToolDraft: vi.fn(), onToolCall: vi.fn(),
  });
  it.each([
    ["opencode-go/glm-5.3-flash", "chat/completions"],
    ["opencode-go/gpt-6-luna", "responses"],
    ["opencode-go/claude-haiku-5-5", "messages"],
  ])("serializes preserved state and complete tools for %s", async (model, route) => {
    const result = await runReliableCompaction(input({ history: [...input().history, ...pair] }));
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response("data: [DONE]\n\n", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await new OpenCodeGoAdapter().stream(options(model, sanitizeProviderHistoryForModel(result.history, model)));
    expect(String(fetchMock.mock.calls[0][0])).toContain(route);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    const serialized = JSON.stringify(body);
    expect(serialized).toContain("Do not submit reports");
    expect(serialized).toContain("call-fixture");
    expect(serialized).toContain("Already succeeded");
    if (route === "chat/completions") expect(body.messages.find((message: { role: string }) => message.role === "tool")).not.toHaveProperty("name");
  });
  it("serializes preserved state and complete tools for Gemini interactions", async () => {
    const result = await runReliableCompaction(input({ history: [...input().history, ...pair] }));
    gemini.create.mockResolvedValueOnce((async function* () {})());
    await new GeminiAdapter().stream({ ...options("gemini-3.7-flash", result.history), reasoning: "high" });
    const body = JSON.stringify(gemini.create.mock.calls.at(-1)?.[0]);
    expect(body).toContain("Do not submit reports");
    expect(body).toContain("call-fixture");
    expect(body).toContain("Already succeeded");
  });
});
