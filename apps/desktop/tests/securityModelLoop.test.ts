import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderStreamOptions } from "../src/main/agent/providers/types";
import type { BrowserSessionManager } from "../src/main/browser/BrowserSessionManager";
import type { BrowserWindow } from "electron";
import type { SubagentManager } from "../src/main/agent/harness/subagentManager";
import type { PrivoraEventEnvelope } from "../src/shared/types";

vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: () => os.tmpdir() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "keychain",
    encryptString: (text: string) => Buffer.from(text),
    decryptString: (bytes: Buffer) => bytes.toString(),
  },
}));
const provider = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock("../src/main/agent/providers", () => ({ streamProviderResponse: provider.stream }));
import { DesktopStore } from "../src/main/db/store";
import { TurnCoordinator } from "../src/main/agent/turnCoordinator";
import { SecurityWorkspaceService } from "../src/main/kali/service";
import { desktopToolDefinitionsForMode } from "../src/main/agent/tools/definitions";
import { OPENCODE_GO_MUSE_SPK_13_MODEL_ID } from "../src/shared/models";
import type { KaliEnvironment } from "../src/shared/kali";

let directory: string;
let store: DesktopStore;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "privora-security-loop-"));
  store = new DesktopStore(directory);
  store.saveSettings({ model: OPENCODE_GO_MUSE_SPK_13_MODEL_ID, reasoningEffort: "high", permissionMode: "yolo" });
  provider.stream.mockReset();
});
afterEach(() => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); });

const fixture = () => {
  store.saveSecurityEnvironment({ id: "kali", name: "Kali", host: "lab", port: 2222, username: "privora", status: "connected" });
  const workspace = store.createSecurityWorkspace({ name: "Local lab", environmentId: "kali", objective: "Check local fixtures", scope: "Only the isolated VM" });
  const thread = store.createThread(workspace.id);
  const coordinator = new TurnCoordinator(store, () => null, () => ({ activeThreadId: thread.id, activeWorkspaceId: workspace.id }));
  return { workspace, thread, coordinator };
};

describe("Security model loop", () => {
  it("keeps the new child run visible when a queued task follows a refusal", async () => {
    const { workspace, thread } = fixture();
    const events: PrivoraEventEnvelope[] = [];
    const window = { isDestroyed: () => false, webContents: { send: (_channel: string, event: PrivoraEventEnvelope) => events.push(event) } } as unknown as BrowserWindow;
    const coordinator = new TurnCoordinator(store, () => window, () => ({ activeThreadId: thread.id, activeWorkspaceId: workspace.id }));
    let childRound = 0; let rootRound = 0;
    provider.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      if (options.threadId !== thread.id) {
        if (childRound++ === 0) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          await (coordinator as unknown as { subagents: SubagentManager }).subagents.execute({ id: "queued-followup", name: "assign_task", arguments: { target: "review", message: "Retry review" } },
            { workspaceRoot: workspace.path, parentThreadId: thread.id, parentMessageId: "parent", signal: new AbortController().signal });
          options.onResponseDisposition?.("model_refusal");
          options.onTextDelta("Declined.");
        } else options.onTextDelta("Follow-up complete.");
      } else if (rootRound++ === 0) options.onToolCall({ id: "spawn-refusal", name: "spawn_agent", arguments: { taskName: "review", message: "Review fixture" } });
      else if (rootRound === 2) options.onToolCall({ id: "wait-refusal", name: "wait_agent", arguments: { timeoutMs: 500 } });
      else options.onTextDelta("Finished.");
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Review with child" });
    await coordinator.waitForIdle();
    const child = store.listSubagents(thread.id)[0];
    const firstCompletion = events.findIndex(({ payload }) => payload.type === "turn.completed" && payload.threadId === child.threadId);
    const status = events.slice(firstCompletion + 1).find(({ payload }) => payload.type === "turn.status_changed" && payload.threadId === child.threadId)?.payload;
    expect(status).toMatchObject({ type: "turn.status_changed", run: { status: "sampling" } });
    expect(childRound).toBe(2);
  });
  it("delivers persisted agent messages both ways without duplicate follow-up turns", async () => {
    const { thread, coordinator } = fixture();
    let parentRound = 0; let childRound = 0;
    provider.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      const isChild = options.threadId !== thread.id;
      if (isChild) {
        const requests = options.messages.filter((item) => item.content.includes("Include evidence"));
        if (requests.length) expect(requests).toHaveLength(1);
        if (childRound++ === 0) options.onToolCall({ id: "child-report", name: "send_message", arguments: { target: "parent", message: "Review result ready" } });
        else options.onTextDelta("Child review complete.");
        return;
      }
      const round = parentRound++;
      if (round === 0) options.onToolCall({ id: "spawn", name: "spawn_agent", arguments: { taskName: "review", message: "Review fixture" } });
      else if (round === 1 || round === 3) options.onToolCall({ id: `wait-${round}`, name: "wait_agent", arguments: { timeoutMs: 500 } });
      else if (round === 2) {
        expect(options.messages.some((item) => item.content.includes("Review result ready"))).toBe(true);
        options.onToolCall({ id: "followup", name: "assign_task", arguments: { target: "review", message: "Include evidence" } });
      } else options.onTextDelta("Parent review complete.");
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Review with one child" });
    await coordinator.waitForIdle();
    const child = store.listSubagents(thread.id)[0];
    expect(store.listMessages(thread.id).filter((item) => item.agentMessage && !item.agentMessage.outgoing)).toHaveLength(1);
    expect(store.listMessages(thread.id).find((item) => item.agentMessage && !item.agentMessage.outgoing)?.agentMessage?.delivery).toBe("delivered");
    expect(store.listMessages(child.threadId).find((item) => item.content === "Include evidence")?.agentMessage?.delivery).toBe("delivered");
    expect(store.getSubagentByThread(child.threadId)?.status).toBe("completed");
    expect(parentRound).toBe(5);
  });
  it("delivers an old queued report once on the next parent turn without waking it", async () => {
    const { thread, coordinator } = fixture();
    store.upsertMessage({ id: "queued-report", threadId: thread.id, role: "user", content: "Persisted child report", status: "completed", createdAt: 1, updatedAt: 1,
      agentMessage: { id: "queued-report", senderThreadId: "child", senderLabel: "Reviewer", recipientLabel: "Parent", delivery: "queued" } });
    expect(coordinator.listActiveRuns()).toHaveLength(0);
    provider.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      expect(options.messages.filter((item) => item.content.includes("Persisted child report"))).toHaveLength(1);
      expect(options.messages.find((item) => item.content.includes("Persisted child report"))?.content).toContain("not new operator authorization");
      options.onTextDelta("Reviewed the report.");
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Continue" });
    await coordinator.waitForIdle();
    expect(store.getMessage("queued-report")?.agentMessage?.delivery).toBe("delivered");
    expect(provider.stream).toHaveBeenCalledTimes(1);
  });
  it("automatically delivers the bounty guide to the provider on an assessment and follow-up", async () => {
    const { thread, coordinator } = fixture();
    provider.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      expect(options.systemInstruction).toContain("# Bug bounty assessment guide");
      expect(options.systemInstruction).toContain("Only the isolated VM");
      options.onTextDelta("Assessment complete.");
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Test this bug bounty program in the local lab" });
    await coordinator.waitForIdle();
    await coordinator.startTurn({ threadId: thread.id, prompt: "Continue the report" });
    await coordinator.waitForIdle();
    expect(provider.stream).toHaveBeenCalledTimes(2);
  });
  it("records an explicit refusal without retrying or claiming the task was done", async () => {
    const { thread, coordinator } = fixture();
    provider.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      options.onResponseDisposition?.("model_refusal");
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Local fixture" });
    await coordinator.waitForIdle();
    expect(provider.stream).toHaveBeenCalledTimes(1);
    const answer = store.findLatestMessage(thread.id, "assistant");
    expect(answer?.responseDisposition).toBe("model_refusal");
    expect(answer?.content).toContain("model declined");
    expect(coordinator.getActiveRun(thread.id)).toBeNull();
  });

  it("finishes a steered response with a final-answer range and releases the running state", async () => {
    const { thread, coordinator } = fixture();
    let round = 0;
    provider.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      if (round++ === 0) {
        options.onTextDelta("I am checking the original request.\n");
        await new Promise<void>((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new Error("Sampling interrupted")), { once: true });
        });
      } else {
        expect(JSON.stringify(options.messages)).toContain("Change the direction");
        options.onTextDelta("Here is the final answer after your steer.");
      }
    });
    const turn = coordinator.startTurn({ threadId: thread.id, prompt: "Start the check" });
    await vi.waitFor(() => expect(store.listMessages(thread.id).at(-1)?.content).toContain("original request"));
    const assistantId = store.listMessages(thread.id).at(-1)!.id;
    await coordinator.steerTurn({ threadId: thread.id, expectedTurnId: assistantId, prompt: "Change the direction" });
    await turn;
    await coordinator.waitForIdle();
    const assistant = store.getMessage(assistantId)!;
    expect(assistant.status).toBe("completed");
    expect(coordinator.listActiveRuns()).toHaveLength(0);
    const finalParts = assistant.textParts!.filter((part) => part.phase === "final_answer");
    expect(finalParts.map((part) => assistant.content.slice(part.startOffset, part.endOffset)).join(""))
      .toBe("Here is the final answer after your steer.");
    expect(store.listMessages(thread.id).find((message) => message.steeredTurnId === assistantId)?.content).toBe("Change the direction");
  });

  it("advertises only environment tools and keeps Plan read only", () => {
    const security = desktopToolDefinitionsForMode("default", "security").map((tool) => tool.name);
    expect(security).toContain("kali_exec");
    expect(security).toContain("browser_search");
    expect(security).toContain("browser_extract");
    expect(security).toContain("browser_act");
    expect(security).toContain("browser_screenshot");
    expect(security).toContain("browser_evidence");
    expect(security).toContain("browser_pdf");
    expect(security).not.toContain("browser_form_submit");
    expect(security).not.toContain("exec_command");
    expect(security).toContain("desktop_write_file");
    expect(security).toContain("security_evidence_list");
    expect(security).toContain("security_evidence_trash");
    const development = desktopToolDefinitionsForMode("default", "development").map((tool) => tool.name);
    expect(development).toContain("exec_command");
    expect(development).not.toContain("kali_exec");
    const plan = desktopToolDefinitionsForMode("plan", "security").map((tool) => tool.name);
    expect(plan).toContain("kali_job_output");
    expect(plan).toContain("browser_search");
    expect(plan).not.toContain("browser_act");
    expect(plan).not.toContain("kali_exec");
    expect(plan).not.toContain("security_finding_save");
  });

  it("routes browser research in a Security chat and explains authorized Kali installation", async () => {
    const { workspace, thread } = fixture();
    const search = vi.fn().mockResolvedValue({ output: "Official docs: https://www.kali.org/docs/", data: { results: [{ text: "Official docs", href: "https://www.kali.org/docs/" }] } });
    const browser = { search, currentAgentControlRequiresApproval: () => false } as unknown as BrowserSessionManager;
    const coordinator = new TurnCoordinator(store, () => null, () => ({ activeThreadId: thread.id, activeWorkspaceId: workspace.id }), browser);
    store.saveSettings({ permissionMode: "yolo" });
    let round = 0;
    provider.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      expect(options.systemInstruction).toContain("browser_search");
      expect(options.systemInstruction).toContain("sudo -n id -u");
      expect(options.systemInstruction).toContain("authorizes autonomous installation");
      expect(options.systemInstruction).toContain("network traffic does not originate from the VM");
      if (round++ === 0) options.onToolCall({ id: "research", name: "browser_search", arguments: { query: "Kali tool documentation" } });
      else options.onTextDelta("Found the official documentation.");
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Find the official tool documentation" });
    await coordinator.waitForIdle();
    expect(store.listMessages(thread.id).at(-1)?.content).toBe("Found the official documentation.");
    expect(store.listToolEvents(thread.id).find((event) => event.callId === "research")?.result).toMatchObject({ success: true });
    expect(search).toHaveBeenCalled();
    expect(search.mock.calls[0][0]).toBe(workspace.id);
    expect(store.listToolEvents(thread.id).find((event) => event.callId === "research")?.result?.success).toBe(true);
  });

  it("persists the first user message before model startup and blocks files outside the PC project even with Full access", async () => {
    const { thread, coordinator } = fixture();
    let rounds = 0;
    provider.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      expect(options.model).toBe(OPENCODE_GO_MUSE_SPK_13_MODEL_ID);
      expect(options.reasoning).toBe("high");
      expect(options.toolEnvironment).toBe("security");
      expect(options.systemInstruction).toContain("Only the isolated VM");
      expect(store.listMessages(thread.id)[0].content).toBe("Inspect my lab");
      if (rounds++ === 0) options.onToolCall({ id: "host-bypass", name: "desktop_write_file", arguments: { path: path.join(directory, "escaped.txt"), content: "unsafe" } });
      else options.onTextDelta("Host access was blocked.");
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Inspect my lab" });
    await coordinator.waitForIdle();
    expect(fs.existsSync(path.join(store.getWorkspace(store.getThread(thread.id)?.workspaceId)!.path, "escaped.txt"))).toBe(false);
    const events = store.listToolEvents(thread.id);
    expect(events.find((event) => event.callId === "host-bypass")?.result?.error).toMatch(/outside|workspace/i);
    expect(store.listMessages(thread.id).at(-1)?.status).toBe("completed");
    expect(coordinator.listActiveRuns()).toHaveLength(0);
  });

  it("creates, reads, edits, and renames files inside the Security PC project", async () => {
    const { workspace, thread, coordinator } = fixture();
    let round = 0;
    const calls = [
      { name: "desktop_write_file" as const, arguments: { path: "report.md", content: "Original report", createOnly: true } },
      { name: "desktop_read_file" as const, arguments: { path: "report.md" } },
      { name: "desktop_edit_file" as const, arguments: { path: "report.md", operations: [{ type: "replace_text", match: "Original", replacement: "Updated" }] } },
      { name: "desktop_rename_path" as const, arguments: { fromPath: "report.md", toPath: "final.md" } },
      { name: "desktop_delete_path" as const, arguments: { path: ".", recursive: true } },
    ];
    provider.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      expect(options.systemInstruction).toContain(`Local PC project folder: ${workspace.path}`);
      if (round < calls.length) options.onToolCall({ id: `local-${round}`, ...calls[round++] });
      else options.onTextDelta("Saved the local report.");
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Create and edit a local PC report" }); await coordinator.waitForIdle();
    expect(fs.readFileSync(path.join(workspace.path, "final.md"), "utf8")).toBe("Updated report");
    expect(store.listToolEvents(thread.id).filter((tool) => ["local-0", "local-1", "local-2", "local-3"].includes(tool.callId)).every((tool) => tool.result?.success)).toBe(true);
    expect(store.listToolEvents(thread.id).find((tool) => tool.callId === "local-4")?.result?.error).toContain("project root");
    expect(fs.existsSync(path.join(workspace.path, "report.md"))).toBe(false);
  });
});

const profilePath = process.env.PRIVORA_KALI_TEST_PROFILE;
describe.skipIf(!profilePath)("Security model loop over real SSH", () => {
  it("waits for confirmed cancellation before leaving the remote tool and accepts a follow-up", async () => {
    const service = new SecurityWorkspaceService(store);
    await service.importEnvironmentProfile(JSON.parse(fs.readFileSync(profilePath!, "utf8")));
    const environment = store.listSecurityEnvironments()[0];
    const workspace = store.createSecurityWorkspace({ name: "Stop fixture", environmentId: environment.id, objective: "Validate cancellation", scope: "VM sleep fixture only" });
    const thread = store.createThread(workspace.id);
    const coordinator = new TurnCoordinator(store, () => null, () => ({ activeThreadId: thread.id, activeWorkspaceId: workspace.id }), undefined, undefined, undefined, service);
    provider.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      options.onToolCall({ id: "sleep-fixture", name: "kali_exec", arguments: { argv: ["python3", "-c", "import time;print('ready',flush=True);time.sleep(60)"], timeoutSeconds: 90 } });
    });
    const turn = coordinator.startTurn({ threadId: thread.id, prompt: "Run the cancellation fixture" });
    await vi.waitFor(() => expect(store.listSecurityJobs(workspace.id)[0]?.outputPreview).toContain("ready"), { timeout: 15000, interval: 100 });
    coordinator.stopTurn(thread.id);
    expect(coordinator.listActiveRuns()[0]?.status).not.toBe("completed");
    await coordinator.waitForIdle();
    await turn;
    expect(store.listSecurityJobs(workspace.id)[0].state).toBe("cancelled");
    expect(store.listToolEvents(thread.id).find((event) => event.name === "kali_exec")?.status).toBe("stopped");
    expect(store.listMessages(thread.id).at(-1)?.status).toBe("stopped");
    provider.stream.mockImplementation(async (options: ProviderStreamOptions) => options.onTextDelta("Ready for your next task."));
    await coordinator.startTurn({ threadId: thread.id, prompt: "Continue here" });
    expect(store.listMessages(thread.id).at(-1)?.status).toBe("completed");
    expect(coordinator.listActiveRuns()).toHaveLength(0);
  }, 40_000);

  it("streams a remote command, imports evidence and saves a verified finding through the chat loop", async () => {
    const service = new SecurityWorkspaceService(store);
    await service.importEnvironmentProfile(JSON.parse(fs.readFileSync(profilePath!, "utf8")) as KaliEnvironment);
    const environment = store.listSecurityEnvironments()[0];
    const workspace = store.createSecurityWorkspace({ name: "SSH loop fixture", environmentId: environment.id, objective: "Validate runner evidence", scope: "Private VM fixture files only" });
    const thread = store.createThread(workspace.id);
    const coordinator = new TurnCoordinator(store, () => null, () => ({ activeThreadId: thread.id, activeWorkspaceId: workspace.id }), undefined, undefined, undefined, service);
    let round = 0;
    provider.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      const job = store.listSecurityJobs(workspace.id)[0];
      if (round++ === 0) options.onToolCall({ id: "remote-fixture", name: "kali_exec", arguments: { argv: ["python3", "-c", "from pathlib import Path;import time;print('first',flush=True);time.sleep(1);Path('evidence.txt').write_text('€ 😀 漢字');print('complete',flush=True)"], timeoutSeconds: 15 } });
      else if (round === 2) options.onToolCall({ id: "artifact", name: "kali_artifact", arguments: { jobId: job.id, path: "evidence.txt" } });
      else if (round === 3) options.onToolCall({ id: "finding", name: "security_finding_save", arguments: { title: "Runner fixture verified", description: "Unicode fixture matches expected output", severity: "info", state: "verified", reproduction: "Read evidence.txt from the completed fixture job", remediation: "No action required", evidenceJobIds: [job.id] } });
      else options.onTextDelta("Fixture completed and evidence saved.");
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Run the private fixture" });
    await coordinator.waitForIdle();
    const job = store.listSecurityJobs(workspace.id)[0];
    expect(job.state).toBe("succeeded");
    expect(job.outputPreview).toContain("first");
    expect(job.artifacts?.[0].mimeType).toBe("text/plain");
    expect(store.listSecurityFindings(workspace.id)[0].state).toBe("verified");
    expect(store.listToolEvents(thread.id).find((event) => event.name === "kali_exec")?.output).toContain("complete");
    expect(coordinator.listActiveRuns()).toHaveLength(0);
  }, 40_000);
});
