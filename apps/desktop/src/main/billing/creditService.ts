import type { AiCreditSummaryRecord, SettingsRecord } from "../../shared/types";
import { createAppwriteJwt } from "./appwriteAuth";

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
  if (!jwt.trim()) throw new Error("Connect your Privora account before using hosted AI credits.");
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
    }),
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Privora gateway failed with ${response.status}`);
  }

  const execution = await response.json();
  const rawBody = execution.responseBody || execution.response || "";
  if (execution.status && execution.status !== "completed") {
    throw new Error(rawBody || execution.stderr || `Privora gateway execution ${execution.status}`);
  }

  const parsed = rawBody ? JSON.parse(rawBody) : {};
  if (parsed?.error) throw new Error(String(parsed.error));
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
