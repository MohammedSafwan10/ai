const LOCAL_SERVICE_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const normalizeLocalServiceBaseUrl = (value: string, serviceName: string) => {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`${serviceName} URL must use http or https.`);
  }
  if (!LOCAL_SERVICE_HOSTS.has(parsed.hostname)) {
    throw new Error(`${serviceName} URL must point to localhost.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${serviceName} URL must not include embedded credentials.`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${serviceName} URL must not include query strings or fragments.`);
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString().replace(/\/$/, "");
};

export const normalizeHttpsServiceBaseUrl = (value: string, serviceName: string) => {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") {
    throw new Error(`${serviceName} URL must use https.`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${serviceName} URL must not include embedded credentials.`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${serviceName} URL must not include query strings or fragments.`);
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString().replace(/\/$/, "");
};

