const HTML_ERROR_RE = /<(?:!doctype|html|head|body|script|style|noscript)\b/i;
const CHALLENGE_RE = /challenge-error-text|challenge-platform|cdn-cgi\/challenge|cloudflare|enable javascript and cookies/i;

const stripTags = (value: string) =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeProviderErrorMessage = (
  value: string,
  fallback = "The model provider rejected the request. Please retry in a moment."
) => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  if (CHALLENGE_RE.test(raw)) {
    return "The model provider returned a browser verification page instead of an AI response. Refresh or sign in to the provider/CLIProxy, then retry.";
  }

  if (HTML_ERROR_RE.test(raw)) {
    const text = stripTags(raw);
    if (CHALLENGE_RE.test(text)) {
      return "The model provider returned a browser verification page instead of an AI response. Refresh or sign in to the provider/CLIProxy, then retry.";
    }
    return text
      ? `The model provider returned an HTML error page: ${text.slice(0, 220)}${text.length > 220 ? "..." : ""}`
      : fallback;
  }

  return raw.length > 700 ? `${raw.slice(0, 700)}...` : raw;
};

