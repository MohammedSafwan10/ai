import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderStreamOptions } from "../src/main/agent/providers/types";
import type { BrowserSessionManager } from "../src/main/browser/BrowserSessionManager";

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
    expect(security).not.toContain("desktop_write_file");
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

  it("persists the first user message before model startup and blocks a host tool even with Full access", async () => {
    const { thread, coordinator } = fixture();
    let rounds = 0;
    provider.stream.mockImplementation(async (options: ProviderStreamOptions) => {
      expect(options.model).toBe(OPENCODE_GO_MUSE_SPK_13_MODEL_ID);
      expect(options.reasoning).toBe("high");
      expect(options.toolEnvironment).toBe("security");
      expect(options.systemInstruction).toContain("Only the isolated VM");
      expect(store.listMessages(thread.id)[0].content).toBe("Inspect my lab");
      if (rounds++ === 0) options.onToolCall({ id: "host-bypass", name: "desktop_write_file", arguments: { path: "escaped.txt", content: "unsafe" } });
      else options.onTextDelta("Host access was blocked.");
    });
    await coordinator.startTurn({ threadId: thread.id, prompt: "Inspect my lab" });
    await coordinator.waitForIdle();
    expect(fs.existsSync(path.join(store.getWorkspace(store.getThread(thread.id)?.workspaceId)!.path, "escaped.txt"))).toBe(false);
    const events = store.listToolEvents(thread.id);
    expect(events.find((event) => event.callId === "host-bypass")?.result?.error).toMatch(/Security|environment|host/i);
    expect(store.listMessages(thread.id).at(-1)?.status).toBe("completed");
    expect(coordinator.listActiveRuns()).toHaveLength(0);
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
