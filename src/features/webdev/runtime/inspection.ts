import type { WebDevFile } from "../lib/types";

const countLines = (value: string) => value ? value.split(/\r?\n/).length : 0;

const globToRegex = (glob: string) => {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
};

const matchesIncludePattern = (path: string, includePattern?: string) => {
  if (!includePattern?.trim()) return true;
  return globToRegex(includePattern.trim()).test(path);
};

export const searchWebDevFiles = (
  files: WebDevFile[],
  query: string,
  includePattern?: string,
  caseSensitive = false,
) => {
  const needle = caseSensitive ? query : query.toLowerCase();
  if (!needle.trim()) return [];

  return files
    .filter(file => file.status !== "deleted" && matchesIncludePattern(file.path, includePattern))
    .flatMap(file => {
      const lines = file.content.split(/\r?\n/);
      return lines
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => {
          const haystack = caseSensitive ? line : line.toLowerCase();
          return haystack.includes(needle);
        })
        .slice(0, 20)
        .map(({ line, lineNumber }) => ({
          path: file.path,
          line: lineNumber,
          preview: line.trim().slice(0, 240),
        }));
    })
    .slice(0, 80);
};

const outlineTsLikeFile = (content: string) => {
  const lines = content.split(/\r?\n/);
  const symbols: Array<{ kind: string; name: string; line: number; preview: string }> = [];
  const imports: string[] = [];
  const exports: string[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("import ")) imports.push(trimmed.slice(0, 220));
    if (trimmed.startsWith("export ")) exports.push(trimmed.slice(0, 220));

    const functionMatch = trimmed.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/);
    const componentMatch = trimmed.match(/^(?:export\s+)?const\s+([A-Z][A-Za-z0-9_$]*)\s*=/);
    const hookMatch = trimmed.match(/^(?:export\s+)?(?:const|function)\s+(use[A-Z][A-Za-z0-9_$]*)/);
    const typeMatch = trimmed.match(/^(?:export\s+)?(?:type|interface|enum)\s+([A-Za-z0-9_$]+)/);
    const classMatch = trimmed.match(/^(?:export\s+)?class\s+([A-Za-z0-9_$]+)/);
    const match = functionMatch || componentMatch || hookMatch || typeMatch || classMatch;
    if (match) {
      symbols.push({
        kind: typeMatch ? "type" : classMatch ? "class" : hookMatch ? "hook" : "function",
        name: match[1],
        line: index + 1,
        preview: trimmed.slice(0, 220),
      });
    }
  });

  return { imports, exports, symbols };
};

const outlineCssFile = (content: string) => {
  const selectors = content
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line.endsWith("{") && !line.startsWith("@"))
    .map(({ line, lineNumber }) => ({
      kind: "selector",
      name: line.slice(0, -1).trim(),
      line: lineNumber,
      preview: line.slice(0, 220),
    }))
    .slice(0, 120);
  return { imports: [], exports: [], symbols: selectors };
};

const outlineJsonFile = (content: string) => {
  try {
    const parsed = JSON.parse(content);
    const symbols = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.keys(parsed).map(key => ({ kind: "key", name: key, line: 1, preview: key }))
      : [];
    return { imports: [], exports: [], symbols };
  } catch {
    return { imports: [], exports: [], symbols: [] };
  }
};

export const outlineWebDevFile = (file: WebDevFile) => {
  const path = file.path.toLowerCase();
  const outline = path.endsWith(".css")
    ? outlineCssFile(file.content)
    : path.endsWith(".json")
      ? outlineJsonFile(file.content)
      : outlineTsLikeFile(file.content);

  return {
    path: file.path,
    lines: countLines(file.content),
    chars: file.content.length,
    ...outline,
  };
};

export const extractDiagnosticsFromOutput = (output: string) => {
  const diagnostics: Array<{ message: string; path?: string; line?: number; column?: number; severity: "error" | "warning" }> = [];
  const patterns = [
    /(?<path>[\w./-]+\.(?:tsx?|jsx?|css|json))[:(](?<line>\d+)[,:](?<column>\d+)[)]?\s*(?<message>.*)/i,
    /(?<path>[\w./-]+\.(?:tsx?|jsx?|css|json))\((?<line>\d+),(?<column>\d+)\):\s*(?<message>.*)/i,
  ];

  output.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const match = patterns.map(pattern => trimmed.match(pattern)).find(Boolean);
    if (match?.groups) {
      diagnostics.push({
        path: match.groups.path,
        line: Number(match.groups.line),
        column: Number(match.groups.column),
        message: match.groups.message.trim() || trimmed,
        severity: /warn/i.test(trimmed) ? "warning" : "error",
      });
      return;
    }
    if (/\berror\b/i.test(trimmed)) {
      diagnostics.push({ message: trimmed, severity: "error" });
    }
  });

  return diagnostics.slice(0, 80);
};
