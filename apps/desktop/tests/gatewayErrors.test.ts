import { describe, expect, it } from "vitest";
import { normalizeGatewayError } from "../src/main/billing/creditService";

describe("hosted gateway error messages", () => {
  it("converts Appwrite synchronous timeout JSON into a useful message", () => {
    const message = normalizeGatewayError(JSON.stringify({
      message: "Synchronous function execution timed out. Use asynchronous execution instead, or ensure the execution duration doesn't exceed 30 seconds.",
      code: 408,
      type: "function_synchronous_timeout",
    }));

    expect(message).toContain("30-second synchronous gateway limit");
    expect(message).not.toContain("function_synchronous_timeout");
  });
});
