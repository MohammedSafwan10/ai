import { describe, expect, it } from "vitest";
import { browserFormsOutput, sanitizeBrowserFormOperation, sanitizeBrowserForms } from "../src/main/browser/browserForms";

describe("browser form helpers", () => {
  it("sanitizes form metadata without exposing raw sensitive values", () => {
    const forms = sanitizeBrowserForms([
      {
        id: "f1 unsafe id",
        action: "https://example.com/submit?token=secret",
        method: "post",
        label: "Payment form",
        submitLabel: "Pay now",
        risk: "sensitive_payment",
        controls: [
          {
            id: "f1-c1",
            type: "text",
            name: "email",
            label: "Email safwan@example.com",
            placeholder: "",
            required: true,
            sensitive: false,
            disabled: false,
            value: "safwan@example.com",
          } as never,
          {
            id: "f1-c2",
            type: "password",
            name: "password",
            label: "Password",
            placeholder: "",
            required: true,
            sensitive: true,
            disabled: false,
            value: "super-secret",
          } as never,
        ],
        valid: false,
        validationErrors: ["password=super-secret"],
        updatedAt: 1,
      },
    ]);

    const output = browserFormsOutput(forms);
    expect(forms[0].id).toBe("f1unsafeid");
    expect(forms[0].action).toBe("https://example.com/submit?...");
    expect(output).toContain("risk=sensitive_payment");
    expect(output).toContain("[email]");
    expect(JSON.stringify(forms)).not.toContain("super-secret");
    expect(JSON.stringify(forms)).not.toContain("safwan@example.com");
  });

  it("deduplicates repeated form ids in sanitized output", () => {
    const forms = sanitizeBrowserForms([
      {
        id: "f1",
        action: "http://localhost/form-a",
        method: "post",
        label: "Dynamic signup",
        submitLabel: "Create signup",
        risk: "safe",
        controls: [],
        updatedAt: 1,
      },
      {
        id: "f1",
        action: "http://localhost/form-b",
        method: "post",
        label: "Validation heavy",
        submitLabel: "Submit validation form",
        risk: "safe",
        controls: [],
        updatedAt: 1,
      },
    ]);

    expect(forms.map((form) => form.id)).toEqual(["f1", "f1-2"]);
  });

  it("rekeys stale control ids when a form id changes after dynamic reveal", () => {
    const forms = sanitizeBrowserForms([
      {
        id: "f2",
        action: "http://localhost/validation",
        method: "post",
        label: "Visible validation form",
        submitLabel: "Submit validation form",
        risk: "safe",
        controls: [
          { id: "f1-c1", type: "text", name: "name", label: "Name", placeholder: "", required: true, sensitive: false, disabled: false },
          { id: "f1-c2", type: "email", name: "email", label: "Email", placeholder: "", required: true, sensitive: false, disabled: false },
        ],
        updatedAt: 1,
      },
      {
        id: "f3",
        action: "http://localhost/payment",
        method: "post",
        label: "Sensitive payment form",
        submitLabel: "Submit secure payment",
        risk: "sensitive_payment",
        controls: [
          { id: "f2-c1", type: "password", name: "password", label: "Password", placeholder: "", required: true, sensitive: true, disabled: false },
          { id: "f2-c2", type: "text", name: "cvv", label: "CVV", placeholder: "", required: true, sensitive: true, disabled: false },
        ],
        updatedAt: 1,
      },
    ]);

    expect(forms[0].controls.map((control) => control.id)).toEqual(["f2-c1", "f2-c2"]);
    expect(forms[1].controls.map((control) => control.id)).toEqual(["f3-c1", "f3-c2"]);
  });

  it("bounds form operation evidence", () => {
    const result = sanitizeBrowserFormOperation({
      forms: [],
      errors: Array.from({ length: 40 }, (_, index) => `error ${index}`),
      validationErrors: ["api_key=abc123"],
      valid: false,
      submitReady: false,
    });

    expect(result.errors).toHaveLength(20);
    expect(result.validationErrors[0]).toContain("[redacted]");
  });
});
