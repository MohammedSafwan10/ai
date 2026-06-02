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
  onJwt: (jwt: string, expiresAt: number, profile: { email?: string; name?: string }) => Promise<void>,
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
        jwt?: unknown;
        expiresAt?: unknown;
        email?: unknown;
        name?: unknown;
      };
      const state = typeof parsed.state === "string" ? parsed.state : "";
      const jwt = typeof parsed.jwt === "string" ? parsed.jwt.trim() : "";
      const expiresAt = typeof parsed.expiresAt === "number" ? parsed.expiresAt : Date.now() + 55 * 60 * 1000;
      const email = typeof parsed.email === "string" ? parsed.email.trim() : "";
      const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
      validatePendingState(store, state);
      if (!jwt || jwt.length > 4096) throw new Error("Privora sign-in did not include a valid account token.");
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error("Privora sign-in token is expired.");

      await onJwt(jwt, expiresAt, { email, name });
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
  options: { onJwt?: (jwt: string, expiresAt: number, profile: { email?: string; name?: string }) => Promise<void> } = {},
): Promise<PrivoraBrowserAuthStartRecord> => {
  const state = crypto.randomBytes(AUTH_STATE_BYTES).toString("base64url");
  const createdAt = Date.now();
  const webBaseUrl = await resolveWebBaseUrl();
  const callbackUrl = options.onJwt && isLocalWebBaseUrl(webBaseUrl)
    ? await startLoopbackCallbackServer(store, options.onJwt)
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
