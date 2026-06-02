import { afterEach, describe, expect, it, vi } from "vitest";
import { beginPrivoraBrowserAuth, closePrivoraBrowserAuthServer, parsePrivoraAuthCallback } from "../src/main/billing/browserAuthFlow";
import type { DesktopStore } from "../src/main/db/store";

const fakeStore = () => {
  let pending: { state: string; createdAt: number } | null = null;
  return {
    setPrivoraPendingAuth(state: string, createdAt: number) {
      pending = { state, createdAt };
    },
    getPrivoraPendingAuth() {
      return pending;
    },
    clearPrivoraPendingAuth() {
      pending = null;
    },
  } as Pick<DesktopStore, "setPrivoraPendingAuth" | "getPrivoraPendingAuth" | "clearPrivoraPendingAuth"> as DesktopStore;
};

describe("Privora browser auth flow", () => {
  afterEach(() => {
    closePrivoraBrowserAuthServer();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("creates a web connect URL with a high-entropy state", async () => {
    vi.stubEnv("PRIVORA_WEB_BASE_URL", "https://privora.nexdark.com");
    const store = fakeStore();

    const auth = await beginPrivoraBrowserAuth(store);
    const url = new URL(auth.url);

    expect(url.origin).toBe("https://privora.nexdark.com");
    expect(url.pathname).toBe("/desktop/connect");
    expect(url.searchParams.get("source")).toBe("desktop");
    expect(url.searchParams.get("state")?.length).toBeGreaterThan(32);
    expect(auth.expiresAt).toBeGreaterThan(Date.now());
  });

  it("uses the configured web base URL before local detection", async () => {
    vi.stubEnv("PRIVORA_WEB_BASE_URL", "http://localhost:5173");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));
    const store = fakeStore();

    const auth = await beginPrivoraBrowserAuth(store);

    expect(new URL(auth.url).origin).toBe("http://localhost:5173");
  });

  it("detects a running local web app in dev mode", async () => {
    vi.stubEnv("PRIVORA_DESKTOP_DEV", "1");
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "http://localhost:3002") return new Response("", { status: 404 });
      return new Response("", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const store = fakeStore();

    const auth = await beginPrivoraBrowserAuth(store);

    expect(new URL(auth.url).origin).toBe("http://localhost:3002");
  });

  it("only enables the localhost JWT bridge for local web URLs", async () => {
    vi.stubEnv("PRIVORA_WEB_BASE_URL", "https://privora.nexdark.com");
    const productionAuth = await beginPrivoraBrowserAuth(fakeStore(), { onJwt: async () => undefined });
    expect(new URL(productionAuth.url).searchParams.get("callback")).toBeNull();

    vi.stubEnv("PRIVORA_WEB_BASE_URL", "http://localhost:3000");
    const store = fakeStore();
    let receivedJwt = "";
    let receivedExpiresAt = 0;
    const localAuth = await beginPrivoraBrowserAuth(store, {
      onJwt: async (jwt, expiresAt) => {
        receivedJwt = jwt;
        receivedExpiresAt = expiresAt;
      },
    });
    const localUrl = new URL(localAuth.url);
    const callback = localUrl.searchParams.get("callback");
    const state = localUrl.searchParams.get("state");

    expect(callback).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
    const expiresAt = Date.now() + 60 * 60 * 1000;
    const response = await fetch(callback!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, jwt: "test-jwt", expiresAt }),
    });

    expect(response.ok).toBe(true);
    expect(receivedJwt).toBe("test-jwt");
    expect(receivedExpiresAt).toBe(expiresAt);
  });

  it("accepts only matching privora auth callback state", async () => {
    const store = fakeStore();
    const auth = await beginPrivoraBrowserAuth(store);
    const state = new URL(auth.url).searchParams.get("state");

    expect(parsePrivoraAuthCallback(store, `privora://auth/callback?state=wrong&code=abc`)?.ok).toBe(false);
    expect(parsePrivoraAuthCallback(store, `privora://auth/callback?state=${state}&code=abc`)?.ok).toBe(true);
    expect(parsePrivoraAuthCallback(store, `privora://auth/callback?state=${state}&code=abc`)?.ok).toBe(false);
  });

  it("ignores unrelated protocol URLs", () => {
    const store = fakeStore();

    expect(parsePrivoraAuthCallback(store, "https://privora.nexdark.com/desktop/connect")).toBeNull();
    expect(parsePrivoraAuthCallback(store, "privora://settings/callback?state=x&code=y")).toBeNull();
  });
});
