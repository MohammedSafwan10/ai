#!/usr/bin/env node

const endpoint = process.env.APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1";
const projectId = process.env.APPWRITE_PROJECT_ID || "69af9f0700103b7f3482";
const apiKey = process.env.APPWRITE_RELEASE_API_KEY || process.env.APPWRITE_API_KEY;
const databaseId = process.env.SAAS_DATABASE_ID || "privora_saas";

if (!apiKey) {
  throw new Error("Set APPWRITE_RELEASE_API_KEY or APPWRITE_API_KEY with databases/functions access.");
}

const collections = [
  {
    id: "profiles",
    name: "Profiles",
    attributes: [
      ["string", "user_id", 120, true],
      ["string", "email", 320, false],
      ["string", "display_name", 160, false],
      ["string", "role", 40, false, "user"],
      ["boolean", "hosted_access_disabled", false, false],
      ["string", "created_at", 40, true],
      ["string", "updated_at", 40, true],
    ],
    indexes: [["user_id_idx", "key", ["user_id"]]],
  },
  {
    id: "subscriptions",
    name: "Subscriptions",
    attributes: [
      ["string", "user_id", 120, true],
      ["string", "plan", 20, false, "free"],
      ["string", "status", 40, false, "active"],
      ["string", "renewal_date", 40, false],
      ["integer", "monthly_credit_allowance", false, 0],
      ["integer", "per_run_credit_cap", false, 0],
      ["integer", "daily_credit_cap", false, 0],
      ["string", "created_at", 40, true],
      ["string", "updated_at", 40, true],
    ],
    indexes: [["user_id_idx", "key", ["user_id"]], ["plan_idx", "key", ["plan"]]],
  },
  {
    id: "credit_balances",
    name: "Credit Balances",
    attributes: [
      ["string", "user_id", 120, true],
      ["integer", "monthly_credits_remaining", false, 0],
      ["integer", "top_up_credits_remaining", false, 0],
      ["integer", "monthly_credits_used", false, 0],
      ["integer", "daily_credits_used", false, 0],
      ["string", "reset_date", 40, false],
      ["string", "daily_reset_date", 40, false],
      ["string", "created_at", 40, true],
      ["string", "updated_at", 40, true],
    ],
    indexes: [["user_id_idx", "key", ["user_id"]]],
  },
  {
    id: "credit_ledger",
    name: "Credit Ledger",
    attributes: [
      ["string", "user_id", 120, true],
      ["string", "kind", 40, true],
      ["integer", "credits", false, 0],
      ["string", "source", 80, true],
      ["string", "reason", 500, false],
      ["string", "run_id", 160, false],
      ["integer", "balance_after", false, 0],
      ["string", "created_at", 40, true],
    ],
    indexes: [["user_id_idx", "key", ["user_id"]], ["created_at_idx", "key", ["created_at"]]],
  },
  {
    id: "usage_events",
    name: "Usage Events",
    attributes: [
      ["string", "user_id", 120, true],
      ["string", "model_id", 160, true],
      ["string", "upstream_model_id", 160, true],
      ["integer", "input_tokens", false, 0],
      ["integer", "output_tokens", false, 0],
      ["float", "raw_cost_usd", false, 0],
      ["integer", "credits_charged", false, 0],
      ["string", "thread_id", 160, false],
      ["string", "run_id", 160, false],
      ["string", "created_at", 40, true],
    ],
    indexes: [["user_id_idx", "key", ["user_id"]], ["model_idx", "key", ["model_id"]], ["created_at_idx", "key", ["created_at"]]],
  },
  {
    id: "model_catalog",
    name: "Model Catalog",
    attributes: [
      ["string", "model_id", 160, true],
      ["string", "upstream_model_id", 160, true],
      ["string", "label", 120, true],
      ["float", "input_price_per_token", false, 0],
      ["float", "output_price_per_token", false, 0],
      ["boolean", "enabled", false, true],
      ["string", "created_at", 40, true],
      ["string", "updated_at", 40, true],
    ],
    indexes: [["model_id_idx", "key", ["model_id"]], ["enabled_idx", "key", ["enabled"]]],
  },
];

const modelSeed = [
  ["deepseek_v4_flash", "privora/deepseek-v4-flash", "deepseek/deepseek-v4-flash", "DeepSeek V4 Flash", 0.0000000983, 0.0000001966],
  ["deepseek_v4_pro", "privora/deepseek-v4-pro", "deepseek/deepseek-v4-pro", "DeepSeek V4 Pro", 0.000000435, 0.00000087],
  ["minimax_m3", "privora/minimax-m3", "minimax/minimax-m3", "MiniMax M3", 0.0000003, 0.0000012],
];

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
  if (!response.ok) {
    const message = data?.message || text || `${method} ${path} failed with ${response.status}`;
    if (response.status === 409) return { exists: true };
    throw new Error(message);
  }
  return data;
};

const createAttribute = (collectionId, attribute) => {
  const [type, key, a, b, c] = attribute;
  if (type === "string") return request(`/databases/${databaseId}/collections/${collectionId}/attributes/string`, {
    method: "POST",
    body: { key, size: a, required: b, ...(c !== undefined ? { default: c } : {}) },
  });
  if (type === "integer") return request(`/databases/${databaseId}/collections/${collectionId}/attributes/integer`, {
    method: "POST",
    body: { key, required: a, ...(b !== undefined ? { default: b } : {}) },
  });
  if (type === "float") return request(`/databases/${databaseId}/collections/${collectionId}/attributes/float`, {
    method: "POST",
    body: { key, required: a, ...(b !== undefined ? { default: b } : {}) },
  });
  if (type === "boolean") return request(`/databases/${databaseId}/collections/${collectionId}/attributes/boolean`, {
    method: "POST",
    body: { key, required: a, ...(b !== undefined ? { default: b } : {}) },
  });
  throw new Error(`Unknown attribute type ${type}`);
};

const createIndex = (collectionId, [key, type, attributes]) =>
  request(`/databases/${databaseId}/collections/${collectionId}/indexes`, {
    method: "POST",
    body: { key, type, attributes },
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForCollectionAttributes = async (collectionId, expectedKeys) => {
  const expected = new Set(expectedKeys);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const collection = await request(`/databases/${databaseId}/collections/${collectionId}`);
    const attributes = collection.attributes || [];
    const ready = attributes
      .filter((attribute) => expected.has(attribute.key))
      .every((attribute) => attribute.status === "available");
    if (ready && attributes.filter((attribute) => expected.has(attribute.key)).length === expected.size) return;
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${collectionId} attributes to become available.`);
};

const upsertDocument = async (collectionId, documentId, data) => {
  const path = `/databases/${databaseId}/collections/${collectionId}/documents/${documentId}`;
  const existing = await request(path).catch((error) => {
    const message = String(error.message || "").toLowerCase();
    if (message.includes("not found") || message.includes("could not be found")) return null;
    throw error;
  });
  if (existing) return request(path, { method: "PATCH", body: { data } });
  return request(`/databases/${databaseId}/collections/${collectionId}/documents`, {
    method: "POST",
    body: { documentId, data },
  });
};

const main = async () => {
  await request(`/databases`, { method: "POST", body: { databaseId, name: "Privora SaaS" } });
  for (const collection of collections) {
    await request(`/databases/${databaseId}/collections`, {
      method: "POST",
      body: { collectionId: collection.id, name: collection.name },
    });
    for (const attribute of collection.attributes) await createAttribute(collection.id, attribute);
    await waitForCollectionAttributes(collection.id, collection.attributes.map((attribute) => attribute[1]));
    for (const index of collection.indexes) await createIndex(collection.id, index);
  }

  const timestamp = new Date().toISOString();
  for (const [documentId, modelId, upstreamModelId, label, inputPricePerToken, outputPricePerToken] of modelSeed) {
    await upsertDocument("model_catalog", documentId, {
      model_id: modelId,
      upstream_model_id: upstreamModelId,
      label,
      input_price_per_token: inputPricePerToken,
      output_price_per_token: outputPricePerToken,
      enabled: true,
      created_at: timestamp,
      updated_at: timestamp,
    });
  }
  console.log("Privora AI credit engine schema is ready.");
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
