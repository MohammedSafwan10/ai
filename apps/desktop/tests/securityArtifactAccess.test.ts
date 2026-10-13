import { describe, expect, it } from "vitest";
import { trustedArtifactUrl } from "../src/renderer/features/security/artifactAccess";

describe("security evidence attachment access", () => {
  it("accepts the app-owned attachment URL with the expected artifact identity", () => {
    const url = "privora-attachment://artifact/abc.bin?mime=text%2Fplain";
    expect(trustedArtifactUrl({ artifactId: "abc.bin", url })).toBe(url);
  });

  it("rejects remote, local file, script, and unrelated protocol hosts", () => {
    for (const url of ["https://example.com/abc.bin", "file:///abc.bin", "javascript:alert(1)", "privora-attachment://other/abc.bin"]) {
      expect(() => trustedArtifactUrl({ artifactId: "abc.bin", url })).toThrow("Invalid evidence attachment URL");
    }
  });

  it("rejects a URL whose artifact identity differs from the saved evidence", () => {
    expect(() => trustedArtifactUrl({ artifactId: "expected.bin", url: "privora-attachment://artifact/other.bin" })).toThrow("Invalid evidence attachment URL");
  });
});
