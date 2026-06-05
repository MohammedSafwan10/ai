import { describe, expect, it } from "vitest";
import { browserExtractionOutput, normalizeExtractMode, sanitizeBrowserExtraction } from "../src/main/browser/browserExtraction";

describe("browser extraction helpers", () => {
  it("redacts sensitive text and compacts URLs", () => {
    const result = sanitizeBrowserExtraction({
      mode: "visible_text",
      url: "https://example.com/page?token=secret#hash",
      title: "Contact user@example.com",
      text: "Bearer abc.def token=secret user@example.com",
    });

    expect(result.url).toBe("https://example.com/page?...");
    expect(result.title).toBe("Contact [email]");
    expect(result.text).toContain("Bearer [redacted]");
    expect(result.text).toContain("token=[redacted]");
    expect(result.text).toContain("[email]");
  });

  it("formats links without dumping raw structured JSON", () => {
    const output = browserExtractionOutput({
      mode: "links",
      url: "https://example.com/",
      title: "Example",
      links: [{ text: "Docs", href: "https://example.com/docs" }],
    });

    expect(output).toBe("- Docs — https://example.com/docs");
  });

  it("unwraps common search redirect links", () => {
    const result = sanitizeBrowserExtraction({
      mode: "links",
      url: "https://duckduckgo.com/",
      title: "Search",
      links: [{
        text: "Docs",
        href: "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fdocs%3Ftoken%3Dsecret",
      }],
    });

    expect(result.links?.[0]?.href).toBe("https://example.com/docs?...");
  });

  it("rejects unknown extraction modes", () => {
    expect(() => normalizeExtractMode("cookies")).toThrow(/browser_extract mode/);
  });
});
