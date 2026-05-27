const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /AIza[0-9A-Za-z_-]{20,}/g,
  /(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s]+/gi,
  /Bearer\s+[A-Za-z0-9._~+/=-]{12,}/g,
];

export const redactSecrets = (value: string) =>
  SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[redacted]"), value);
