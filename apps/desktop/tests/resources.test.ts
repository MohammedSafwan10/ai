import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAppIconPath, resolveRipgrepExecutablePath } from "../src/main/resources";

describe("packaged resource resolution", () => {
  it("resolves the development app icon from assets", () => {
    expect(path.normalize(resolveAppIconPath())).toContain(path.normalize("assets/icon.png"));
  });

  it("resolves the development ripgrep executable from the platform package", () => {
    expect(path.normalize(resolveRipgrepExecutablePath())).toContain(path.normalize("node_modules/@vscode/ripgrep-win32-x64/bin/rg.exe"));
  });
});
