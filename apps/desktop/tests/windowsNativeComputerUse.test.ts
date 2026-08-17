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

  it("refuses unknown actions before attempting native input", async () => {
    const backend = new WindowsNativeComputerUseBackend();
    await expect(backend.act({ action: "launch_missiles", interactionMode: "allow_foreground" })).resolves.toMatchObject({
      success: false,
      diagnosis: { kind: "unsupported_surface" },
    });
  });

  it("refuses unresolved friendly app names instead of passing them to Start-Process", async () => {
    const backend = new WindowsNativeComputerUseBackend();
    await expect(backend.openApp({ app: "Privora Definitely Missing Application 938472" })).resolves.toMatchObject({
      success: false,
      globalInputUsed: false,
      diagnosis: { kind: "stale_target" },
    });
  });
});
