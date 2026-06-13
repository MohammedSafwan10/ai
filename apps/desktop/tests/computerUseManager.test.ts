import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
});
