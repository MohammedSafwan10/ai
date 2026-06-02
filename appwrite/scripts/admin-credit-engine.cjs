#!/usr/bin/env node

const endpoint = process.env.APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1";
const projectId = process.env.APPWRITE_PROJECT_ID || "69af9f0700103b7f3482";
const apiKey = process.env.APPWRITE_RELEASE_API_KEY || process.env.APPWRITE_API_KEY;
const databaseId = process.env.SAAS_DATABASE_ID || "privora_saas";

if (!apiKey) {
  throw new Error("Set APPWRITE_RELEASE_API_KEY or APPWRITE_API_KEY with databases access.");
}

const plans = {
  free: { monthlyCreditAllowance: 0, perRunCreditCap: 0, dailyCreditCap: 0 },
  plus: { monthlyCreditAllowance: 5000, perRunCreditCap: 1000, dailyCreditCap: 1200 },
  pro: { monthlyCreditAllowance: 20000, perRunCreditCap: 2500, dailyCreditCap: 5000 },
};

const args = process.argv.slice(2);
const command = args[0];
const flag = (name, fallback = "") => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] || "" : fallback;
};

const request = async (path, { method = "GET", body } = {}) => {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-appwrite-project": projectId,
      "x-appwrite-key": apiKey,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || text || `${method} ${path} failed with ${response.status}`);
  return data;
};

const documentPath = (collectionId, documentId) =>
  `/databases/${databaseId}/collections/${collectionId}/documents/${encodeURIComponent(documentId)}`;

const getDocument = (collectionId, documentId) => request(documentPath(collectionId, documentId));
const updateDocument = (collectionId, documentId, data) => request(documentPath(collectionId, documentId), {
  method: "PATCH",
  body: { data },
});
const createDocument = (collectionId, documentId, data) => request(`/databases/${databaseId}/collections/${collectionId}/documents`, {
  method: "POST",
  body: { documentId, data },
});

const isMissingDocumentError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("not found") || message.includes("could not be found") || message.includes("requested id");
};

const getOrCreateDocument = async (collectionId, documentId, data) => {
  try {
    return await getDocument(collectionId, documentId);
  } catch (error) {
    if (!isMissingDocumentError(error)) throw error;
    return createDocument(collectionId, documentId, data);
  }
};

const listByUser = (collectionId, userId, limit = 25) => {
  const params = new URLSearchParams();
  params.append("queries[]", JSON.stringify({ method: "equal", attribute: "user_id", values: [userId] }));
  params.append("queries[]", JSON.stringify({ method: "limit", values: [limit] }));
  params.append("ttl", "0");
  return request(`/databases/${databaseId}/collections/${collectionId}/documents?${params.toString()}`);
};

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

const ensureUserRecords = async (userId) => {
  const timestamp = new Date().toISOString();
  await getOrCreateDocument("profiles", userId, {
    user_id: userId,
    email: flag("email", ""),
    display_name: flag("name", ""),
    role: "user",
    hosted_access_disabled: false,
    created_at: timestamp,
    updated_at: timestamp,
  });
  await getOrCreateDocument("subscriptions", userId, {
    user_id: userId,
    plan: "free",
    status: "active",
    renewal_date: nextMonthIso(),
    monthly_credit_allowance: plans.free.monthlyCreditAllowance,
    per_run_credit_cap: plans.free.perRunCreditCap,
    daily_credit_cap: plans.free.dailyCreditCap,
    created_at: timestamp,
    updated_at: timestamp,
  });
  await getOrCreateDocument("credit_balances", userId, {
    user_id: userId,
    monthly_credits_remaining: 0,
    top_up_credits_remaining: 0,
    monthly_credits_used: 0,
    daily_credits_used: 0,
    reset_date: nextMonthIso(),
    daily_reset_date: tomorrowIso(),
    created_at: timestamp,
    updated_at: timestamp,
  });
};

const grantCredits = async () => {
  const userId = flag("user-id");
  const credits = Number(flag("credits"));
  const reason = flag("reason", "manual_grant");
  if (!userId || !Number.isFinite(credits) || credits <= 0) throw new Error("Usage: grant --user-id <id> --credits <amount> [--reason text]");
  await ensureUserRecords(userId);
  const balance = await getDocument("credit_balances", userId);
  const nextMonthly = Number(balance.monthly_credits_remaining || 0) + credits;
  const updated = await updateDocument("credit_balances", userId, {
    monthly_credits_remaining: nextMonthly,
    updated_at: new Date().toISOString(),
  });
  await createDocument("credit_ledger", "unique()", {
    user_id: userId,
    kind: "grant",
    credits,
    source: "admin",
    reason,
    run_id: "",
    balance_after: Number(updated.monthly_credits_remaining || 0) + Number(updated.top_up_credits_remaining || 0),
    created_at: new Date().toISOString(),
  });
  console.log(`Granted ${credits} AI credits to ${userId}.`);
};

const setPlan = async () => {
  const userId = flag("user-id");
  const plan = flag("plan");
  if (!userId || !plans[plan]) throw new Error("Usage: set-plan --user-id <id> --plan free|plus|pro");
  await ensureUserRecords(userId);
  const selected = plans[plan];
  await updateDocument("subscriptions", userId, {
    plan,
    status: "active",
    renewal_date: nextMonthIso(),
    monthly_credit_allowance: selected.monthlyCreditAllowance,
    per_run_credit_cap: selected.perRunCreditCap,
    daily_credit_cap: selected.dailyCreditCap,
    updated_at: new Date().toISOString(),
  });
  await updateDocument("credit_balances", userId, {
    monthly_credits_remaining: selected.monthlyCreditAllowance,
    top_up_credits_remaining: 0,
    monthly_credits_used: 0,
    daily_credits_used: 0,
    reset_date: nextMonthIso(),
    daily_reset_date: nextMonthIso(),
    updated_at: new Date().toISOString(),
  });
  await createDocument("credit_ledger", "unique()", {
    user_id: userId,
    kind: "grant",
    credits: selected.monthlyCreditAllowance,
    source: "plan_change",
    reason: plan,
    run_id: "",
    balance_after: selected.monthlyCreditAllowance,
    created_at: new Date().toISOString(),
  });
  console.log(`Set ${userId} to ${plan} with ${selected.monthlyCreditAllowance} monthly AI credits.`);
};

const setHostedAccess = async (disabled) => {
  const userId = flag("user-id");
  if (!userId) throw new Error(`${disabled ? "disable" : "enable"} --user-id <id>`);
  await ensureUserRecords(userId);
  await updateDocument("profiles", userId, {
    hosted_access_disabled: disabled,
    updated_at: new Date().toISOString(),
  });
  console.log(`${disabled ? "Disabled" : "Enabled"} hosted access for ${userId}.`);
};

const showUsage = async () => {
  const userId = flag("user-id");
  if (!userId) throw new Error("usage --user-id <id>");
  await ensureUserRecords(userId);
  const [subscription, balance, usage, ledger] = await Promise.all([
    getDocument("subscriptions", userId),
    getDocument("credit_balances", userId),
    listByUser("usage_events", userId, 20),
    listByUser("credit_ledger", userId, 20),
  ]);
  console.log(JSON.stringify({
    subscription,
    balance,
    usage: usage.documents,
    ledger: ledger.documents,
  }, null, 2));
};

const usage = () => {
  console.log(`Usage:
  node appwrite/scripts/admin-credit-engine.cjs set-plan --user-id <id> --plan plus|pro|free
  node appwrite/scripts/admin-credit-engine.cjs grant --user-id <id> --credits 500 --reason "manual test"
  node appwrite/scripts/admin-credit-engine.cjs usage --user-id <id>
  node appwrite/scripts/admin-credit-engine.cjs disable --user-id <id>
  node appwrite/scripts/admin-credit-engine.cjs enable --user-id <id>`);
};

(async () => {
  if (command === "grant") return grantCredits();
  if (command === "set-plan") return setPlan();
  if (command === "usage") return showUsage();
  if (command === "disable") return setHostedAccess(true);
  if (command === "enable") return setHostedAccess(false);
  usage();
})();
