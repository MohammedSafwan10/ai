import { describe, expect, it } from "vitest";
import { securityConnectionStatus } from "../src/shared/securityConnection";
import type { SecurityEnvironmentRecord } from "../src/shared/securityWorkspace";

const environment: SecurityEnvironmentRecord = { id: "kali", name: "Kali", host: "lab", port: 22, username: "tester", status: "connected", lastCheckedAt: 1000 };

describe("Security connection freshness", () => {
  it("removes connected status for expired or unverified observations", () => {
    expect(securityConnectionStatus(environment, 30_999)).toBe("connected");
    expect(securityConnectionStatus(environment, 31_000)).toBe("unchecked");
    expect(securityConnectionStatus({ ...environment, lastCheckedAt: undefined }, 1000)).toBe("unchecked");
    expect(securityConnectionStatus({ ...environment, status: "disconnected" }, 1000)).toBe("disconnected");
  });
});
