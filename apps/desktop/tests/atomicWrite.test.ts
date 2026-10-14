import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { atomicWriteFileNoOverwrite } from "../src/main/storage/atomicWrite";
let folder = "";
afterEach(async () => { vi.restoreAllMocks(); if (folder) await fs.rm(folder, { recursive: true, force: true }); });
describe("exclusive file creation", () => {
  it("works without hard links and never replaces an existing destination", async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "privora-exclusive-"));
    vi.spyOn(fs, "link").mockRejectedValue(Object.assign(new Error("Unsupported"), { code: "ENOTSUP" }));
    const target = path.join(folder, "new.txt");
    await atomicWriteFileNoOverwrite(target, "first");
    expect(await fs.readFile(target, "utf8")).toBe("first");
    await expect(atomicWriteFileNoOverwrite(target, "second")).rejects.toMatchObject({ code: "EEXIST" });
    expect(await fs.readFile(target, "utf8")).toBe("first");
    expect(await fs.readdir(folder)).toEqual(["new.txt"]);
  });
  it("does not reinterpret destination collisions as unsupported links", async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "privora-exclusive-"));
    const target = path.join(folder, "existing.txt");
    await fs.writeFile(target, "keep");
    const copy = vi.spyOn(fs, "copyFile");
    await expect(atomicWriteFileNoOverwrite(target, "replace")).rejects.toMatchObject({ code: "EEXIST" });
    expect(copy).not.toHaveBeenCalled();
    expect(await fs.readFile(target, "utf8")).toBe("keep");
  });
});
