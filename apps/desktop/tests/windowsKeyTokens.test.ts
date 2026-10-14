import { describe, expect, it } from "vitest";
import { sendKeysToken } from "../src/main/computer/windowsNativeBackend";
describe("Windows key token conversion", () => {
  it("escapes literal SendKeys metacharacters and PowerShell quotes", () => {
    expect(sendKeysToken("+")).toBe("{+}");
    expect(sendKeysToken("{}[]^%~()")).toBe("{{}{}}{[}{]}{^}{%}{~}{(}{)}");
    expect(sendKeysToken("'")).toBe("''");
  });
  it("retains named keys and modifier shortcuts", () => {
    expect(sendKeysToken("enter")).toBe("{ENTER}");
    expect(sendKeysToken("Ctrl+C")).toBe("^c");
    expect(sendKeysToken("ctrl+shift+tab")).toBe("^+{TAB}");
    expect(sendKeysToken("F12")).toBe("{F12}");
  });
});
