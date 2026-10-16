import { ProviderStreamError } from "./streamOutcome";

export class ProviderRequestError extends Error {
  readonly retryAfterMs?: number;
  constructor(message: string, public readonly status: number, retryAfter: string | null = null) {
    super(message);
    if (retryAfter) {
      const seconds = Number(retryAfter);
      const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
      if (Number.isFinite(delay)) this.retryAfterMs = Math.max(0, delay);
    }
  }
}

export function providerRetryDelay(error: unknown, retries: number, random = Math.random): number | null {
  if (retries >= 2) return null;
  const transient = error instanceof ProviderRequestError
    ? [408, 429, 500, 502, 503, 504].includes(error.status)
    : error instanceof ProviderStreamError ? error.outcome.status === "interrupted" && error.outcome.reason === "missing_finish"
    : error instanceof TypeError && /fetch failed|failed to fetch|network error|terminated/i.test(error.message);
  if (!transient) return null;
  const requested = error instanceof ProviderRequestError ? error.retryAfterMs || 0 : 0;
  // Long cooldowns are surfaced to the operator rather than silently shortened.
  if (requested > 30_000) return null;
  return Math.max(requested, Math.round(1000 * 2 ** retries * (0.8 + random() * 0.4)));
}

/** Classify explicit stream errors without retaining provider payloads or secrets. */
export function providerEventError(data: any, event?: string): ProviderRequestError | undefined {
  const type = data?.type || event;
  if (!data?.error && type !== "response.failed" && type !== "error") return;
  const error = data?.error || data?.response?.error || {};
  const code = String(error.code || error.type || "").toLowerCase();
  const numeric = Number(error.status || error.status_code || error.code);
  const status = code === "insufficient_quota" ? 402
    : code === "rate_limit_exceeded" || code === "rate_limit_error" ? 429
    : code === "overloaded_error" ? 503
    : code === "server_error" || code === "api_error" ? 500
    : Number.isFinite(numeric) && numeric >= 400 && numeric <= 599 ? numeric : 400;
  return new ProviderRequestError(`Provider stream request failed (HTTP ${status}).`, status);
}

export function waitForProviderRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason || new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, delayMs);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
