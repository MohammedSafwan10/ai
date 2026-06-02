import type { PrivoraAccountRecord, SettingsRecord } from "../../shared/types";

const headersFor = (settings: Pick<SettingsRecord, "appwriteProjectId">, cookieHeader?: string) => ({
  "Content-Type": "application/json",
  "x-appwrite-project": settings.appwriteProjectId,
  ...(cookieHeader ? { Cookie: cookieHeader } : {}),
});

const jwtHeadersFor = (settings: Pick<SettingsRecord, "appwriteProjectId">, jwt: string) => ({
  "Content-Type": "application/json",
  "x-appwrite-project": settings.appwriteProjectId,
  "x-appwrite-jwt": jwt,
});

const endpointFor = (settings: Pick<SettingsRecord, "appwriteEndpoint">, path: string) =>
  `${settings.appwriteEndpoint.replace(/\/+$/, "")}${path}`;

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data?.message || data?.error || text || `Appwrite request failed with ${response.status}`);
  }
  return data as T;
};

const setCookiesFrom = (response: Response) => {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const values = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""].filter(Boolean);
  return values
    .flatMap((value) => value.split(/,\s*(?=[A-Za-z0-9_.-]+=)/))
    .map((value) => value.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
};

export const createEmailPasswordAccount = async (
  settings: SettingsRecord,
  input: { email: string; password: string; name?: string },
) => {
  const response = await fetch(endpointFor(settings, "/account"), {
    method: "POST",
    headers: headersFor(settings),
    body: JSON.stringify({
      userId: "unique()",
      email: input.email.trim(),
      password: input.password,
      name: input.name?.trim() || input.email.trim(),
    }),
  });
  await parseJsonResponse(response);
};

export const createEmailPasswordSession = async (
  settings: SettingsRecord,
  input: { email: string; password: string },
) => {
  const response = await fetch(endpointFor(settings, "/account/sessions/email"), {
    method: "POST",
    headers: headersFor(settings),
    body: JSON.stringify({
      email: input.email.trim(),
      password: input.password,
    }),
  });
  await parseJsonResponse(response);
  const cookieHeader = setCookiesFrom(response);
  if (!cookieHeader) throw new Error("Appwrite did not return a session cookie.");
  return cookieHeader;
};

export const getAppwriteAccount = async (
  settings: SettingsRecord,
  cookieHeader: string,
): Promise<PrivoraAccountRecord> => {
  if (!cookieHeader.trim()) return { authenticated: false };
  const response = await fetch(endpointFor(settings, "/account"), {
    headers: headersFor(settings, cookieHeader),
  });
  if (response.status === 401) return { authenticated: false };
  const account = await parseJsonResponse<any>(response);
  return {
    authenticated: true,
    userId: account.$id,
    email: account.email,
    name: account.name,
    emailVerification: Boolean(account.emailVerification),
  };
};

export const getAppwriteAccountFromJwt = async (
  settings: Pick<SettingsRecord, "appwriteEndpoint" | "appwriteProjectId">,
  jwt: string,
): Promise<PrivoraAccountRecord> => {
  if (!jwt.trim()) return { authenticated: false };
  const response = await fetch(endpointFor(settings, "/account"), {
    headers: jwtHeadersFor(settings, jwt),
  });
  if (response.status === 401) return { authenticated: false };
  const account = await parseJsonResponse<any>(response);
  return {
    authenticated: true,
    userId: account.$id,
    email: account.email,
    name: account.name,
    emailVerification: Boolean(account.emailVerification),
  };
};

export const createAppwriteJwt = async (
  settings: Pick<SettingsRecord, "appwriteEndpoint" | "appwriteProjectId">,
  cookieHeader: string,
) => {
  if (!cookieHeader.trim()) throw new Error("Sign in to Privora before using hosted AI credits.");
  const response = await fetch(endpointFor(settings, "/account/jwts"), {
    method: "POST",
    headers: headersFor(settings, cookieHeader),
    body: JSON.stringify({ duration: 3600 }),
  });
  const data = await parseJsonResponse<{ jwt?: string; secret?: string }>(response);
  const jwt = data.jwt || data.secret;
  if (!jwt) throw new Error("Appwrite did not return a user JWT.");
  return jwt;
};

export const deleteCurrentSession = async (
  settings: SettingsRecord,
  cookieHeader: string,
) => {
  if (!cookieHeader.trim()) return;
  await fetch(endpointFor(settings, "/account/sessions/current"), {
    method: "DELETE",
    headers: headersFor(settings, cookieHeader),
  }).catch(() => undefined);
};
