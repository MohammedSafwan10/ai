import type { ComputerSnapshotNodeRecord, ComputerUseActionInput, ComputerUseDiagnosisRecord } from "../../shared/types";

const credentialPattern = /\b(password|passwd|pwd|otp|mfa|2fa|authenticator|passcode|pin|security code|recovery code|credit.?card|card number|cvv|cvc|ssn|api.?key|secret|token|cookie)\b/i;
const irreversiblePattern = /\b(pay|purchase|checkout|book|booking|transfer|wire|send money|delete account|delete permanently|irreversible|submit application|apply now|place order|confirm order|unsubscribe|cancel subscription)\b/i;
const secureDesktopPattern = /\b(user account control|windows security|lock screen|credential ui|secure desktop|administrator permission)\b/i;
const secretValuePattern = /\bsk-[a-z0-9_-]{8,}\b|bearer\s+[a-z0-9._~+/=-]{8,}|\b(?:\d[ -]*?){13,19}\b|\b\d{6,8}\b/i;

export const computerActionHardBlockReason = (
  input: Partial<ComputerUseActionInput>,
  target?: Partial<ComputerSnapshotNodeRecord>,
): ComputerUseDiagnosisRecord | null => {
  const action = String(input.action || "").toLowerCase();
  const key = String(input.key || "").toLowerCase();
  const joined = [
    input.ref,
    input.targetRef,
    input.text,
    input.value,
    input.key,
    target?.role,
    target?.name,
    target?.automationId,
  ].map((item) => String(item || "")).join(" ");

  if (secureDesktopPattern.test(joined)) {
    return {
      kind: "secure_desktop",
      message: "Computer Use cannot operate on UAC, lock screen, or secure credential desktop surfaces.",
      capability: "secure_desktop",
    };
  }

  if ((action === "type" || action === "set_value") && (target?.sensitive === true || credentialPattern.test(joined) || secretValuePattern.test(String(input.text ?? input.value ?? "")))) {
    return {
      kind: "blocked_by_policy",
      message: "Computer Use will not type or extract passwords, MFA codes, payment data, API keys, tokens, or hidden secrets.",
    };
  }

  if ((action === "click" || action === "double_click" || action === "invoke" || action === "press" || action === "select") && (target?.sensitive === true || credentialPattern.test(joined) || irreversiblePattern.test(joined))) {
    return {
      kind: "blocked_by_policy",
      message: "Computer Use blocks irreversible real-world actions such as payments, transfers, bookings, account deletion, and order submission.",
    };
  }

  if (action === "press" && key === "enter" && irreversiblePattern.test(joined)) {
    return {
      kind: "blocked_by_policy",
      message: "Computer Use will not press Enter on an irreversible submit/payment/delete flow.",
    };
  }

  return null;
};

export const redactComputerText = (value: string, maxChars = 4_000) => {
  const redacted = value
    .replace(/(password|passwd|pwd|otp|mfa|2fa|api[_-]?key|secret|token|cookie)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[redacted-card]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted-email]");
  return redacted.length > maxChars ? `${redacted.slice(0, maxChars)}\n[truncated]` : redacted;
};
