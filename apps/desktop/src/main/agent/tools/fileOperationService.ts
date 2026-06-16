import crypto from "node:crypto";
import fs from "node:fs/promises";
import { TextDecoder } from "node:util";
import { resolveExistingWorkspacePath, resolveWorkspacePath, type ResolvedWorkspacePath } from "../../security/pathSandbox";

const DEFAULT_MAX_BYTES = 120_000;
const BINARY_SAMPLE_BYTES = 8_000;

export interface FileSnapshot {
  target: ResolvedWorkspacePath;
  exists: boolean;
  sizeBytes: number;
  sha256: string | null;
  modifiedAtMs: number;
  binary: boolean;
  encoding: "utf8" | "binary";
  content: string;
  totalLines: number;
  nonEmptyLines: number;
  endsWithNewline: boolean;
}

export interface ReadTextOptions {
  maxBytes?: number;
  startLine?: number;
  endLine?: number;
  withLineNumbers?: boolean;
  encoding?: "utf8" | "base64";
}

export interface ReadTextResult {
  output: string;
  data: Record<string, unknown>;
  snapshot: FileSnapshot;
}

export interface FileChangeMetadata {
  path: string;
  oldPath?: string;
  status: "created" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  beforeHash: string | null;
  afterHash: string | null;
  sizeBytes: number;
}

export class FileOperationService {
  resolve(workspaceRoot: string, userPath: string) {
    return resolveWorkspacePath(workspaceRoot, userPath);
  }

  resolveExisting(workspaceRoot: string, userPath: string) {
    return resolveExistingWorkspacePath(workspaceRoot, userPath);
  }

  async snapshot(workspaceRoot: string, userPath: string): Promise<FileSnapshot> {
    const target = resolveExistingWorkspacePath(workspaceRoot, userPath);
    const stat = await fs.stat(target.absolutePath);
    if (!stat.isFile()) {
      throw new Error(`${target.relativePath} is not a file.`);
    }
    const sample = await readSample(target.absolutePath);
    const binary = isLikelyBinary(sample, target.relativePath);
    if (binary) {
      return {
        target,
        exists: true,
        sizeBytes: stat.size,
        sha256: await hashFile(target.absolutePath),
        modifiedAtMs: stat.mtimeMs,
        binary: true,
        encoding: "binary",
        content: "",
        totalLines: 0,
        nonEmptyLines: 0,
        endsWithNewline: false,
      };
    }
    const content = await fs.readFile(target.absolutePath, "utf8");
    return {
      target,
      exists: true,
      sizeBytes: stat.size,
      sha256: hashText(content),
      modifiedAtMs: stat.mtimeMs,
      binary: false,
      encoding: "utf8",
      content,
      totalLines: countLines(content),
      nonEmptyLines: countNonEmptyLines(content),
      endsWithNewline: content.endsWith("\n"),
    };
  }

  async maybeSnapshot(workspaceRoot: string, userPath: string): Promise<FileSnapshot | null> {
    try {
      return await this.snapshot(workspaceRoot, userPath);
    } catch (error) {
      if (isPathNotFound(error)) return null;
      throw error;
    }
  }

  async readText(workspaceRoot: string, userPath: string, options: ReadTextOptions = {}): Promise<ReadTextResult> {
    const snapshot = await this.snapshot(workspaceRoot, userPath);
    if (options.encoding === "base64") {
      const buffer = await fs.readFile(snapshot.target.absolutePath);
      const maxBytes = positiveNumber(options.maxBytes);
      const limited = maxBytes ? buffer.subarray(0, maxBytes) : buffer;
      const truncated = limited.length < buffer.length;
      return {
        output: limited.toString("base64") + (truncated ? `\n\n[File truncated at ${maxBytes} bytes before base64 encoding.]` : ""),
        snapshot,
        data: snapshotData(snapshot, {
          encoding: "base64",
          truncated,
          truncatedBecauseSize: truncated,
          truncatedBecauseRange: false,
          rangeLimited: false,
          lineStart: null,
          lineEnd: null,
        }),
      };
    }

    if (snapshot.binary) {
      return {
        output: `[Binary file not shown: ${snapshot.target.relativePath}]`,
        snapshot,
        data: snapshotData(snapshot, {
          encoding: "binary",
          truncated: false,
          truncatedBecauseSize: false,
          truncatedBecauseRange: false,
          rangeLimited: false,
          lineStart: null,
          lineEnd: null,
        }),
      };
    }

    const maxBytes = positiveNumber(options.maxBytes) || DEFAULT_MAX_BYTES;
    const lines = splitLines(snapshot.content);
    const startLine = clampLine(options.startLine, 1, Math.max(lines.length, 1), 1);
    const endLine = clampLine(options.endLine, startLine, Math.max(lines.length, startLine), Math.max(lines.length, startLine));
    const ranged = lines.slice(startLine - 1, endLine);
    const rendered = options.withLineNumbers === true
      ? ranged.map((line, index) => `${startLine + index}: ${line}`).join("\n")
      : ranged.join("\n");
    const limited = limitUtf8(rendered, maxBytes);
    const rangeTruncated = startLine > 1 || endLine < lines.length;
    return {
      output: limited.text + (limited.truncated ? `\n\n[File truncated at ${maxBytes} bytes.]` : ""),
      snapshot,
      data: snapshotData(snapshot, {
        encoding: "utf8",
        truncated: limited.truncated,
        truncatedBecauseSize: limited.truncated,
        truncatedBecauseRange: rangeTruncated,
        rangeLimited: rangeTruncated,
        lineStart: startLine,
        lineEnd: endLine,
      }),
    };
  }
}

export const hashText = (content: string) =>
  crypto.createHash("sha256").update(content, "utf8").digest("hex");

export const hashBuffer = (content: Buffer) =>
  crypto.createHash("sha256").update(content).digest("hex");

export const createMissingFileSnapshot = (target: ResolvedWorkspacePath): FileSnapshot => ({
  target,
  exists: false,
  sizeBytes: 0,
  sha256: null,
  modifiedAtMs: 0,
  binary: false,
  encoding: "utf8",
  content: "",
  totalLines: 0,
  nonEmptyLines: 0,
  endsWithNewline: false,
});

export const changeMetadata = (input: {
  path: string;
  oldPath?: string;
  status: FileChangeMetadata["status"];
  before: string;
  after: string;
  additions: number;
  deletions: number;
}): FileChangeMetadata => ({
  path: normalizePath(input.path),
  oldPath: input.oldPath ? normalizePath(input.oldPath) : undefined,
  status: input.status,
  additions: input.additions,
  deletions: input.deletions,
  beforeHash: input.before ? hashText(input.before) : null,
  afterHash: input.after ? hashText(input.after) : null,
  sizeBytes: Buffer.byteLength(input.after, "utf8"),
});

export const hashMatches = (expected: unknown, actual: string | null) =>
  typeof expected === "string" && expected.length > 0 && actual !== expected;

export class StaleFileError extends Error {
  readonly code = "STALE_FILE";

  constructor(
    readonly path: string,
    readonly reason: string,
    readonly expectedHash: string | null,
    readonly actualHash: string | null,
  ) {
    super(`${path} is stale: ${reason}. Read the file again and retry with the current contents.`);
  }
}

export const isStaleFileError = (error: unknown): error is StaleFileError =>
  error instanceof StaleFileError;

interface ObservedFileState {
  sizeBytes: number;
  modifiedAtMs: number;
  sha256: string | null;
}

const observedFiles = new Map<string, ObservedFileState>();

export const recordFileObservation = (workspaceRoot: string, snapshot: FileSnapshot) => {
  observedFiles.set(observationKey(workspaceRoot, snapshot.target.relativePath), {
    sizeBytes: snapshot.sizeBytes,
    modifiedAtMs: snapshot.modifiedAtMs,
    sha256: snapshot.sha256,
  });
};

export const recordFileObservationData = (
  workspaceRoot: string,
  relativePath: string,
  state: { sizeBytes: number; modifiedAtMs: number; sha256?: string | null },
) => {
  observedFiles.set(observationKey(workspaceRoot, relativePath), {
    sizeBytes: state.sizeBytes,
    modifiedAtMs: state.modifiedAtMs,
    sha256: state.sha256 ?? null,
  });
};

export const assertFreshFileState = (
  workspaceRoot: string,
  relativePath: string,
  snapshot: FileSnapshot | null,
  expectedHash?: unknown,
  expectedLabel = "expectedPreviousHash",
) => {
  const normalizedPath = normalizePath(relativePath);
  if (hashMatches(expectedHash, snapshot?.sha256 ?? null)) {
    throw new StaleFileError(
      normalizedPath,
      `${expectedLabel} does not match the current sha256`,
      String(expectedHash),
      snapshot?.sha256 ?? null,
    );
  }

  const observed = observedFiles.get(observationKey(workspaceRoot, snapshot?.target.relativePath || normalizedPath));
  if (!snapshot) {
    if (observed) {
      throw new StaleFileError(
        normalizedPath,
        "file was removed after Privora observed it",
        observed.sha256,
        null,
      );
    }
    return;
  }
  if (!observed) return;
  const changed = observed.sizeBytes !== snapshot.sizeBytes ||
    observed.modifiedAtMs !== snapshot.modifiedAtMs ||
    (observed.sha256 !== null && snapshot.sha256 !== null && observed.sha256 !== snapshot.sha256);
  if (changed) {
    throw new StaleFileError(
      snapshot.target.relativePath,
      "file changed since Privora last observed it",
      observed.sha256,
      snapshot.sha256,
    );
  }
};

const snapshotData = (
  snapshot: FileSnapshot,
  extra: {
    encoding: "utf8" | "binary" | "base64";
    truncated: boolean;
    truncatedBecauseSize: boolean;
    truncatedBecauseRange: boolean;
    rangeLimited: boolean;
    lineStart: number | null;
    lineEnd: number | null;
  },
) => ({
  path: snapshot.target.relativePath,
  sizeBytes: snapshot.sizeBytes,
  sha256: snapshot.sha256,
  modifiedAtMs: snapshot.modifiedAtMs,
  encoding: extra.encoding,
  binary: snapshot.binary,
  totalLines: snapshot.totalLines,
  nonEmptyLines: snapshot.nonEmptyLines,
  endsWithNewline: snapshot.endsWithNewline,
  truncated: extra.truncated,
  truncatedBecauseSize: extra.truncatedBecauseSize,
  truncatedBecauseRange: extra.truncatedBecauseRange,
  rangeLimited: extra.rangeLimited,
  lineStart: extra.lineStart,
  lineEnd: extra.lineEnd,
});

const hashFile = async (filePath: string) => {
  const buffer = await fs.readFile(filePath);
  return hashBuffer(buffer);
};

const readSample = async (filePath: string) => {
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(BINARY_SAMPLE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, BINARY_SAMPLE_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const binaryExtensions = new Set([
  ".7z", ".avi", ".bin", ".bmp", ".class", ".dat", ".db", ".dll", ".dmg", ".doc",
  ".docx", ".exe", ".gif", ".gz", ".ico", ".jar", ".jpeg", ".jpg", ".mov", ".mp3",
  ".mp4", ".otf", ".pdf", ".png", ".sqlite", ".tar", ".ttf", ".wasm", ".webm",
  ".webp", ".woff", ".woff2", ".xls", ".xlsx", ".zip",
]);

const isLikelyBinary = (buffer: Buffer, filePath: string) => {
  if (buffer.length === 0) return false;
  const extension = filePath.toLowerCase().match(/\.[^.\\/]+$/)?.[0];
  if (extension && binaryExtensions.has(extension)) return true;
  if (buffer.includes(0)) return true;
  if (
    (buffer[0] === 0xff && buffer[1] === 0xfe) ||
    (buffer[0] === 0xfe && buffer[1] === 0xff)
  ) {
    return true;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return true;
  }
  let suspiciousControls = 0;
  for (const byte of buffer) {
    const allowed = byte === 0x09 || byte === 0x0a || byte === 0x0c || byte === 0x0d || byte === 0x1b;
    if (byte < 0x20 && !allowed) suspiciousControls += 1;
  }
  return suspiciousControls / buffer.length > 0.08;
};

const countLines = (content: string) => {
  if (!content) return 0;
  return content.replace(/\r\n/g, "\n").split("\n").length;
};

const countNonEmptyLines = (content: string) =>
  content.replace(/\r\n/g, "\n").split("\n").filter((line) => line.trim().length > 0).length;

const splitLines = (content: string) =>
  content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

const positiveNumber = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const clampLine = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = positiveNumber(value);
  if (!parsed) return value === undefined || value === null ? fallback : min;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const limitUtf8 = (text: string, maxBytes: number) => {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= maxBytes) return { text, truncated: false };
  return { text: Buffer.from(text, "utf8").subarray(0, maxBytes).toString("utf8"), truncated: true };
};

const normalizePath = (value: string) => value.replace(/\\/g, "/");

const observationKey = (workspaceRoot: string, relativePath: string) =>
  `${workspaceRoot}::${normalizePath(relativePath)}`;

const isPathNotFound = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "PATH_NOT_FOUND";
