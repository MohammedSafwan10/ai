import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("attachment preview CSP", () => {
  it("allows Privora attachment artifact URLs in renderer image tags", () => {
    const html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");
    const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)?.[1] || "";

    expect(csp).toContain("img-src");
    expect(csp).toContain("privora-attachment:");
  });
});
