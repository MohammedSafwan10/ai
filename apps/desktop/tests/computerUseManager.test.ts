import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComputerUseManager } from "../src/main/computer/ComputerUseManager";

let tempDir = "";

afterEach(() => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = "";
});

describe("ComputerUseManager security gates", () => {
  it("blocks native inspection and screenshots while disabled", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-computer-"));
    const manager = new ComputerUseManager(tempDir);

    await expect(manager.snapshot()).resolves.toMatchObject({ success: false });
    await expect(manager.inspect({ kind: "screenshot" })).resolves.toMatchObject({ success: false });
    await expect(manager.listWindows()).resolves.toMatchObject({ success: false });
  });

  it("requires a freshly resolved UI reference for protected actions", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-computer-"));
    const manager = new ComputerUseManager(tempDir);
    manager.setEnabled(true);

    await expect(manager.act({ action: "click", windowId: "1", x: 10, y: 10 })).resolves.toMatchObject({
      success: false,
      data: { diagnosis: { kind: "stale_target" } },
    });
  });

  it("independently rejects an optimistic mutation result even when focus restoration failed", async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-computer-"));
    const manager = new ComputerUseManager(tempDir);
    manager.setEnabled(true);
    const snapshot = {
      backend: "privora_windows_native" as const,
      capturedAt: Date.now(),
      mode: "semantic" as const,
      nodes: [{ ref: "doc-1", role: "Document", name: "Text editor", value: "", children: [] }],
      text: "Document Text editor",
      activeDocumentRef: "doc-1",
    };
    const backend = {
      id: "privora_windows_native",
      capabilities: vi.fn(),
      listWindows: vi.fn(),
      findApps: vi.fn(),
      focusWindow: vi.fn(),
      snapshot: vi.fn().mockResolvedValue(snapshot),
      act: vi.fn().mockResolvedValue({
        backend: "privora_windows_native",
        action: "set_value",
        success: false,
        finding: "Mutation completed, but focus restoration failed.",
        diagnosis: { kind: "validation_failed", message: "Focus restoration failed." },
        verification: { verified: true, requestedValue: "expected", observedValue: "expected" },
        startedAt: Date.now(),
        endedAt: Date.now(),
      }),
      screenshot: vi.fn(),
      openApp: vi.fn(),
      stop: vi.fn(),
    };
    (manager as unknown as { backends: Map<string, unknown> }).backends.set("privora_windows_native", backend);

    const result = await manager.act({ action: "set_value", windowId: "1", ref: "doc-1", text: "expected" });

    expect(result).toMatchObject({
      success: false,
      data: {
        requestedValue: "expected",
        observedValue: "",
        verified: false,
        diagnosis: { kind: "validation_failed" },
      },
    });
    expect(backend.snapshot).toHaveBeenLastCalledWith(expect.objectContaining({ scope: "matching_controls", editableOnly: true }), undefined);
  });
});
