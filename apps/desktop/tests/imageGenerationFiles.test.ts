import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ImageGenerationManager } from "../src/main/imageGeneration/ImageGenerationManager";

const tempRoots: string[] = [];

const makeTempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "privora-image-files-"));
  tempRoots.push(root);
  return root;
};

afterEach(() => {
  while (tempRoots.length) {
    fs.rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("generated image file actions", () => {
  it("copies only generated-image store files to Downloads with collision-safe names", async () => {
    const userData = makeTempRoot();
    const downloads = makeTempRoot();
    const manager = new ImageGenerationManager(userData);
    const sourceDir = path.join(userData, "generated-images", "global");
    fs.mkdirSync(sourceDir, { recursive: true });
    const sourcePath = path.join(sourceDir, "hero.png");
    fs.writeFileSync(sourcePath, Buffer.from("image-bytes"));
    writeImageIndex(userData, [{ id: "hero", path: sourcePath }]);

    const first = await manager.copyGeneratedImageToDownloads({ id: "hero", downloadsRoot: downloads });
    const second = await manager.copyGeneratedImageToDownloads({ sourcePath, downloadsRoot: downloads });

    expect(first.path).toBe(path.join(downloads, "Privora", "hero.png"));
    expect(second.path).toBe(path.join(downloads, "Privora", "hero-2.png"));
    expect(fs.readFileSync(first.path, "utf8")).toBe("image-bytes");
    expect(fs.readFileSync(second.path, "utf8")).toBe("image-bytes");
  });

  it("rejects arbitrary source paths outside generated images", async () => {
    const userData = makeTempRoot();
    const downloads = makeTempRoot();
    const manager = new ImageGenerationManager(userData);
    const sourcePath = path.join(makeTempRoot(), "not-generated.png");
    fs.writeFileSync(sourcePath, "nope");

    await expect(manager.copyGeneratedImageToDownloads({ sourcePath, downloadsRoot: downloads }))
      .rejects.toThrow("Only Privora-generated image files");
  });

  it("rejects generated-root source paths that are not indexed", async () => {
    const userData = makeTempRoot();
    const downloads = makeTempRoot();
    const manager = new ImageGenerationManager(userData);
    const sourceDir = path.join(userData, "generated-images", "global");
    fs.mkdirSync(sourceDir, { recursive: true });
    const sourcePath = path.join(sourceDir, "unindexed.png");
    fs.writeFileSync(sourcePath, "nope");

    await expect(manager.copyGeneratedImageToDownloads({ sourcePath, downloadsRoot: downloads }))
      .rejects.toThrow("sourcePath must match an indexed");
  });
});

const writeImageIndex = (userData: string, records: Array<{ id: string; path: string }>) => {
  const indexPath = path.join(userData, "generated-images", "index-v1.json");
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(records.map((record) => ({
    id: record.id,
    path: record.path,
    previewUrl: "privora-attachment://artifact/test?mime=image%2Fpng",
    prompt: "hero",
    createdAt: Date.now(),
  }))), "utf8");
};
