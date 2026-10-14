import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KaliEnvironment } from "../src/shared/kali";
import type { SecurityEnvironmentRecord, SecurityJobRecord } from "../src/shared/securityWorkspace";

const encryption = vi.hoisted(() => ({ available: true }));
vi.mock("electron", () => ({
  app: { isPackaged: false },
  safeStorage: {
    isEncryptionAvailable: () => encryption.available,
    getSelectedStorageBackend: () => "keychain",
    encryptString: (text: string) => Buffer.from([...Buffer.from(text)].map((byte) => byte ^ 0xaa)),
    decryptString: (bytes: Buffer) => Buffer.from([...bytes].map((byte) => byte ^ 0xaa)).toString("utf8"),
  },
}));
import { DesktopStore } from "../src/main/db/store";

let directory = "";
let store: DesktopStore;
const environment: SecurityEnvironmentRecord = { id: "kali", name: "Kali VM", host: "192.168.1.13", port: 2222, username: "privora", status: "unchecked" };
const config: KaliEnvironment = { id: "kali", host: environment.host, port: environment.port, username: environment.username, identityFile: "C:/private/key", knownHostsFile: "C:/private/pins", hostFingerprint: "SHA256:test", runnerPath: "/home/privora/runner.py", jobRoot: "/home/privora/privora-jobs" };
const securityWorkspace = () => {
  store.saveSecurityEnvironment(environment);
  return store.createSecurityWorkspace({ name: "Lab", objective: "Inspect local lab", scope: "Local fixtures", environmentId: environment.id });
};
const jobFor = (workspaceId: string, threadId: string): SecurityJobRecord => ({ id: "call", remoteJobId: "remote", workspaceId, threadId, environmentId: environment.id, idempotencyKey: "stable", projectId: workspaceId, state: "running", sequence: 2, outputPreview: "hello", commandPreview: "printf hello", exitCode: null, error: null, createdAt: 1, updatedAt: 2 });
beforeEach(() => { encryption.available = true; directory = fs.mkdtempSync(path.join(os.tmpdir(), "privora-security-store-")); store = new DesktopStore(directory); });
afterEach(() => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); });

describe("security workspace persistence", () => {
  it("preserves existing missing evidence references without accepting new missing or verified evidence", () => {
    const workspace = securityWorkspace(); const thread = store.createThread(workspace.id);
    store.upsertSecurityJob(jobFor(workspace.id, thread.id));
    const finding = { id: "legacy-finding", workspaceId: workspace.id, title: "Unresolved", description: "Retained reference", severity: "info" as const, state: "observed" as const, reproduction: "", remediation: "", evidenceJobIds: ["call"], createdAt: 1, updatedAt: 2 };
    store.upsertSecurityFinding(finding);
    const db = new DatabaseSync(path.join(directory, "privora-desktop.sqlite"));
    db.prepare("DELETE FROM security_jobs WHERE id = ?").run("call"); db.close();
    store.upsertSecurityFinding({ ...finding, state: "stale", description: "Lookup unresolved after maintenance" });
    expect(store.getSecurityFinding(finding.id)?.evidenceJobIds).toEqual(["call"]);
    expect(() => store.upsertSecurityFinding({ ...finding, state: "verified" })).toThrow(/same workspace/);
    expect(() => store.upsertSecurityFinding({ ...finding, id: "new-finding" })).toThrow(/same workspace/);
  });
  it("keeps encrypted SSH configuration out of snapshots and disk plaintext", () => {
    store.saveSecurityEnvironment({ ...environment, ...config }, config);
    expect(store.getSecurityEnvironmentConfig(environment.id)).toEqual(config);
    expect(store.listSecurityEnvironments()).toEqual([environment]);
    expect(JSON.stringify(store.snapshot(null, null))).not.toContain(config.identityFile);
    store.close();
    expect(fs.readFileSync(path.join(directory, "privora-desktop.sqlite")).includes(Buffer.from(config.identityFile))).toBe(false);
    store = new DesktopStore(directory);
    expect(store.getSecurityEnvironmentConfig(environment.id)).toEqual(config);
  });
  it("fails closed without secret storage and never saves a partial environment", () => {
    encryption.available = false;
    expect(() => store.saveSecurityEnvironment(environment, config)).toThrow(/secret storage/);
    expect(store.listSecurityEnvironments()).toEqual([]);
    expect(store.getSecurityEnvironmentConfig(environment.id)).toBeNull();
  });
  it("creates a separate app-owned evidence workspace and preserves its kind when reopened", () => {
    const development = store.upsertWorkspace(directory);
    const security = securityWorkspace();
    expect(development.type).toBe("development");
    expect(security.id).not.toBe(development.id);
    expect(security.path.startsWith(path.join(directory, "security-workspaces"))).toBe(true);
    expect(fs.statSync(path.join(security.path, "evidence")).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(security.path, "attachments")).isDirectory()).toBe(true);
    expect(store.upsertWorkspace(security.path)).toMatchObject({ type: "security", name: "Lab", security: security.security });
    expect(() => store.createSecurityWorkspace({ name: "Bad", objective: "x", scope: "x", environmentId: "missing" })).toThrow(/not found/);
  });
  it("loads legacy workspaces without a kind as development without changing their identity", () => {
    const workspace = store.upsertWorkspace(directory);
    store.close();
    const legacy = new DatabaseSync(path.join(directory, "privora-desktop.sqlite"));
    legacy.prepare("UPDATE workspaces SET payload = ? WHERE id = ?").run(JSON.stringify({ id: workspace.id, path: workspace.path, name: workspace.name, lastOpenedAt: workspace.lastOpenedAt }), workspace.id);
    legacy.close();
    store = new DesktopStore(directory);
    expect(store.getWorkspace(workspace.id)).toMatchObject({ id: workspace.id, type: "development" });
    expect(store.listWorkspaces()).toHaveLength(1);
    expect(store.listWorkspaces()[0].type).toBe("development");
  });
  it("retains bounded job state across reopen, drops extra raw argv, and rejects crossed threads", () => {
    const workspace = securityWorkspace();
    const thread = store.createThread(workspace.id);
    const record = { ...jobFor(workspace.id, thread.id), argv: ["secret"], outputPreview: "x".repeat(30_000) };
    store.upsertSecurityJob(record);
    expect(store.getSecurityJob(record.id)?.outputPreview).toHaveLength(16_384);
    expect(JSON.stringify(store.getSecurityJob(record.id))).not.toContain("secret");
    const unrelatedThread = store.createThread(null).id;
    expect(() => store.upsertSecurityJob({ ...record, threadId: unrelatedThread })).toThrow(/identity cannot change/);
    expect(() => store.upsertSecurityJob({ ...record, id: "new-call", threadId: unrelatedThread })).toThrow(/belong/);
    store.close(); store = new DesktopStore(directory);
    expect(store.listSecurityJobs(workspace.id, thread.id)).toHaveLength(1);
    expect(store.getSecurityJob(record.id)).toMatchObject({ remoteJobId: "remote", sequence: 2 });
  });
  it("validates finding evidence ownership and retains job artifacts through unrelated deletion", () => {
    const workspace = securityWorkspace();
    const thread = store.createThread(workspace.id);
    const attachment = store.importAttachment({ id: "evidence", name: "result.txt", mimeType: "text/plain", bytes: Buffer.from("evidence"), createdAt: 1 });
    store.upsertSecurityJob({ ...jobFor(workspace.id, thread.id), state: "succeeded", exitCode: 0, artifacts: [attachment] });
    const finding = { id: "finding", workspaceId: workspace.id, title: "Test", description: "Observed", severity: "low" as const, state: "observed" as const, reproduction: "local", remediation: "fix", evidenceJobIds: ["call"], createdAt: 1, updatedAt: 2 };
    store.upsertSecurityFinding(finding);
    expect(store.listSecurityFindings(workspace.id)).toEqual([finding]);
    expect(() => store.upsertSecurityFinding({ ...finding, evidenceJobIds: ["missing"] })).toThrow(/same workspace/);
    store.deleteThread(store.createThread(null).id);
    expect(store.loadAttachment(attachment.artifactId)?.toString()).toBe("evidence");
    store.deleteThread(thread.id);
    expect(store.getThread(thread.id)).toBeNull();
    expect(store.getSecurityJob("call")?.state).toBe("succeeded");
    expect(store.getSecurityFinding(finding.id)?.evidenceJobIds).toEqual(["call"]);
    expect(store.loadAttachment(attachment.artifactId)?.toString()).toBe("evidence");
    store.upsertSecurityJob({ ...store.getSecurityJob("call")!, updatedAt: 3 });
    expect(store.getSecurityJob("call")?.updatedAt).toBe(3);
    store.removeWorkspace(workspace.id);
    expect(store.getSecurityFinding(finding.id)).toBeNull();
    expect(store.getSecurityJob("call")).toBeNull();
    expect(store.getWorkspace(workspace.id)).toBeNull();
  });
});
