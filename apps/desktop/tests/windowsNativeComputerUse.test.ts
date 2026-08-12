import { describe, expect, it } from "vitest";
import { WindowsNativeComputerUseBackend } from "../src/main/computer/windowsNativeBackend";

describe.skipIf(process.platform !== "win32")("Windows native Computer Use discovery", () => {
  it("resolves executable commands without losing a single JSON result", async () => {
    const backend = new WindowsNativeComputerUseBackend();
    const apps = await backend.findApps({ query: "Notepad", limit: 5 });
    expect(apps.some((app) => /notepad\.exe$/i.test(app.executablePath || "") && app.verified)).toBe(true);
  });

  it("recovers a missing dot in an executable-style app query", async () => {
    const backend = new WindowsNativeComputerUseBackend();
    const apps = await backend.findApps({ query: "notepadexe", limit: 5 });
    expect(apps.some((app) => /notepad\.exe$/i.test(app.executablePath || "") && app.verified)).toBe(true);
  });
});
