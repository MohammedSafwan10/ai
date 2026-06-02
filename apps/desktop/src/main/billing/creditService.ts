import type { AiCreditSummaryRecord, SettingsRecord } from "../../shared/types";
import { createAppwriteJwt } from "./appwriteAuth";

const hostedCreditHelp = "Hosted AI needs Plus/Pro credits or a manual grant. You can keep using BYOK providers from Settings > Providers.";

const normalizeGatewayError = (message: string) => {
  const trimmed = message.trim();
  if (!trimmed) return "Privora hosted AI request failed.";
  if (/authentication required|missing scopes|\b401\b|user \(role: guests\)/i.test(trimmed)) {
    return `Privora account sign-in expired or was not accepted by the hosted gateway. Sign out, sign in again, then refresh Billing. ${hostedCreditHelp}`;
  }
  if (/free plan is byok only|hosted ai credits require plus or pro/i.test(trimmed)) {
    return `Your account is on the Free plan. ${hostedCreditHelp}`;
  }
  if (/not enough ai credits|daily ai credit cap|per-run cap|hosted ai access is disabled/i.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
};

export const emptyAiCreditSummary = (message = "Connect your Privora account to use hosted AI credits."): AiCreditSummaryRecord => ({
  authenticated: false,
  plan: "free",
  status: "unknown",
  hostedAccessDisabled: false,
  monthlyCreditAllowance: 0,
  monthlyCreditsRemaining: 0,
  topUpCreditsRemaining: 0,
  monthlyCreditsUsed: 0,
  dailyCreditsUsed: 0,
  perRunCreditCap: 0,
  dailyCreditCap: 0,
  recentUsage: [],
  message,
  updatedAt: Date.now(),
});

export const executePrivoraGateway = async <T>(
  settings: Pick<SettingsRecord, "appwriteEndpoint" | "appwriteProjectId" | "privoraGatewayFunctionId">,
  jwt: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> => {
  if (!jwt.trim()) throw new Error(`Connect your Privora account before using hosted AI credits. ${hostedCreditHelp}`);
  const endpoint = settings.appwriteEndpoint.replace(/\/+$/, "");
  const response = await fetch(`${endpoint}/functions/${encodeURIComponent(settings.privoraGatewayFunctionId)}/executions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-appwrite-project": settings.appwriteProjectId,
      "x-appwrite-jwt": jwt,
    },
    body: JSON.stringify({
      async: false,
      body: JSON.stringify(payload),
      method: "POST",
      headers: {
        "x-privora-user-jwt": jwt,
      },
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(normalizeGatewayError(body || `Privora gateway failed with ${response.status}`));
  }

  const execution = await response.json();
  const rawBody = execution.responseBody || execution.response || "";
  if (execution.status && execution.status !== "completed") {
    throw new Error(normalizeGatewayError(rawBody || execution.stderr || `Privora gateway execution ${execution.status}`));
  }

  const parsed = rawBody ? JSON.parse(rawBody) : {};
  if (parsed?.error) throw new Error(normalizeGatewayError(String(parsed.error)));
  return parsed as T;
};

export const refreshAiCreditSummary = async (
  settings: SettingsRecord,
  sessionCookie: string,
  userJwt = "",
): Promise<AiCreditSummaryRecord> => {
  if (!sessionCookie.trim() && !userJwt.trim()) return emptyAiCreditSummary();
  const jwt = userJwt.trim() || await createAppwriteJwt(settings, sessionCookie);
  return executePrivoraGateway<AiCreditSummaryRecord>(settings, jwt, { action: "summary" });
};
