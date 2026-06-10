import { app } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";
import { ArtifactStore } from "../db/artifactStore";
import { resolveExistingWorkspacePath, resolveWorkspacePath, revalidateResolvedWorkspacePath } from "../security/pathSandbox";
import { atomicWriteFile, atomicWriteFileSync } from "../storage/atomicWrite";

export type ImageGenerationProvider = "cliproxy" | "gemini";

export interface GeneratedImageRecord {
  id: string;
  provider: ImageGenerationProvider;
  model: string;
  mode: "generate" | "edit";
  prompt: string;
  path: string;
  previewUrl: string;
  artifactId: string;
  mimeType: string;
  outputFormat: "png" | "jpeg" | "webp";
  sizeBytes: number;
  sha256: string;
  workspaceId?: string;
  workspacePath?: string;
  referencePaths: string[];
  revisedPrompt?: string;
  createdAt: number;
}

interface GenerateImageInput {
  provider?: string;
  model?: string;
  prompt: string;
  count?: number;
  size?: string;
  quality?: string;
  outputFormat?: string;
  referenceImagePaths?: string[];
  saveToWorkspacePath?: string;
  overwrite?: boolean;
  workspaceRoot: string;
  workspaceId?: string;
  cliproxyBaseUrl?: string;
  geminiApiKey?: string;
  signal: AbortSignal;
}

interface SaveGeneratedImageInput {
  id?: string;
  sourcePath?: string;
  destinationPath: string;
  overwrite?: boolean;
  workspaceRoot: string;
}

export interface GeneratedImageFileInput {
  id?: string;
  sourcePath?: string;
}

const DEFAULT_CLIPROXY_MODEL = "gpt-image-2";
const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";
const MAX_IMAGES = 4;
const IMAGE_INDEX_FILE = "index-v1.json";

export class ImageGenerationManager {
  private readonly artifactStore: ArtifactStore;
  private readonly root: string;
  private readonly indexPath: string;

  constructor(userDataPath = resolveDefaultUserDataPath()) {
    this.root = path.join(userDataPath, "generated-images");
    this.indexPath = path.join(this.root, IMAGE_INDEX_FILE);
    this.artifactStore = new ArtifactStore(userDataPath);
    fs.mkdirSync(this.root, { recursive: true });
  }

  list(limit = 20) {
    return this.readIndex()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.max(1, Math.min(100, limit)));
  }

  async generate(input: GenerateImageInput) {
    const provider = normalizeProvider(input.provider);
    const outputFormat = normalizeOutputFormat(input.outputFormat);
    const model = normalizeImageModel(provider, input.model);
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error("prompt is required.");
    const references = await this.loadReferenceImages(input.workspaceRoot, input.referenceImagePaths || []);
    const count = Math.max(1, Math.min(MAX_IMAGES, Math.floor(Number(input.count) || 1)));
    const images = provider === "gemini"
      ? await this.generateGemini({ ...input, model, prompt, count, outputFormat, references })
      : await this.generateCliproxy({ ...input, model, prompt, count, outputFormat, references });

    if (images.length === 0) throw new Error("The image provider returned no images.");

    const records: GeneratedImageRecord[] = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      const record = await this.storeImage({
        provider,
        model,
        mode: references.length > 0 ? "edit" : "generate",
        prompt,
        mimeType: image.mimeType,
        outputFormat: image.outputFormat,
        base64: image.base64,
        workspaceId: input.workspaceId,
        referencePaths: references.map((item) => item.relativePath),
        revisedPrompt: image.revisedPrompt,
        index,
      });
      if (input.saveToWorkspacePath) {
        const destination = await this.copyToWorkspace(record.path, input.workspaceRoot, input.saveToWorkspacePath, input.overwrite === true);
        record.workspacePath = destination.relativePath;
      }
      records.push(record);
    }
    this.writeIndex([...records, ...this.readIndex()]);
    return records;
  }

  async saveGeneratedImage(input: SaveGeneratedImageInput) {
    const { record, source } = this.resolveGeneratedImage(input);
    const destination = await this.copyToWorkspace(source, input.workspaceRoot, input.destinationPath, input.overwrite === true);
    return {
      record: record ? { ...record, workspacePath: destination.relativePath } : undefined,
      sourcePath: source,
      destinationPath: destination.absolutePath,
      workspacePath: destination.relativePath,
    };
  }

  async copyGeneratedImageToDownloads(input: GeneratedImageFileInput & { downloadsRoot: string }) {
    const { source } = this.resolveGeneratedImage(input);
    const dir = path.join(input.downloadsRoot, "Privora");
    await fsp.mkdir(dir, { recursive: true });
    const destination = uniqueFilePath(dir, path.basename(source));
    const bytes = await fsp.readFile(source);
    await atomicWriteBuffer(destination, bytes);
    return {
      path: destination,
      filename: path.basename(destination),
      sizeBytes: bytes.length,
    };
  }

  revealGeneratedImage(input: GeneratedImageFileInput) {
    return this.resolveGeneratedImage(input).source;
  }

  private async generateCliproxy(input: GenerateImageInput & {
    model: string;
    prompt: string;
    count: number;
    outputFormat: "png" | "jpeg" | "webp";
    references: ReferenceImage[];
  }) {
    const baseUrl = (input.cliproxyBaseUrl || "http://127.0.0.1:8317").replace(/\/$/, "");
    const endpoint = input.references.length > 0 ? "/v1/images/edits" : "/v1/images/generations";
    const body: Record<string, unknown> = {
      model: input.model,
      prompt: input.prompt,
      n: input.count,
      response_format: "b64_json",
      stream: false,
      output_format: input.outputFormat,
      size: normalizeSize(input.size),
      quality: input.quality || "auto",
    };
    if (input.references.length > 0) {
      body.images = input.references.map((image) => ({ image_url: image.dataUrl }));
    }
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer dummy-key",
      },
      body: JSON.stringify(body),
      signal: input.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(extractProviderError(data) || `CLIProxy image request failed with ${response.status}.`);
    }
    return extractOpenAIStyleImages(data, input.outputFormat);
  }

  private async generateGemini(input: GenerateImageInput & {
    model: string;
    prompt: string;
    count: number;
    outputFormat: "png" | "jpeg" | "webp";
    references: ReferenceImage[];
  }) {
    const apiKey = input.geminiApiKey || process.env.GEMINI_API_KEY || "";
    if (!apiKey) throw new Error("Gemini API key is not configured. Add it in Privora settings or set GEMINI_API_KEY.");
    const ai = new GoogleGenAI({ apiKey });
    const results: ProviderImageResult[] = [];
    for (let index = 0; index < input.count; index += 1) {
      if (input.signal.aborted) throw new DOMException("Aborted", "AbortError");
      const response = await ai.models.generateContent({
        model: input.model,
        contents: [{
          role: "user",
          parts: [
            { text: input.prompt },
            ...input.references.map((image) => ({
              inlineData: { mimeType: image.mimeType, data: image.base64 },
            })),
          ],
        }],
        config: {
          responseModalities: ["TEXT", "IMAGE"] as any,
        } as any,
      });
      results.push(...extractGeminiImages(response, input.outputFormat));
    }
    return results.slice(0, input.count);
  }

  private async loadReferenceImages(workspaceRoot: string, referencePaths: string[]) {
    const references: ReferenceImage[] = [];
    for (const requestedPath of referencePaths.slice(0, 8)) {
      const target = resolveExistingWorkspacePath(workspaceRoot, requestedPath);
      const mimeType = imageMimeType(target.absolutePath);
      if (!mimeType) throw new Error(`Unsupported reference image type: ${target.relativePath}`);
      const buffer = await fsp.readFile(target.absolutePath);
      references.push({
        relativePath: target.relativePath,
        absolutePath: target.absolutePath,
        mimeType,
        base64: buffer.toString("base64"),
        dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
      });
    }
    return references;
  }

  private async storeImage(input: {
    provider: ImageGenerationProvider;
    model: string;
    mode: "generate" | "edit";
    prompt: string;
    mimeType: string;
    outputFormat: "png" | "jpeg" | "webp";
    base64: string;
    workspaceId?: string;
    referencePaths: string[];
    revisedPrompt?: string;
    index: number;
  }): Promise<GeneratedImageRecord> {
    const buffer = Buffer.from(input.base64, "base64");
    const artifact = this.artifactStore.storeBuffer(buffer);
    const createdAt = Date.now();
    const id = randomUUID();
    const fileName = `${timestampSlug(createdAt)}-${slug(input.prompt)}-${input.index + 1}.${input.outputFormat === "jpeg" ? "jpg" : input.outputFormat}`;
    const targetDir = path.join(this.root, input.workspaceId || "global");
    await fsp.mkdir(targetDir, { recursive: true });
    const targetPath = path.join(targetDir, fileName);
    await atomicWriteBuffer(targetPath, buffer);
    return {
      id,
      provider: input.provider,
      model: input.model,
      mode: input.mode,
      prompt: input.prompt,
      path: targetPath,
      previewUrl: attachmentUrl(artifact.artifactId, input.mimeType),
      artifactId: artifact.artifactId,
      mimeType: input.mimeType,
      outputFormat: input.outputFormat,
      sizeBytes: artifact.sizeBytes,
      sha256: artifact.sha256,
      workspaceId: input.workspaceId,
      referencePaths: input.referencePaths,
      revisedPrompt: input.revisedPrompt,
      createdAt,
    };
  }

  private async copyToWorkspace(sourcePath: string, workspaceRoot: string, destinationPath: string, overwrite: boolean) {
    let destination = resolveWorkspacePath(workspaceRoot, destinationPath);
    if (fs.existsSync(destination.absolutePath) && !overwrite) {
      throw new Error(`Destination already exists: ${destination.relativePath}. Set overwrite=true to replace it.`);
    }
    await fsp.mkdir(path.dirname(destination.absolutePath), { recursive: true });
    destination = revalidateResolvedWorkspacePath(destination);
    const bytes = await fsp.readFile(sourcePath);
    await atomicWriteBuffer(destination.absolutePath, bytes);
    return destination;
  }

  private resolveGeneratedImage(input: GeneratedImageFileInput) {
    const record = input.id ? this.readIndex().find((item) => item.id === input.id) : undefined;
    const sourcePath = record?.path || input.sourcePath;
    if (!sourcePath) throw new Error("Provide generated image id or sourcePath.");
    const source = path.resolve(sourcePath);
    const root = path.resolve(this.root);
    const insideGeneratedRoot = source === root || source.startsWith(`${root}${path.sep}`);
    if (!insideGeneratedRoot) throw new Error("Only Privora-generated image files can be used here.");
    if (input.sourcePath && !record && !this.readIndex().some((item) => path.resolve(item.path) === source)) {
      throw new Error("Generated image sourcePath must match an indexed Privora-generated image record.");
    }
    if (!fs.existsSync(source)) throw new Error(`Generated image does not exist: ${source}`);
    return { record, source };
  }

  private readIndex(): GeneratedImageRecord[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.indexPath, "utf8")) as unknown;
      return Array.isArray(parsed) ? parsed.filter(isGeneratedImageRecord) : [];
    } catch {
      return [];
    }
  }

  private writeIndex(records: GeneratedImageRecord[]) {
    fs.mkdirSync(this.root, { recursive: true });
    const deduped = new Map<string, GeneratedImageRecord>();
    records.forEach((record) => deduped.set(record.id, record));
    const next = Array.from(deduped.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 500);
    atomicWriteFileSync(this.indexPath, JSON.stringify(next, null, 2), "utf8");
  }
}

interface ReferenceImage {
  relativePath: string;
  absolutePath: string;
  mimeType: string;
  base64: string;
  dataUrl: string;
}

interface ProviderImageResult {
  base64: string;
  mimeType: string;
  outputFormat: "png" | "jpeg" | "webp";
  revisedPrompt?: string;
}

const normalizeProvider = (provider: unknown): ImageGenerationProvider =>
  String(provider || "cliproxy").toLowerCase() === "gemini" ? "gemini" : "cliproxy";

const normalizeImageModel = (provider: ImageGenerationProvider, model: unknown) => {
  const value = String(model || "").trim();
  if (provider === "gemini") {
    if (!value || value === "gemini-3.1-flash-image-preview" || /nano[- ]?banana[- ]?2/i.test(value)) {
      return DEFAULT_GEMINI_IMAGE_MODEL;
    }
    return value;
  }
  return value || DEFAULT_CLIPROXY_MODEL;
};

const normalizeOutputFormat = (value: unknown): "png" | "jpeg" | "webp" => {
  const format = String(value || "png").toLowerCase();
  if (format === "jpg" || format === "jpeg") return "jpeg";
  if (format === "webp") return "webp";
  return "png";
};

const normalizeSize = (value: unknown) => {
  const size = String(value || "1024x1024").trim();
  if (/^\d{3,4}x\d{3,4}$/.test(size) || /^(auto|1K|2K|4K)$/i.test(size)) return size;
  return "1024x1024";
};

const imageMimeType = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "";
};

const mimeToFormat = (mimeType: string): "png" | "jpeg" | "webp" => {
  if (/webp/i.test(mimeType)) return "webp";
  if (/jpe?g/i.test(mimeType)) return "jpeg";
  return "png";
};

const extractOpenAIStyleImages = (data: unknown, fallbackFormat: "png" | "jpeg" | "webp"): ProviderImageResult[] => {
  const root = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const items = Array.isArray(root.data) ? root.data : Array.isArray(root.output) ? root.output : [];
  return items.flatMap((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const base64 = typeof record.b64_json === "string"
      ? record.b64_json
      : typeof record.result === "string" ? stripDataUrl(record.result) : "";
    if (!base64) return [];
    const outputFormat = normalizeOutputFormat(record.output_format || fallbackFormat);
    const mimeType = typeof record.mime_type === "string" ? record.mime_type : `image/${outputFormat === "jpeg" ? "jpeg" : outputFormat}`;
    return [{
      base64,
      mimeType,
      outputFormat,
      revisedPrompt: typeof record.revised_prompt === "string" ? record.revised_prompt : undefined,
    }];
  });
};

const extractGeminiImages = (response: unknown, fallbackFormat: "png" | "jpeg" | "webp"): ProviderImageResult[] => {
  const root = response && typeof response === "object" ? response as Record<string, any> : {};
  const parts = root.candidates?.[0]?.content?.parts || root.parts || [];
  return parts.flatMap((part: any) => {
    const inlineData = part?.inlineData || part?.inline_data;
    const base64 = inlineData?.data;
    if (!base64) return [];
    const mimeType = inlineData?.mimeType || inlineData?.mime_type || `image/${fallbackFormat === "jpeg" ? "jpeg" : fallbackFormat}`;
    return [{ base64, mimeType, outputFormat: mimeToFormat(mimeType) }];
  });
};

const stripDataUrl = (value: string) =>
  value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;

const extractProviderError = (data: unknown): string => {
  const root = data && typeof data === "object" ? data as Record<string, any> : {};
  return root.error?.message || root.message || root.error || "";
};

const timestampSlug = (value: number) => {
  const date = new Date(value);
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");
};

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "image";

const atomicWriteBuffer = async (targetPath: string, buffer: Uint8Array) => {
  await atomicWriteFile(targetPath, buffer);
};

const uniqueFilePath = (dir: string, filename: string) => {
  const parsed = path.parse(filename);
  let candidate = path.join(dir, filename);
  let index = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${parsed.name}-${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
};

const attachmentUrl = (artifactId: string, mimeType: string) =>
  `privora-attachment://artifact/${encodeURIComponent(artifactId)}?mime=${encodeURIComponent(mimeType)}`;

const isGeneratedImageRecord = (value: unknown): value is GeneratedImageRecord => {
  const record = value && typeof value === "object" ? value as Partial<GeneratedImageRecord> : {};
  return typeof record.id === "string" &&
    typeof record.path === "string" &&
    typeof record.previewUrl === "string" &&
    typeof record.prompt === "string" &&
    typeof record.createdAt === "number";
};

const resolveDefaultUserDataPath = () => {
  try {
    return app?.getPath?.("userData") || path.join(os.tmpdir(), "privora-desktop-test");
  } catch {
    return path.join(os.tmpdir(), "privora-desktop-test");
  }
};
