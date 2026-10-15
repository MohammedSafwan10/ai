import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeRendererFailure } from "../src/main/rendererFailureLog";

const directories: string[] = [];
const directory = () => { const value = fs.mkdtempSync(path.join(os.tmpdir(), "privora-renderer-error-")); directories.push(value); return value; };
afterEach(() => { for (const value of directories.splice(0)) fs.rmSync(value, { recursive: true, force: true }); });

describe("renderer failure diagnostics", () => {
  it("records failure type and bounded redacted details", () => {
    const root = directory();
    writeRendererFailure(root, "console-error", `password=do-not-retain Bearer abcdefghijklmnopqrstuvwxyz ${"x".repeat(10_000)}`);
    const line = JSON.parse(fs.readFileSync(path.join(root, "renderer-errors.log"), "utf8"));
    expect(line.kind).toBe("console-error"); expect(line.detail).toHaveLength(8000);
    expect(line.detail).not.toContain("do-not-retain"); expect(line.detail).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
  it("rotates large logs and survives an unwritable diagnostic destination", () => {
    const root = directory(); const file = path.join(root, "renderer-errors.log");
    fs.writeFileSync(file, "a".repeat(600_000));
    writeRendererFailure(root, "renderer-gone", "crashed exit 1");
    expect(fs.statSync(`${file}.previous`).size).toBe(600_000);
    expect(fs.readFileSync(file, "utf8")).toContain("renderer-gone");
    const blocked = path.join(root, "not-a-directory"); fs.writeFileSync(blocked, "file");
    expect(() => writeRendererFailure(blocked, "load-failed", "error")).not.toThrow();
  });
});
