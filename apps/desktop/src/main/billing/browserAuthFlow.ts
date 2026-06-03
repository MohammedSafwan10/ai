import crypto from "node:crypto";
import http from "node:http";
import type { DesktopStore } from "../db/store";
import type { PrivoraBrowserAuthStartRecord } from "../../shared/types";

const AUTH_STATE_BYTES = 32;
const AUTH_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_CALLBACK_BODY_BYTES = 16 * 1024;
const DEFAULT_WEB_BASE_URL = "https://privora.nexdark.com";
const LOCAL_WEB_BASE_URLS = ["http://localhost:3002", "http://localhost:3001", "http://localhost:3000"];
let activeLoopbackServer: http.Server | null = null;
let activeLoopbackTimer: NodeJS.Timeout | null = null;

const normalizeWebBaseUrl = (value: string | undefined) => {
  const fallback = DEFAULT_WEB_BASE_URL;
  try {
    const parsed = new URL(value || fallback);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") return fallback;
    parsed.pathname = "/";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return fallback;
  }
};

const secureEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const isDesktopDevMode = () =>
  process.env.PRIVORA_DESKTOP_DEV === "1" ||
  process.env.NODE_ENV === "development" ||
  process.defaultApp === true;

const canReachWebBaseUrl = async (baseUrl: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 500);
  try {
    const response = await fetch(baseUrl, {
      method: "GET",
      signal: controller.signal,
    });
    return response.ok || response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const resolveWebBaseUrl = async () => {
  if (process.env.PRIVORA_WEB_BASE_URL) return normalizeWebBaseUrl(process.env.PRIVORA_WEB_BASE_URL);
  if (isDesktopDevMode()) {
    for (const candidate of LOCAL_WEB_BASE_URLS) {
      if (await canReachWebBaseUrl(candidate)) return normalizeWebBaseUrl(candidate);
    }
  }
  return DEFAULT_WEB_BASE_URL;
};

const isLocalWebBaseUrl = (baseUrl: string) => {
  try {
    const parsed = new URL(baseUrl);
    return parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  } catch {
    return false;
  }
};

export const closePrivoraBrowserAuthServer = () => {
  if (activeLoopbackTimer) {
    clearTimeout(activeLoopbackTimer);
    activeLoopbackTimer = null;
  }
  activeLoopbackServer?.close();
  activeLoopbackServer = null;
};

const readRequestBody = async (request: http.IncomingMessage) => {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_CALLBACK_BODY_BYTES) throw new Error("Callback body is too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
};

const sendJson = (response: http.ServerResponse, status: number, body: Record<string, unknown>) => {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(body));
};

export interface PrivoraDesktopAuthToken {
  userId: string;
  secret: string;
  expiresAt: number;
  email?: string;
  name?: string;
}

const validatePrivoraDesktopAuthToken = (input: Partial<PrivoraDesktopAuthToken>): PrivoraDesktopAuthToken => {
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  const secret = typeof input.secret === "string" ? input.secret.trim() : "";
  const expiresAt = typeof input.expiresAt === "number" ? input.expiresAt : 0;
  if (!userId || !secret || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error("Privora desktop authentication token is invalid or expired.");
  }
  return {
    userId,
    secret,
    expiresAt,
    email: typeof input.email === "string" ? input.email.trim() : undefined,
    name: typeof input.name === "string" ? input.name.trim() : undefined,
  };
};

export const decodePrivoraDesktopAuthCode = (code: string): PrivoraDesktopAuthToken => {
  if (!code || code.length > 4096) throw new Error("Privora sign-in callback did not include a valid code.");
  const normalized = code.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Partial<PrivoraDesktopAuthToken>;
  return validatePrivoraDesktopAuthToken(parsed);
};

const validatePendingState = (store: DesktopStore, state: string) => {
  const pending = store.getPrivoraPendingAuth();
  if (!pending) throw new Error("No pending Privora sign-in was found.");
  if (Date.now() - pending.createdAt > AUTH_STATE_TTL_MS) {
    store.clearPrivoraPendingAuth();
    throw new Error("Privora sign-in expired. Start sign-in from Privora Desktop again.");
  }
  if (!state || !secureEqual(state, pending.state)) throw new Error("Privora sign-in could not be verified.");
};

const startLoopbackCallbackServer = async (
  store: DesktopStore,
  onToken: (token: PrivoraDesktopAuthToken) => Promise<void>,
) => {
  closePrivoraBrowserAuthServer();

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "OPTIONS") {
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method !== "POST" || request.url?.split("?")[0] !== "/auth/callback") {
        sendJson(response, 404, { ok: false, error: "Not found." });
        return;
      }

      const rawBody = await readRequestBody(request);
      const parsed = JSON.parse(rawBody || "{}") as {
        state?: unknown;
        userId?: unknown;
        secret?: unknown;
        expiresAt?: unknown;
        email?: unknown;
        name?: unknown;
      };
      const state = typeof parsed.state === "string" ? parsed.state : "";
      validatePendingState(store, state);
      await onToken(validatePrivoraDesktopAuthToken({
        userId: typeof parsed.userId === "string" ? parsed.userId.trim() : "",
        secret: typeof parsed.secret === "string" ? parsed.secret.trim() : "",
        expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0,
        email: typeof parsed.email === "string" ? parsed.email.trim() : undefined,
        name: typeof parsed.name === "string" ? parsed.name.trim() : undefined,
      }));
      sendJson(response, 200, { ok: true, message: "Privora Desktop is connected." });
      closePrivoraBrowserAuthServer();
    } catch (error) {
      sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : "Privora sign-in failed." });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  activeLoopbackServer = server;
  activeLoopbackTimer = setTimeout(closePrivoraBrowserAuthServer, AUTH_STATE_TTL_MS);
  activeLoopbackTimer.unref?.();
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start Privora Desktop callback server.");
  return `http://127.0.0.1:${address.port}/auth/callback`;
};

export const beginPrivoraBrowserAuth = async (
  store: DesktopStore,
  options: { onToken?: (token: PrivoraDesktopAuthToken) => Promise<void> } = {},
): Promise<PrivoraBrowserAuthStartRecord> => {
  const state = crypto.randomBytes(AUTH_STATE_BYTES).toString("base64url");
  const createdAt = Date.now();
  const webBaseUrl = await resolveWebBaseUrl();
  const callbackUrl = options.onToken && isLocalWebBaseUrl(webBaseUrl)
    ? await startLoopbackCallbackServer(store, options.onToken)
    : "";
  const url = new URL("/desktop/connect", webBaseUrl);
  url.searchParams.set("state", state);
  url.searchParams.set("source", "desktop");
  if (callbackUrl) url.searchParams.set("callback", callbackUrl);
  store.setPrivoraPendingAuth(state, createdAt);
  return {
    url: url.toString(),
    expiresAt: createdAt + AUTH_STATE_TTL_MS,
  };
};

export interface PrivoraCallbackResult {
  ok: boolean;
  message: string;
  code?: string;
}

export const parsePrivoraAuthCallback = (store: DesktopStore, rawUrl: string): PrivoraCallbackResult | null => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== "privora:" || parsed.hostname !== "auth" || parsed.pathname !== "/callback") return null;

  const pending = store.getPrivoraPendingAuth();
  if (!pending) {
    return { ok: false, message: "No pending Privora sign-in was found. Start sign-in from Privora Desktop again." };
  }

  if (Date.now() - pending.createdAt > AUTH_STATE_TTL_MS) {
    store.clearPrivoraPendingAuth();
    return { ok: false, message: "Privora sign-in expired. Start sign-in from Privora Desktop again." };
  }

  const state = parsed.searchParams.get("state") || "";
  const code = parsed.searchParams.get("code") || "";

  if (!state || !secureEqual(state, pending.state)) {
    return { ok: false, message: "Privora sign-in could not be verified. Start sign-in from Privora Desktop again." };
  }

  if (!code || code.length > 2048) {
    return { ok: false, message: "Privora sign-in callback did not include a valid code." };
  }

  store.clearPrivoraPendingAuth();

  return {
    ok: true,
    code,
    message: "Privora sign-in callback verified. The backend code exchange is the next step.",
  };
};
