import { describe, expect, it, vi } from "vitest";
import { attachmentProtocolResponse } from "../src/main/attachments/protocol";

const id = `${"a".repeat(64)}.bin`;
const url = (mime = "text/plain") => `privora-attachment://artifact/${id}?mime=${encodeURIComponent(mime)}`;

describe("app attachment protocol", () => {
  it("serves text evidence to the packaged file-origin renderer", async () => {
    const response = attachmentProtocolResponse(new Request(url(), { headers: { Origin: "null" } }), () => Buffer.from("evidence € 😀"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("null");
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe("evidence € 😀");
  });

  it("allows only the configured development origin", () => {
    expect(attachmentProtocolResponse(new Request(url(), { headers: { Origin: "http://localhost:5173" } }), () => Buffer.from("x"), "http://localhost:5173/").status).toBe(200);
    const load = vi.fn(() => Buffer.from("secret"));
    expect(attachmentProtocolResponse(new Request(url(), { headers: { Origin: "https://untrusted.example" } }), load).status).toBe(403);
    expect(load).not.toHaveBeenCalled();
  });

  it("retains images while serving HTML and other active documents as opaque bytes", () => {
    expect(attachmentProtocolResponse(new Request(url("image/png")), () => Buffer.from("image")).headers.get("Content-Type")).toBe("image/png");
    const response = attachmentProtocolResponse(new Request(url("text/html")), () => Buffer.from("<script>bad()</script>"));
    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("rejects traversal, arbitrary hosts, methods, and unavailable files", () => {
    const load = vi.fn(() => Buffer.from("x"));
    for (const bad of ["privora-attachment://artifact/%2e%2e%2Fsecret", `privora-attachment://elsewhere/${id}`, `https://artifact/${id}`]) {
      expect(attachmentProtocolResponse(new Request(bad), load).status).toBeGreaterThanOrEqual(400);
    }
    expect(load).not.toHaveBeenCalled();
    expect(attachmentProtocolResponse(new Request(url(), { method: "POST" }), load).status).toBe(405);
    expect(attachmentProtocolResponse(new Request(url()), () => { throw new Error("missing"); }).status).toBe(404);
  });
});
