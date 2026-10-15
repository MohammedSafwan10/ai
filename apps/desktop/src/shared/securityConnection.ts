import type { SecurityEnvironmentRecord } from "./securityWorkspace";

export const SECURITY_CONNECTION_MAX_AGE_MS = 30_000;

export const securityConnectionStatus = (environment: SecurityEnvironmentRecord, now = Date.now()) =>
  environment.status === "connected" && (!environment.lastCheckedAt || now - environment.lastCheckedAt >= SECURITY_CONNECTION_MAX_AGE_MS)
    ? "unchecked" : environment.status;
