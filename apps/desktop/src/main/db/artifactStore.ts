import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const LARGE_TEXT_THRESHOLD = 64 * 1024;
const PREVIEW_CHARS = 8_000;

export interface StoredTextArtifact {
  artifactId: string;
  preview: string;
  sizeBytes: number;
  sha256: string;
}

export interface StoredBinaryArtifact {
  artifactId: string;
  sizeBytes: number;
  sha256: string;
}

export class ArtifactStore {
  private readonly root: string;

  constructor(userDataPath: string) {
    this.root = path.join(userDataPath, "chat-artifacts");
    fs.mkdirSync(this.root, { recursive: true });
  }

  externalizeText(value: string | undefined, preferredId?: string): string | StoredTextArtifact | undefined {
    if (!value || Buffer.byteLength(value, "utf8") <= LARGE_TEXT_THRESHOLD) return value;
    const sha256 = crypto.createHash("sha256").update(value).digest("hex");
    const artifactId = preferredId ? `${safeArtifactName(preferredId)}.txt` : `${sha256}.txt`;
    const target = this.resolve(artifactId);
    atomicWrite(target, value);
    return {
      artifactId,
      preview: value.slice(0, PREVIEW_CHARS),
      sizeBytes: Buffer.byteLength(value, "utf8"),
      sha256,
    };
  }

  hydrateText(value: string | StoredTextArtifact | undefined): string | undefined {
    if (!value || typeof value === "string") return value;
    try {
      return fs.readFileSync(this.resolve(value.artifactId), "utf8");
    } catch {
      return value.preview;
    }
  }

  storeBase64(value: string): StoredBinaryArtifact {
    return this.storeBuffer(Buffer.from(value, "base64"));
  }

  storeBuffer(buffer: Uint8Array): StoredBinaryArtifact {
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const artifactId = `${sha256}.bin`;
    const target = this.resolve(artifactId);
    if (!fs.existsSync(target)) {
      const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(temp, buffer);
      fs.renameSync(temp, target);
    }
    return { artifactId, sizeBytes: buffer.length, sha256 };
  }

  loadBase64(artifactId: string) {
    return fs.readFileSync(this.resolve(artifactId)).toString("base64");
  }

  loadBuffer(artifactId: string) {
    return fs.readFileSync(this.resolve(artifactId));
  }

  deleteUnreferenced(referencedIds: Set<string>) {
    for (const entry of fs.readdirSync(this.root, { withFileTypes: true })) {
      if (!entry.isFile() || referencedIds.has(entry.name)) continue;
      fs.rmSync(path.join(this.root, entry.name), { force: true });
    }
  }

  private resolve(artifactId: string) {
    const safeName = path.basename(artifactId);
    return path.join(this.root, safeName);
  }
}

const atomicWrite = (target: string, content: string) => {
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, content, "utf8");
  fs.renameSync(temp, target);
};

const safeArtifactName = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 160);
