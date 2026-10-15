import { expect, it } from "vitest";
import { compactToolResultForModel } from "../src/main/agent/context";

it("omits missing fields and preserves real nulls and array positions in model results", () => {
  const result = compactToolResultForModel({ success: true, output: "Document", data: {
    text: "End of document", nextOffset: undefined, links: undefined,
    nested: { missing: undefined, value: null, done: false, offset: 0 },
    slots: ["value", undefined, null],
  } });
  expect(result.data).toEqual({ text: "End of document", nested: { value: null, done: false, offset: 0 }, slots: ["value", null, null] });
  expect(JSON.stringify(result)).not.toContain('"undefined"');
});
