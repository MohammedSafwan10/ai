import { session, shell, type WebContents } from "electron";

export type BrowserControlScope = "user" | "agent";

const SAFE_LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const BLOCKED_SCHEMES = new Set(["file:", "javascript:", "data:", "vbscript:", "about:"]);
const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-auth-token",
  "proxy-authorization",
]);

export interface BrowserOriginDecision {
  allowed: boolean;
  local: boolean;
  origin: string;
  reason?: string;
}

export const normalizeBrowserUrl = (rawUrl: string): string => {
  const trimmed = rawUrl.trim();
  if (!trimmed) throw new Error("URL is required.");
  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z\d+\-.]*):/);
  const schemeTail = schemeMatch ? trimmed.slice(schemeMatch[0].length) : "";
  const explicitScheme = Boolean(schemeMatch && !/^\d+(?:[/?#]|$)/.test(schemeTail));
  if (!explicitScheme && !looksLikeUrlInput(trimmed)) {
    return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
  }
  const withProtocol = explicitScheme
    ? trimmed
    : `http://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (BLOCKED_SCHEMES.has(parsed.protocol)) {
    throw new Error(`${parsed.protocol} URLs cannot be opened in Privora Browser.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Privora Browser supports http and https URLs.");
  }
  return parsed.toString();
};

const looksLikeUrlInput = (value: string) =>
  value.includes(".") ||
  value.includes(":") ||
  value.startsWith("localhost") ||
  value.startsWith("[::1]") ||
  /^\d{1,3}(?:\.\d{1,3}){3}(?:[/:?#]|$)/.test(value);

export const isLocalBrowserUrl = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && SAFE_LOCAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
};

export const shouldRestorePersistedBrowserUrl = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") && !SAFE_LOCAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
};

export const browserOriginDecision = (rawUrl: string, scope: BrowserControlScope): BrowserOriginDecision => {
  const url = normalizeBrowserUrl(rawUrl);
  const parsed = new URL(url);
  const local = SAFE_LOCAL_HOSTS.has(parsed.hostname);
  if (scope === "user" || local) {
    return { allowed: true, local, origin: parsed.origin };
  }
  return {
    allowed: false,
    local,
    origin: parsed.origin,
    reason: `Agent browser control for ${parsed.origin} needs approval. Open or interact with localhost apps directly.`,
  };
};

export const installBrowserSessionSecurity = (partition: string) => {
  const browserSession = session.fromPartition(partition);
  browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.webRequest.onBeforeRequest((details, callback) => {
    const blocked = details.url.startsWith("file:") ||
      details.url.startsWith("javascript:") ||
      details.url.startsWith("data:");
    callback({ cancel: blocked });
  });
  browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: redactHeaders(details.requestHeaders) });
  });
  browserSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: redactResponseHeaders(details.responseHeaders) });
  });
  return browserSession;
};

export const installBrowserWebContentsSecurity = (contents: WebContents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    try {
      normalizeBrowserUrl(url);
    } catch {
      event.preventDefault();
    }
  });
};

export const redactHeaders = <T extends Record<string, string | string[] | undefined>>(headers: T): T => {
  const next = { ...headers };
  Object.keys(next).forEach((name) => {
    if (SENSITIVE_HEADER_NAMES.has(name.toLowerCase())) next[name as keyof T] = "[redacted]" as T[keyof T];
  });
  return next;
};

const redactResponseHeaders = <T extends Record<string, string[] | undefined>>(headers: T | undefined): T | undefined => {
  if (!headers) return headers;
  const next = { ...headers };
  Object.keys(next).forEach((name) => {
    if (SENSITIVE_HEADER_NAMES.has(name.toLowerCase())) next[name as keyof T] = ["[redacted]"] as T[keyof T];
  });
  return next;
};

export const redactSensitiveText = (value: string, maxLength = 2000) => {
  const redacted = value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(?:api[_-]?key|token|secret|password|passwd|pwd)\s*[:=]\s*["']?[^"'\s&]+/gi, (match) => {
      const key = match.split(/[:=]/)[0]?.trim() || "secret";
      return `${key}=[redacted]`;
    })
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]");
  return redacted.length <= maxLength ? redacted : `${redacted.slice(0, maxLength - 15)}... [truncated]`;
};

export const compactUrl = (rawUrl: string) => {
  try {
    const parsed = new URL(rawUrl);
    parsed.search = parsed.search ? "?..." : "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return rawUrl.slice(0, 180);
  }
};
