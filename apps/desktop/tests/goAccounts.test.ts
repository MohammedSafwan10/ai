import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyGoAccountAction, goAccountActionSchema } from "../src/shared/goAccounts";

const encryption = vi.hoisted(() => ({ available: true }));
vi.mock("electron", () => ({ app: { isPackaged: false }, safeStorage: {
  isEncryptionAvailable: () => encryption.available, getSelectedStorageBackend: () => "keychain",
  encryptString: (text: string) => Buffer.from([...Buffer.from(text)].map((byte) => byte ^ 0xaa)),
  decryptString: (bytes: Buffer) => Buffer.from([...bytes].map((byte) => byte ^ 0xaa)).toString("utf8"),
} }));
import { DesktopStore } from "../src/main/db/store";

let directory: string;
let store: DesktopStore;
beforeEach(() => { encryption.available = true; directory = fs.mkdtempSync(path.join(os.tmpdir(), "privora-go-test-")); store = new DesktopStore(directory); });
afterEach(() => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
const add = (name: string, apiKey: string) => store.saveSettings({ opencodeGoAccount: { action: "save", name, apiKey } });

describe("saved Go accounts", () => {
  it("keeps multiple keys encrypted and returns only summaries to the UI", () => {
    const first = add("Personal", "test-secret-personal").activeOpencodeGoAccountId!;
    const settings = add("Work", "test-secret-work");
    expect(settings.activeOpencodeGoAccountId).toBe(first);
    expect(settings.opencodeGoAccounts).toHaveLength(2);
    expect(JSON.stringify(settings)).not.toMatch(/test-secret/);
    expect(JSON.stringify(store.snapshot(null, null))).not.toMatch(/test-secret/);
    expect(store.getOpencodeGoCredential()).toEqual({ id: first, apiKey: "test-secret-personal" });
    store.close();
    expect(fs.readFileSync(path.join(directory, "privora-desktop.sqlite")).includes(Buffer.from("test-secret"))).toBe(false);
    store = new DesktopStore(directory);
    expect(store.getSettings().activeOpencodeGoAccountId).toBe(first);
    expect(store.getOpencodeGoCredential()?.apiKey).toBe("test-secret-personal");
  });
  it("uses manual selection, clears account-specific models, and never replaces a removed active account", () => {
    const first = add("Personal", "key-one").activeOpencodeGoAccountId!;
    const second = add("Work", "key-two").opencodeGoAccounts![1].id;
    store.setOpencodeGoModelCache({ ids: ["glm-5.3-flash"], unsupported: [], fetchedAt: Date.now(), accountId: first });
    store.saveSettings({ opencodeGoAccount: { action: "activate", id: second } });
    expect(store.getOpencodeGoCredential()).toEqual({ id: second, apiKey: "key-two" });
    expect(store.getOpencodeGoModelCache()).toBeNull();
    store.saveSettings({ opencodeGoAccount: { action: "remove", id: second } });
    expect(store.getSettings()).toMatchObject({ activeOpencodeGoAccountId: null, opencodeGoApiKeyStored: false });
    expect(store.getOpencodeGoCredential()).toBeNull();
    add("Third", "key-three");
    expect(store.getOpencodeGoCredential()).toBeNull();
    store.saveSettings({ opencodeGoAccount: { action: "activate", id: first } });
    expect(store.getOpencodeGoCredential()?.apiKey).toBe("key-one");
  });
  it("migrates the original key without exposing it and preserves it on unrelated saves", () => {
    // Seed a legacy secret using the same encrypted storage path as older builds.
    (store as any).setSecret("opencode_go_api_key", "legacy-test-key");
    expect(store.getSettings().opencodeGoAccounts).toEqual([{ id: "legacy", name: "Default account", issue: undefined }]);
    store.saveSettings({ theme: "dark" });
    expect(store.getOpencodeGoCredential()?.apiKey).toBe("legacy-test-key");
    add("Second", "second-test-key");
    expect(store.getSecret("opencode_go_api_key")).toBe("");
    expect(store.getOpencodeGoCredential()).toEqual({ id: "legacy", apiKey: "legacy-test-key" });
  });
  it("renames without replacing the key, and clears a reported issue when replacing a key", () => {
    const id = add("One", "key-one").activeOpencodeGoAccountId!;
    store.reportGoAccountIssue(id, { kind: "usage_limit", model: "opencode-go/glm", at: 1 }, "key-one");
    store.saveSettings({ opencodeGoAccount: { action: "save", id, name: "Renamed" } });
    expect(store.getSettings().opencodeGoAccounts![0]).toMatchObject({ name: "Renamed", issue: { kind: "usage_limit" } });
    store.saveSettings({ opencodeGoAccount: { action: "save", id, name: "Renamed", apiKey: "replacement-key" } });
    expect(store.getSettings().opencodeGoAccounts![0].issue).toBeUndefined();
    expect(store.getOpencodeGoCredential()?.apiKey).toBe("replacement-key");
  });
  it("attributes in-flight failures to the captured account and key, without switching accounts", () => {
    const first = add("One", "key-one").activeOpencodeGoAccountId!;
    const second = add("Two", "key-two").opencodeGoAccounts![1].id;
    store.saveSettings({ opencodeGoAccount: { action: "activate", id: second } });
    const issue = { kind: "usage_limit" as const, model: "opencode-go/glm", at: 1 };
    store.reportGoAccountIssue(first, issue, "key-one");
    expect(store.getSettings().activeOpencodeGoAccountId).toBe(second);
    expect(store.getSettings().opencodeGoAccounts![0].issue).toEqual(issue);
    store.reportGoAccountIssue(first, null, "key-one", "opencode-go/another-model");
    expect(store.getSettings().opencodeGoAccounts![0].issue).toEqual(issue);
    store.reportGoAccountIssue(first, null, "key-one", issue.model);
    expect(store.getSettings().opencodeGoAccounts![0].issue).toBeUndefined();
    store.saveSettings({ opencodeGoAccount: { action: "save", id: first, name: "One", apiKey: "key-new" } });
    store.reportGoAccountIssue(first, issue, "key-one");
    expect(store.getSettings().opencodeGoAccounts![0].issue).toBeUndefined();
  });
  it("fails atomically when encryption is unavailable and refuses to overwrite an unreadable vault", () => {
    const id = add("One", "key-one").activeOpencodeGoAccountId!;
    encryption.available = false;
    expect(() => add("Two", "key-two")).toThrow(/could not be unlocked/);
    encryption.available = true;
    expect(store.getSettings().opencodeGoAccounts).toHaveLength(1);
    expect(store.getOpencodeGoCredential()?.id).toBe(id);
    (store as any).setSecret("opencode_go_accounts", "not a vault");
    expect(() => add("Two", "key-two")).toThrow(/could not be unlocked/);
    expect(store.getSettings().opencodeGoAccounts).toEqual([]);
  });
  it("rejects duplicate keys, missing keys, stale actions and more than ten accounts", () => {
    add("One", "key-one");
    expect(() => add("Duplicate", "key-one")).toThrow(/already saved/);
    expect(() => store.saveSettings({ opencodeGoAccount: { action: "save", name: "Missing" } })).toThrow(/Paste an API key/);
    expect(() => store.saveSettings({ opencodeGoAccount: { action: "activate", id: "gone" } })).toThrow(/no longer exists/);
    for (let index = 2; index <= 10; index++) add(`Account ${index}`, `key-${index}`);
    expect(() => add("Eleven", "key-11")).toThrow(/up to 10/);
    expect(store.getSettings().opencodeGoAccounts).toHaveLength(10);
    expect(goAccountActionSchema.safeParse({ action: "activate", id: "x", apiKey: "unexpected" }).success).toBe(false);
    expect(() => applyGoAccountAction({ activeId: null, accounts: [] }, { action: "save", name: " ", apiKey: "key" }, () => "id")).toThrow();
  });
});
