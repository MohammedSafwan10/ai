export const KALI_PROTOCOL_VERSION = 1;

export type KaliJobState =
  | "queued" | "running" | "stop_requested" | "succeeded"
  | "failed" | "cancelled" | "timed_out" | "unknown";

// Main-process configuration only. Never contains private key contents.
export interface KaliEnvironment {
  id: string;
  host: string;
  port: number;
  username: string;
  identityFile: string;
  knownHostsFile: string;
  hostFingerprint: string;
  runnerPath: string;
  jobRoot: string;
  sshExecutable?: string;
}

export interface KaliJobRequest {
  idempotencyKey: string;
  projectId: string;
  argv: string[];
  cwd?: string;
  timeoutSeconds?: number;
}

export interface KaliJob {
  id: string;
  projectId: string;
  state: KaliJobState;
  exitCode: number | null;
  error: string | null;
  createdAt: number;
  outputBytes: number;
  omittedBytes: number;
}

export interface KaliOutputEvent {
  sequence: number;
  stream: "stdout" | "stderr";
  data: string; // Base64 bytes; decode each stream incrementally, not per chunk.
}

export interface KaliOutputPage {
  job: KaliJob;
  events: KaliOutputEvent[];
  nextSequence: number;
  hasMore: boolean;
}

export interface KaliCapabilities {
  protocolVersion: number;
  os: string;
  architecture: string;
  pythonVersion: string;
  jobRoot: string;
  tools: Record<string, string | null>;
  limits: { concurrentJobs: number; outputBytes: number; artifactBytes: number };
}

export interface KaliArtifact {
  path: string;
  size: number;
  sha256: string;
  data: string;
}
