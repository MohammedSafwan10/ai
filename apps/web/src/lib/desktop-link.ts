import { z } from "zod";

export const desktopConnectSchema = z.object({
  state: z.string().min(16).max(256).optional(),
  source: z.string().max(64).optional(),
  callback: z.string().url().max(512).optional(),
});

export const buildDesktopCallbackUrl = (code: string, state: string) =>
  `privora://auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;

export const encodeDesktopAuthCode = (input: {
  userId: string;
  secret: string;
  expiresAt: number;
  email?: string;
  name?: string;
}) => {
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export const isLocalDesktopCallbackUrl = (value: string | undefined) => {
  if (!value || !import.meta.env.DEV) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" && parsed.hostname === "127.0.0.1" && parsed.pathname === "/auth/callback";
  } catch {
    return false;
  }
};

export const buildDesktopConnectRedirect = (input: { state?: string; source?: string; callback?: string }) => {
  const params = new URLSearchParams();
  if (input.state) params.set("state", input.state);
  if (input.source) params.set("source", input.source);
  if (input.callback) params.set("callback", input.callback);
  const query = params.toString();
  return `/desktop/connect${query ? `?${query}` : ""}`;
};

export const desktopConnectStatus = {
  ready: "This page was opened from Privora Desktop and is ready for the browser connection flow.",
  missingState: "Open this page from Privora Desktop to connect securely.",
  localBridge: "Local development can finish the browser connection through a short-lived localhost callback.",
  secureHandoff: "Privora will create a short-lived one-time token for this desktop connection.",
  signedInMissingCallback: "Browser sign-in is active, but this tab is not linked to the current Privora Desktop sign-in request.",
};
