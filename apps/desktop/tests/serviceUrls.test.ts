import { describe, expect, it } from "vitest";
import { normalizeHttpsServiceBaseUrl, normalizeLocalServiceBaseUrl } from "../src/main/security/serviceUrls";

describe("service URL normalization", () => {
  it("allows localhost service URLs without credentials, query strings, or fragments", () => {
    expect(normalizeLocalServiceBaseUrl("http://127.0.0.1:8317/", "CLI proxy")).toBe("http://127.0.0.1:8317");
    expect(normalizeLocalServiceBaseUrl("https://localhost:9443/api/", "CLI proxy")).toBe("https://localhost:9443/api");
  });

  it("rejects non-local service URLs", () => {
    expect(() => normalizeLocalServiceBaseUrl("https://example.com", "CLI proxy")).toThrow(/localhost/i);
    expect(() => normalizeLocalServiceBaseUrl("file:///tmp/socket", "CLI proxy")).toThrow(/http or https/i);
  });

  it("rejects URL credentials and client-side decorations", () => {
    expect(() => normalizeLocalServiceBaseUrl("http://user:pass@127.0.0.1:8317", "CLI proxy")).toThrow(/credentials/i);
    expect(() => normalizeLocalServiceBaseUrl("http://127.0.0.1:8317?token=secret", "CLI proxy")).toThrow(/query/i);
    expect(() => normalizeLocalServiceBaseUrl("http://127.0.0.1:8317/#token", "CLI proxy")).toThrow(/query strings or fragments/i);
  });

  it("requires hosted service URLs to use clean https origins", () => {
    expect(normalizeHttpsServiceBaseUrl("https://sgp.cloud.appwrite.io/v1/", "Appwrite")).toBe("https://sgp.cloud.appwrite.io/v1");
    expect(() => normalizeHttpsServiceBaseUrl("http://sgp.cloud.appwrite.io/v1", "Appwrite")).toThrow(/https/i);
    expect(() => normalizeHttpsServiceBaseUrl("https://token@sgp.cloud.appwrite.io/v1", "Appwrite")).toThrow(/credentials/i);
  });
});

