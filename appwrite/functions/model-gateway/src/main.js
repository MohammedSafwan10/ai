const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1";
const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || "69af9f0700103b7f3482";
const serverKey = process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY;
const openRouterKey = process.env.OPENROUTER_API_KEY;

const databaseId = process.env.SAAS_DATABASE_ID || "privora_saas";
const creditMultiplier = Number(process.env.AI_CREDIT_MULTIPLIER || 2000);

const collections = {
  profiles: process.env.PROFILES_COLLECTION_ID || "profiles",
  subscriptions: process.env.SUBSCRIPTIONS_COLLECTION_ID || "subscriptions",
  balances: process.env.CREDIT_BALANCES_COLLECTION_ID || "credit_balances",
  ledger: process.env.CREDIT_LEDGER_COLLECTION_ID || "credit_ledger",
  usage: process.env.USAGE_EVENTS_COLLECTION_ID || "usage_events",
  models: process.env.MODEL_CATALOG_COLLECTION_ID || "model_catalog",
};

const hostedModels = {
  "privora/deepseek-v4-flash": {
    documentId: "deepseek_v4_flash",
    upstreamModelId: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    inputPricePerToken: 0.0000000983,
    outputPricePerToken: 0.0000001966,
  },
  "privora/deepseek-v4-pro": {
    documentId: "deepseek_v4_pro",
    upstreamModelId: "deepseek/deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    inputPricePerToken: 0.000000435,
    outputPricePerToken: 0.00000087,
  },
  "privora/minimax-m3": {
    documentId: "minimax_m3",
    upstreamModelId: "minimax/minimax-m3",
    label: "MiniMax M3",
    inputPricePerToken: 0.0000003,
    outputPricePerToken: 0.0000012,
  },
};

const planDefaults = {
  free: { monthlyCreditAllowance: 0, perRunCreditCap: 0, dailyCreditCap: 0 },
  plus: { monthlyCreditAllowance: 5000, perRunCreditCap: 1000, dailyCreditCap: 1200 },
  pro: { monthlyCreditAllowance: 20000, perRunCreditCap: 2500, dailyCreditCap: 5000 },
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, no-cache, must-revalidate",
};

const nowIso = () => new Date().toISOString();
const nextMonthIso = () => {
  const date = new Date();
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
};
const tomorrowIso = () => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
};

const parseBody = (req) => {
  if (req.bodyJson && typeof req.bodyJson === "object") return req.bodyJson;
  if (!req.body) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    return {};
  }
};

const header = (req, name) => req.headers?.[name] || req.headers?.[name.toLowerCase()] || req.headers?.[name.toUpperCase()];

const appwriteRequest = async (path, { method = "GET", body, jwt } = {}) => {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-appwrite-project": projectId,
      ...(jwt ? { "x-appwrite-jwt": jwt } : {}),
      ...(!jwt && serverKey ? { "x-appwrite-key": serverKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || text || `Appwrite ${method} ${path} failed with ${response.status}`);
  }
  return data;
};

const getUserJwt = (req) => {
  const direct = header(req, "x-appwrite-user-jwt") || header(req, "x-appwrite-jwt") || header(req, "x-privora-user-jwt");
  if (direct) return direct;
  const authorization = header(req, "authorization") || "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
};

const getAccount = (jwt) => appwriteRequest("/account", { jwt });

const isMissingDocumentError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("not found") || message.includes("could not be found") || message.includes("requested id");
};

const getDocument = async (collectionId, documentId) => {
  try {
    return await appwriteRequest(`/databases/${databaseId}/collections/${collectionId}/documents/${encodeURIComponent(documentId)}`);
  } catch (error) {
    if (isMissingDocumentError(error)) return null;
    throw error;
  }
};

const createDocument = (collectionId, documentId, data) =>
  appwriteRequest(`/databases/${databaseId}/collections/${collectionId}/documents`, {
    method: "POST",
    body: { documentId, data },
  });

const updateDocument = (collectionId, documentId, data) =>
  appwriteRequest(`/databases/${databaseId}/collections/${collectionId}/documents/${encodeURIComponent(documentId)}`, {
    method: "PATCH",
    body: { data },
  });

const listDocuments = (collectionId, queries = []) => {
  const params = new URLSearchParams();
  queries.forEach((query) => params.append("queries[]", JSON.stringify(query)));
  params.append("ttl", "0");
  return appwriteRequest(`/databases/${databaseId}/collections/${collectionId}/documents?${params.toString()}`);
};

const queryEqual = (attribute, values) => ({ method: "equal", attribute, values: Array.isArray(values) ? values : [values] });
const queryLimit = (limit) => ({ method: "limit", values: [limit] });

const ensureUserRecords = async (account) => {
  const timestamp = nowIso();
  const defaults = planDefaults.free;
  const profile = await getDocument(collections.profiles, account.$id) || await createDocument(collections.profiles, account.$id, {
    user_id: account.$id,
    email: account.email || "",
    display_name: account.name || "",
    role: "user",
    hosted_access_disabled: false,
    created_at: timestamp,
    updated_at: timestamp,
  });

  const subscription = await getDocument(collections.subscriptions, account.$id) || await createDocument(collections.subscriptions, account.$id, {
    user_id: account.$id,
    plan: "free",
    status: "active",
    renewal_date: nextMonthIso(),
    monthly_credit_allowance: defaults.monthlyCreditAllowance,
    per_run_credit_cap: defaults.perRunCreditCap,
    daily_credit_cap: defaults.dailyCreditCap,
    created_at: timestamp,
    updated_at: timestamp,
  });

  const balance = await getDocument(collections.balances, account.$id) || await createDocument(collections.balances, account.$id, {
    user_id: account.$id,
    monthly_credits_remaining: 0,
    top_up_credits_remaining: 0,
    monthly_credits_used: 0,
    daily_credits_used: 0,
    reset_date: nextMonthIso(),
    daily_reset_date: tomorrowIso(),
    created_at: timestamp,
    updated_at: timestamp,
  });

  return { profile, subscription, balance };
};

const usageSummary = async (account, records) => {
  const usage = await listDocuments(collections.usage, [
    queryEqual("user_id", account.$id),
    queryLimit(10),
  ]).catch(() => ({ documents: [] }));
  const recentUsage = (usage.documents || [])
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
    .slice(0, 10)
    .map((event) => ({
      id: event.$id,
      modelId: event.model_id || "",
      creditsCharged: Number(event.credits_charged || 0),
      inputTokens: Number(event.input_tokens || 0),
      outputTokens: Number(event.output_tokens || 0),
      rawCostUsd: Number(event.raw_cost_usd || 0),
      createdAt: Date.parse(event.created_at || event.$createdAt || nowIso()),
    }));

  return {
    authenticated: true,
    userId: account.$id,
    email: account.email || "",
    plan: records.subscription.plan || "free",
    status: records.profile.hosted_access_disabled ? "disabled" : records.subscription.status || "unknown",
    hostedAccessDisabled: Boolean(records.profile.hosted_access_disabled),
    monthlyCreditAllowance: Number(records.subscription.monthly_credit_allowance || 0),
    monthlyCreditsRemaining: Number(records.balance.monthly_credits_remaining || 0),
    topUpCreditsRemaining: Number(records.balance.top_up_credits_remaining || 0),
    monthlyCreditsUsed: Number(records.balance.monthly_credits_used || 0),
    dailyCreditsUsed: Number(records.balance.daily_credits_used || 0),
    perRunCreditCap: Number(records.subscription.per_run_credit_cap || 0),
    dailyCreditCap: Number(records.subscription.daily_credit_cap || 0),
    resetDate: records.balance.reset_date || "",
    renewalDate: records.subscription.renewal_date || "",
    recentUsage,
    updatedAt: Date.now(),
  };
};

const estimateTokens = (messages = []) => {
  const text = JSON.stringify(messages);
  return Math.ceil(text.length / 4);
};

const creditsForCost = (costUsd) => Math.max(1, Math.ceil(Number(costUsd || 0) * creditMultiplier));

const debitCredits = (balance, credits) => {
  const monthly = Number(balance.monthly_credits_remaining || 0);
  const topUp = Number(balance.top_up_credits_remaining || 0);
  const fromMonthly = Math.min(monthly, credits);
  const fromTopUp = Math.max(0, credits - fromMonthly);
  return {
    monthly_credits_remaining: Math.max(0, monthly - fromMonthly),
    top_up_credits_remaining: Math.max(0, topUp - fromTopUp),
    monthly_credits_used: Number(balance.monthly_credits_used || 0) + credits,
    daily_credits_used: Number(balance.daily_credits_used || 0) + credits,
    updated_at: nowIso(),
  };
};

const loadCatalogModel = async (modelId) => {
  const fallback = hostedModels[modelId];
  if (!fallback) throw new Error("Hosted model is not allowed.");
  const row = await getDocument(collections.models, fallback.documentId).catch(() => null);
  if (row && row.enabled === false) throw new Error("Hosted model is disabled.");
  return {
    ...fallback,
    inputPricePerToken: Number(row?.input_price_per_token ?? fallback.inputPricePerToken),
    outputPricePerToken: Number(row?.output_price_per_token ?? fallback.outputPricePerToken),
    enabled: row?.enabled !== false,
  };
};

const callOpenRouter = async ({ catalogModel, body }) => {
  if (!openRouterKey) throw new Error("OPENROUTER_API_KEY is not configured.");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openRouterKey}`,
      "X-Title": "Privora",
    },
    body: JSON.stringify({
      model: catalogModel.upstreamModelId,
      messages: body.messages,
      tools: body.tools,
      tool_choice: body.toolChoice || "auto",
      parallel_tool_calls: true,
      max_tokens: Math.min(Number(body.maxOutputTokens || 4096), 8192),
      stream: false,
      temperature: 0.35,
    }),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data?.error?.message || data?.message || text || `OpenRouter failed with ${response.status}`);
  return data;
};

const handleChat = async ({ account, records, body }) => {
  if (records.profile.hosted_access_disabled) throw new Error("Hosted AI access is disabled for this account.");
  if ((records.subscription.status || "active") !== "active") throw new Error("Hosted AI requires an active Plus or Pro subscription.");
  if ((records.subscription.plan || "free") === "free") throw new Error("Free plan is BYOK only. Hosted AI credits require Plus or Pro.");

  const catalogModel = await loadCatalogModel(body.model);
  const inputTokens = estimateTokens(body.messages || []);
  const maxOutputTokens = Math.min(Number(body.maxOutputTokens || 4096), 8192);
  const estimatedCostUsd = (inputTokens * catalogModel.inputPricePerToken) + (maxOutputTokens * catalogModel.outputPricePerToken);
  const estimatedCredits = creditsForCost(estimatedCostUsd);
  const perRunCap = Number(records.subscription.per_run_credit_cap || 0);
  const dailyCap = Number(records.subscription.daily_credit_cap || 0);
  const availableCredits = Number(records.balance.monthly_credits_remaining || 0) + Number(records.balance.top_up_credits_remaining || 0);

  if (perRunCap <= 0 || estimatedCredits > perRunCap) throw new Error(`This run is estimated at ${estimatedCredits} AI credits, above the per-run cap of ${perRunCap}.`);
  if (dailyCap > 0 && Number(records.balance.daily_credits_used || 0) + estimatedCredits > dailyCap) throw new Error("Daily AI credit cap reached.");
  if (availableCredits < estimatedCredits) throw new Error(`Not enough AI credits. Need about ${estimatedCredits}, available ${availableCredits}.`);

  const openRouter = await callOpenRouter({ catalogModel, body });
  const choice = openRouter.choices?.[0]?.message || {};
  const usage = openRouter.usage || {};
  const finalInputTokens = Number(usage.prompt_tokens || inputTokens);
  const finalOutputTokens = Number(usage.completion_tokens || 0);
  const rawCostUsd = Number(usage.cost ?? ((finalInputTokens * catalogModel.inputPricePerToken) + (finalOutputTokens * catalogModel.outputPricePerToken)));
  const creditsCharged = Math.min(estimatedCredits, perRunCap, creditsForCost(rawCostUsd));

  const nextBalancePatch = debitCredits(records.balance, creditsCharged);
  const nextBalance = await updateDocument(collections.balances, account.$id, nextBalancePatch);
  const timestamp = nowIso();
  await createDocument(collections.ledger, "unique()", {
    user_id: account.$id,
    kind: "debit",
    credits: creditsCharged,
    source: "hosted_model",
    reason: body.model,
    run_id: body.runId || "",
    balance_after: Number(nextBalance.monthly_credits_remaining || 0) + Number(nextBalance.top_up_credits_remaining || 0),
    created_at: timestamp,
  });
  await createDocument(collections.usage, "unique()", {
    user_id: account.$id,
    model_id: body.model,
    upstream_model_id: catalogModel.upstreamModelId,
    input_tokens: finalInputTokens,
    output_tokens: finalOutputTokens,
    raw_cost_usd: rawCostUsd,
    credits_charged: creditsCharged,
    thread_id: body.threadId || "",
    run_id: body.runId || "",
    created_at: timestamp,
  });

  const summary = await usageSummary(account, { ...records, balance: nextBalance });
  return {
    text: choice.content || "",
    reasoning: choice.reasoning || choice.reasoning_content || "",
    toolCalls: (choice.tool_calls || []).map((call) => ({
      id: call.id,
      name: call.function?.name,
      arguments: call.function?.arguments || "{}",
    })),
    usage,
    billing: { creditsUsed: creditsCharged, estimatedCredits },
    summary,
  };
};

export default async ({ req, res, error }) => {
  try {
    const userJwt = getUserJwt(req);
    if (!userJwt) return res.json({ error: "Authentication required." }, 401, jsonHeaders);
    const account = await getAccount(userJwt);
    const records = await ensureUserRecords(account);
    const body = parseBody(req);

    if (body.action === "summary" || !body.action) {
      return res.json(await usageSummary(account, records), 200, jsonHeaders);
    }
    if (body.action === "chat") {
      return res.json(await handleChat({ account, records, body }), 200, jsonHeaders);
    }
    return res.json({ error: "Unknown action." }, 400, jsonHeaders);
  } catch (err) {
    error(err.message);
    return res.json({ error: err.message || "Privora gateway failed." }, 500, jsonHeaders);
  }
};
