import type { BrowserFormControlRecord, BrowserFormFieldValueInput, BrowserFormRecord, BrowserFormRisk } from "../../shared/types";
import { compactUrl, redactSensitiveText } from "./browserSecurity";

export interface BrowserFormOperationResult {
  forms: BrowserFormRecord[];
  matchedFormId?: string;
  filledCount?: number;
  errors: string[];
  validationErrors: string[];
  valid: boolean;
  submitReady: boolean;
}

export const buildBrowserFormAnalyzeScript = () =>
  `(${BROWSER_FORM_ANALYZE_SCRIPT})()`;

export const buildBrowserFormFillScript = (input: { formId?: string; fields: BrowserFormFieldValueInput[] }) =>
  `(${BROWSER_FORM_FILL_SCRIPT})(${JSON.stringify({
    formId: input.formId || "",
    fields: input.fields.map((field) => ({
      fieldId: field.fieldId || "",
      name: field.name || "",
      label: field.label || "",
      value: field.value,
    })),
  })})`;

export const buildBrowserFormValidateScript = (input: { formId?: string }) =>
  `(${BROWSER_FORM_VALIDATE_SCRIPT})(${JSON.stringify({ formId: input.formId || "" })})`;

export const buildBrowserFormSubmitScript = (input: { formId?: string }) =>
  `(${BROWSER_FORM_SUBMIT_SCRIPT})(${JSON.stringify({ formId: input.formId || "" })})`;

export const sanitizeBrowserForms = (forms: BrowserFormRecord[]): BrowserFormRecord[] =>
  forms.slice(0, 12).reduce<BrowserFormRecord[]>((items, form, index) => {
    const usedIds = new Set(items.map((item) => item.id));
    const formId = uniqueSanitizedId(form.id, usedIds, `f${index + 1}`);
    return [...items, {
      id: formId,
    action: compactUrl(String(form.action || "")),
    method: redactSensitiveText(String(form.method || "get"), 20),
    label: redactSensitiveText(String(form.label || ""), 160),
    submitLabel: redactSensitiveText(String(form.submitLabel || ""), 160),
    risk: normalizeFormRisk(form.risk),
    controls: sanitizeFormControls(form.controls || [], formId),
    valid: typeof form.valid === "boolean" ? form.valid : undefined,
    validationErrors: sanitizeValidationErrors(form.validationErrors),
    lastResult: form.lastResult ? redactSensitiveText(String(form.lastResult), 500) : undefined,
    updatedAt: Number.isFinite(Number(form.updatedAt)) ? Number(form.updatedAt) : Date.now(),
    }];
  }, []);

export const sanitizeBrowserFormOperation = (raw: BrowserFormOperationResult): BrowserFormOperationResult => ({
  forms: sanitizeBrowserForms(raw.forms || []),
  matchedFormId: raw.matchedFormId ? sanitizeId(raw.matchedFormId) : undefined,
  filledCount: Number.isFinite(Number(raw.filledCount)) ? Math.max(0, Number(raw.filledCount)) : undefined,
  errors: sanitizeValidationErrors(raw.errors),
  validationErrors: sanitizeValidationErrors(raw.validationErrors),
  valid: raw.valid === true,
  submitReady: raw.submitReady === true,
});

export const browserFormsOutput = (forms: BrowserFormRecord[]) => {
  if (!forms.length) return "No forms detected on the current page.";
  return forms.map((form) => {
    const required = form.controls.filter((control) => control.required).length;
    const sensitive = form.controls.filter((control) => control.sensitive).length;
    const controls = form.controls.slice(0, 12).map((control) => {
      const flags = [
        control.required ? "required" : "",
        control.sensitive ? "sensitive" : "",
        control.disabled ? "disabled" : "",
      ].filter(Boolean).join(", ");
      return `  - ${control.id} ${control.type}${control.name ? ` name=${control.name}` : ""}${control.label ? ` label=${control.label}` : ""}${flags ? ` (${flags})` : ""}`;
    }).join("\n");
    return [
      `${form.id}: ${form.method.toUpperCase()} ${form.action || "(current page)"} risk=${form.risk}`,
      form.submitLabel ? `Submit: ${form.submitLabel}` : "",
      `Controls: ${form.controls.length}; required=${required}; sensitive=${sensitive}`,
      form.valid === false && form.validationErrors?.length ? `Validation: ${form.validationErrors.join("; ")}` : "",
      controls,
    ].filter(Boolean).join("\n");
  }).join("\n\n");
};

export const browserFormOperationOutput = (label: string, result: BrowserFormOperationResult) => {
  const parts = [
    `${label}${result.matchedFormId ? ` ${result.matchedFormId}` : ""}.`,
    typeof result.filledCount === "number" ? `Filled fields: ${result.filledCount}.` : "",
    `Valid: ${result.valid ? "yes" : "no"}.`,
    `Submit ready: ${result.submitReady ? "yes" : "no"}.`,
    result.errors.length ? `Errors: ${result.errors.join("; ")}` : "",
    result.validationErrors.length ? `Validation: ${result.validationErrors.join("; ")}` : "",
  ];
  return parts.filter(Boolean).join("\n");
};

const sanitizeFormControls = (controls: BrowserFormControlRecord[], formId: string): BrowserFormControlRecord[] => {
  const used = new Set<string>();
  return controls.slice(0, 40).map((control, index) => sanitizeFormControl(control, formId, used, index + 1));
};

const sanitizeFormControl = (control: BrowserFormControlRecord, formId: string, used: Set<string>, index: number): BrowserFormControlRecord => ({
  id: uniqueSanitizedControlId(control.id, used, formId, index),
  type: redactSensitiveText(String(control.type || "text"), 40),
  name: redactSensitiveText(String(control.name || ""), 120),
  label: redactSensitiveText(String(control.label || ""), 160),
  placeholder: redactSensitiveText(String(control.placeholder || ""), 160),
  required: control.required === true,
  sensitive: control.sensitive === true,
  disabled: control.disabled === true,
  checked: typeof control.checked === "boolean" ? control.checked : undefined,
  options: Array.isArray(control.options)
    ? control.options.slice(0, 40).map((option) => redactSensitiveText(String(option || ""), 160))
    : undefined,
});

const sanitizeId = (value: string) =>
  String(value || "").replace(/[^\w:.-]/g, "").slice(0, 80);

const uniqueSanitizedId = (value: string, used: Set<string>, fallback: string) => {
  const base = sanitizeId(value) || fallback;
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
};

const uniqueSanitizedControlId = (value: string, used: Set<string>, formId: string, index: number) => {
  const sanitized = sanitizeId(value);
  const base = sanitized.startsWith(`${formId}-c`) ? sanitized : `${formId}-c${index}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
};

const sanitizeValidationErrors = (errors: unknown) =>
  (Array.isArray(errors) ? errors : [])
    .map((item) => redactSensitiveText(String(item || ""), 400))
    .filter(Boolean)
    .slice(0, 20);

const normalizeFormRisk = (value: unknown): BrowserFormRisk =>
  value === "irreversible" || value === "sensitive" || value === "sensitive_payment" ? value : "safe";

const BROWSER_FORM_SHARED = String.raw`
  const compact = (value, limit = 1000) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
  const visible = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.02;
  };
  const absolute = (value) => {
    try { return new URL(value || location.href, location.href).toString(); } catch { return String(value || ""); }
  };
  const cssEscape = (value) => window.CSS && CSS.escape ? CSS.escape(value) : String(value || "").replace(/["\\]/g, "\\$&");
  const labelFor = (control) => {
    const id = control.id && document.querySelector("label[for='" + cssEscape(control.id) + "']");
    const wrapping = control.closest("label");
    const aria = control.getAttribute("aria-label") || "";
    const labelledBy = (control.getAttribute("aria-labelledby") || "").split(/\s+/).map((id) => document.getElementById(id)?.innerText || "").join(" ");
    return compact(aria || labelledBy || id?.innerText || wrapping?.innerText || "", 180);
  };
  const normalize = (value) => compact(value, 240).toLowerCase();
  const controlType = (control) => compact(control.getAttribute("type") || control.tagName.toLowerCase(), 40).toLowerCase();
  const isSensitiveControl = (control) => {
    const type = controlType(control);
    const name = compact(control.getAttribute("name") || control.id || "", 120);
    const placeholder = compact(control.getAttribute("placeholder") || "", 160);
    const label = labelFor(control);
    return type === "password" || type === "hidden" || type === "file" || /password|token|secret|api.?key|otp|mfa|2fa|card|cvv|cvc|ssn|cookie/i.test([name, placeholder, label].join(" "));
  };
  const allForms = () => {
    const explicit = Array.from(document.querySelectorAll("form"));
    const looseControls = Array.from(document.querySelectorAll("input, textarea, select, [role='combobox']"))
      .filter((control) => !control.closest("form") && visible(control));
    if (!looseControls.length) return explicit;
    const loose = document.createElement("form");
    loose.setAttribute("data-privora-virtual-form", "true");
    looseControls.forEach((control) => loose.appendChild(control.cloneNode(false)));
    loose.__privoraControls = looseControls;
    return [...explicit, loose];
  };
  const controlsForForm = (form) => Array.from(form.__privoraControls || form.querySelectorAll("input, textarea, select, button, [role='combobox']"))
    .filter((control) => visible(control) || ["hidden", "password", "file"].includes(controlType(control)));
  const submitForForm = (form) => controlsForForm(form).find((control) => {
    const type = controlType(control);
    return type === "submit" || type === "button" || control.getAttribute("role") === "button";
  });
  const nextUniqueFormId = (used, preferred) => {
    let base = compact(preferred || "", 40).replace(/[^\w:.-]/g, "") || "";
    if (!base || used.has(base)) {
      let index = 1;
      do {
        base = "f" + index;
        index += 1;
      } while (used.has(base));
    }
    used.add(base);
    return base;
  };
  const nextUniqueControlId = (used, preferred, formId, index) => {
    let base = compact(preferred || "", 60).replace(/[^\w:.-]/g, "") || "";
    if (!base || used.has(base)) base = formId + "-c" + index;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = base + "-" + suffix;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  };
  const formRisk = (form, controls, submitLabel) => {
    const haystack = [form.getAttribute("action") || "", form.getAttribute("aria-label") || "", submitLabel, ...controls.map((control) => [control.name, control.label, control.placeholder].join(" "))].join(" ");
    const hasSensitive = controls.some((control) => control.sensitive);
    if (/delete|transfer|book|booking|apply|application|submit order|confirm order|place order|irreversible/i.test(haystack)) return "irreversible";
    if (hasSensitive && /pay|payment|purchase|checkout|card|cvv|cvc/i.test(haystack)) return "sensitive_payment";
    if (hasSensitive) return "sensitive";
    if (/pay|purchase|checkout/i.test(haystack)) return "irreversible";
    return "safe";
  };
  const validationForForm = (form) => {
    const controls = controlsForForm(form).filter((control) => typeof control.checkValidity === "function");
    const invalid = controls.filter((control) => !control.checkValidity());
    const controlMessages = invalid.map((control) => {
      const label = labelFor(control) || control.getAttribute("name") || control.id || controlType(control);
      return compact(label + ": " + (control.validationMessage || "invalid"), 300);
    });
    const visibleMessages = Array.from(document.querySelectorAll("[role='alert'], .error, .invalid, .field-error, [aria-invalid='true']"))
      .filter(visible)
      .map((node) => compact(node.innerText || node.textContent, 300))
      .filter(Boolean);
    return [...new Set([...controlMessages, ...visibleMessages])].slice(0, 20);
  };
  const analyzeForms = () => {
    const forms = allForms().filter((form) => visible(form) || form.__privoraControls?.length);
    const usedFormIds = new Set();
    return forms.slice(0, 12).map((form, formIndex) => {
      const formId = nextUniqueFormId(usedFormIds, form.dataset?.privoraFormRef || "f" + (formIndex + 1));
      if (form.dataset) form.dataset.privoraFormRef = formId;
      const rawControls = controlsForForm(form).slice(0, 40);
      const usedControlIds = new Set();
      const controls = rawControls.map((control, controlIndex) => {
        const existingFieldRef = control.dataset?.privoraFieldRef || "";
        const preferredFieldRef = existingFieldRef.startsWith(formId + "-c") ? existingFieldRef : "";
        const id = nextUniqueControlId(usedControlIds, preferredFieldRef, formId, controlIndex + 1);
        if (control.dataset) control.dataset.privoraFieldRef = id;
        const type = controlType(control);
        const options = control.tagName === "SELECT"
          ? Array.from(control.options || []).map((option) => compact(option.text || option.value, 160)).filter(Boolean).slice(0, 40)
          : undefined;
        return {
          id,
          type,
          name: compact(control.getAttribute("name") || control.id || "", 120),
          label: labelFor(control),
          placeholder: compact(control.getAttribute("placeholder") || "", 160),
          required: control.hasAttribute("required") || control.getAttribute("aria-required") === "true",
          sensitive: isSensitiveControl(control),
          disabled: control.disabled === true || control.getAttribute("aria-disabled") === "true",
          checked: typeof control.checked === "boolean" ? control.checked : undefined,
          options,
        };
      });
      const submit = submitForForm(form);
      const submitLabel = compact(submit?.innerText || submit?.value || submit?.getAttribute("aria-label") || "", 160);
      const validationErrors = validationForForm(form);
      const valid = typeof form.checkValidity === "function" ? form.checkValidity() : validationErrors.length === 0;
      return {
        id: formId,
        action: absolute(form.getAttribute("action") || location.href),
        method: compact(form.getAttribute("method") || "get", 20).toLowerCase(),
        label: compact(form.getAttribute("aria-label") || form.querySelector("legend,h1,h2,h3")?.innerText || "", 160),
        submitLabel,
        risk: formRisk(form, controls, submitLabel),
        controls,
        valid,
        validationErrors,
        updatedAt: Date.now(),
      };
    });
  };
`;

const BROWSER_FORM_ANALYZE_SCRIPT = String.raw`
() => {
  ${BROWSER_FORM_SHARED}
  return analyzeForms();
}
`;

const BROWSER_FORM_FILL_SCRIPT = String.raw`
(input) => {
  ${BROWSER_FORM_SHARED}
  const forms = analyzeForms();
  const targetForm = input.formId ? forms.find((form) => form.id === input.formId) : forms[0];
  const errors = [];
  let filledCount = 0;
  const formElement = targetForm ? Array.from(document.querySelectorAll("form")).find((form) => form.dataset?.privoraFormRef === targetForm.id) : null;
  const sourceControls = formElement ? controlsForForm(formElement) : Array.from(document.querySelectorAll("input, textarea, select, [role='combobox']"));
  const controlById = new Map(sourceControls.map((control) => [control.dataset?.privoraFieldRef || "", control]));
  const findControl = (field) => {
    if (field.fieldId && controlById.has(field.fieldId)) return controlById.get(field.fieldId);
    const wantedName = normalize(field.name);
    const wantedLabel = normalize(field.label);
    return sourceControls.find((control) => {
      const name = normalize(control.getAttribute("name") || control.id || "");
      const label = normalize(labelFor(control));
      return (wantedName && name === wantedName) || (wantedLabel && label === wantedLabel);
    });
  };
  if (!targetForm) errors.push("No matching form found.");
  for (const field of input.fields || []) {
    const control = findControl(field || {});
    if (!control) {
      errors.push("Field not found: " + compact(field.fieldId || field.name || field.label, 120));
      continue;
    }
    if (isSensitiveControl(control)) {
      errors.push("Skipped sensitive field: " + compact(control.dataset?.privoraFieldRef || control.getAttribute("name") || labelFor(control), 120));
      continue;
    }
    if (control.disabled === true || control.getAttribute("aria-disabled") === "true") {
      errors.push("Skipped disabled field: " + compact(control.dataset?.privoraFieldRef || control.getAttribute("name") || labelFor(control), 120));
      continue;
    }
    const type = controlType(control);
    control.focus?.();
    if (type === "checkbox" || type === "radio" || control.getAttribute("role") === "switch") {
      control.checked = Boolean(field.value);
    } else if (control.tagName === "SELECT") {
      const wanted = normalize(field.value);
      const option = Array.from(control.options || []).find((item) => normalize(item.value) === wanted || normalize(item.text) === wanted);
      if (!option) {
        errors.push("Option not found for " + compact(control.dataset?.privoraFieldRef || control.getAttribute("name") || labelFor(control), 120));
        continue;
      }
      control.value = option.value;
    } else if ("value" in control) {
      control.value = String(field.value ?? "");
    } else {
      errors.push("Unsupported field type: " + type);
      continue;
    }
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    filledCount += 1;
  }
  const nextForms = analyzeForms().map((form) => form.id === targetForm?.id ? { ...form, lastResult: "Filled " + filledCount + " field(s)" } : form);
  const nextForm = nextForms.find((form) => form.id === targetForm?.id) || nextForms[0];
  const validationErrors = nextForm ? nextForm.validationErrors || [] : errors;
  const submit = formElement ? submitForForm(formElement) : null;
  return {
    forms: nextForms,
    matchedFormId: nextForm?.id || "",
    filledCount,
    errors,
    validationErrors,
    valid: nextForm?.valid === true,
    submitReady: Boolean(submit && !submit.disabled && nextForm?.valid === true),
  };
}
`;

const BROWSER_FORM_VALIDATE_SCRIPT = String.raw`
(input) => {
  ${BROWSER_FORM_SHARED}
  const forms = analyzeForms();
  const targetForm = input.formId ? forms.find((form) => form.id === input.formId) : forms[0];
  const formElement = targetForm ? Array.from(document.querySelectorAll("form")).find((form) => form.dataset?.privoraFormRef === targetForm.id) : null;
  const submit = formElement ? submitForForm(formElement) : null;
  return {
    forms,
    matchedFormId: targetForm?.id || "",
    errors: targetForm ? [] : ["No matching form found."],
    validationErrors: targetForm?.validationErrors || [],
    valid: targetForm?.valid === true,
    submitReady: Boolean(submit && !submit.disabled && targetForm?.valid === true),
  };
}
`;

const BROWSER_FORM_SUBMIT_SCRIPT = String.raw`
(input) => {
  ${BROWSER_FORM_SHARED}
  const forms = analyzeForms();
  const targetForm = input.formId ? forms.find((form) => form.id === input.formId) : forms[0];
  const formElement = targetForm ? Array.from(document.querySelectorAll("form")).find((form) => form.dataset?.privoraFormRef === targetForm.id) : null;
  const errors = [];
  if (!targetForm || !formElement) errors.push("No matching form found.");
  if (targetForm && targetForm.valid === false) errors.push("Form is invalid.");
  if (!errors.length) {
    const submit = submitForForm(formElement);
    if (submit && !submit.disabled) submit.click();
    else if (typeof formElement.requestSubmit === "function") formElement.requestSubmit();
    else formElement.submit();
  }
  return {
    forms: analyzeForms(),
    matchedFormId: targetForm?.id || "",
    errors,
    validationErrors: targetForm?.validationErrors || [],
    valid: targetForm?.valid === true,
    submitReady: errors.length === 0,
  };
}
`;
