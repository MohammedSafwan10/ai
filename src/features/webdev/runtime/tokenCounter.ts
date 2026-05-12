type WebDevContentKind = "code" | "json" | "mixed";

const ratioByKind: Record<WebDevContentKind, number> = {
  code: 2.8,
  json: 2.5,
  mixed: 3.3,
};

const detectKind = (text: string, path?: string): WebDevContentKind => {
  if (/\.json$/i.test(path || "")) return "json";
  if (/\.(ts|tsx|js|jsx|css|html|md|json)$/i.test(path || "")) return "code";
  const sample = text.slice(0, 700);
  if (/\b(import|export|const|let|function|class|return)\b/.test(sample) || /[{};]\s*$/.test(sample)) return "code";
  return "mixed";
};

export const estimateWebDevTokens = (text: string, path?: string) => {
  if (!text) return 0;
  const kind = detectKind(text, path);
  let length = text.length;
  const repeatedWhitespace = text.match(/\s{2,}/g);
  if (repeatedWhitespace) {
    length -= repeatedWhitespace.reduce((total, match) => total + match.length * 0.25, 0);
  }
  const nonAscii = text.match(/[^\x00-\x7F]/g);
  if (nonAscii) length += nonAscii.length * 1.5;
  return Math.ceil(Math.max(1, length / ratioByKind[kind]));
};

