import type {
  ChatMessageRecord,
  PendingResearchIntentRecord,
  ResearchActivityRecord,
  ResearchPlanRecord,
  ResearchPlanStepStatus,
  ResearchSourceRecord,
  ResearchStatus,
} from "../db";
import type { ProviderId } from "../models";
import type { ResponseStyleId } from "../prompt";

export interface ResearchJobRequest {
  model: string;
  provider: ProviderId;
  styleId: ResponseStyleId;
  history: ChatMessageRecord[];
  systemInstruction: string;
  timeBudgetMs: number;
  plan?: ResearchPlanRecord;
}

export type ResearchPreflightDecision = "normal" | "clarify" | "ready";

export interface ResearchPreflightRequest {
  model: string;
  provider: ProviderId;
  styleId: ResponseStyleId;
  history: ChatMessageRecord[];
  pendingIntent?: PendingResearchIntentRecord;
  instruction: string;
}

export interface ResearchPreflightResult {
  decision: ResearchPreflightDecision;
  assistantMessage?: string;
  questions?: string[];
  plan?: Pick<ResearchPlanRecord, "title" | "refinedPrompt"> & { steps: string[] };
  refinedPrompt?: string;
  confidence?: number;
}

export type ResearchStreamEvent =
  | { type: "status"; status: ResearchStatus; message?: string }
  | { type: "activity"; activity: ResearchActivityRecord }
  | { type: "planStep"; index: number; status: ResearchPlanStepStatus; message?: string }
  | { type: "sources"; sources: ResearchSourceRecord[] }
  | { type: "text"; text: string }
  | { type: "completed"; text: string; sources?: ResearchSourceRecord[] }
  | { type: "stopped"; text?: string; sources?: ResearchSourceRecord[] }
  | { type: "error"; error: string };

export interface ResearchJobSnapshot {
  jobId: string;
  completed: boolean;
  cancelled: boolean;
  text: string;
  sources: ResearchSourceRecord[];
  events: ResearchStreamEvent[];
}

export const startResearchJob = async (request: ResearchJobRequest) => {
  const response = await fetch("/api/research/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || `Research job failed to start with ${response.status}`);
  }

  return (await response.json()) as { jobId: string };
};

export const runResearchPreflight = async (request: ResearchPreflightRequest) => {
  const response = await fetch("/api/research/preflight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || `Research preflight failed with ${response.status}`);
  }

  return (await response.json()) as ResearchPreflightResult;
};

export const cancelResearchJob = async (jobId: string) => {
  await fetch(`/api/research/jobs/${jobId}/cancel`, { method: "POST" }).catch(() => undefined);
};

export const getResearchJobSnapshot = async (jobId: string) => {
  const response = await fetch(`/api/research/jobs/${jobId}`);

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || `Research job lookup failed with ${response.status}`);
  }

  return (await response.json()) as ResearchJobSnapshot;
};

export async function streamResearchJob({
  jobId,
  signal,
  onEvent,
}: {
  jobId: string;
  signal: AbortSignal;
  onEvent: (event: ResearchStreamEvent) => void;
}) {
  const response = await fetch(`/api/research/jobs/${jobId}/stream`, { signal });

  if (!response.ok || !response.body) {
    const errorBody = await response.json().catch(() => null);
    throw new Error(errorBody?.error || `Research stream failed with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flushLine = (line: string) => {
    if (!line.trim()) return;
    onEvent(JSON.parse(line) as ResearchStreamEvent);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(flushLine);
  }

  if (buffer.trim()) {
    flushLine(buffer);
  }
}
