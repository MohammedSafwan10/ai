import { afterEach, describe, expect, it, vi } from "vitest";
import { createTokenSession } from "../src/main/billing/appwriteAuth";

describe("Appwrite desktop token session", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exchanges a one-time token for a durable session cookie", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ $id: "session_123" }), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": "a_session_project=secret-session; Path=/; HttpOnly; Secure",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const cookie = await createTokenSession({
      appwriteEndpoint: "https://sgp.cloud.appwrite.io/v1",
      appwriteProjectId: "project",
    }, {
      userId: "user_123",
      secret: "one-time-secret",
    });

    expect(cookie).toBe("a_session_project=secret-session");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://sgp.cloud.appwrite.io/v1/account/sessions/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ userId: "user_123", secret: "one-time-secret" }),
      }),
    );
  });

  it("rejects non-https Appwrite endpoints before sending credentials", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(createTokenSession({
      appwriteEndpoint: "http://sgp.cloud.appwrite.io/v1",
      appwriteProjectId: "project",
    }, {
      userId: "user_123",
      secret: "one-time-secret",
    })).rejects.toThrow(/https/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
