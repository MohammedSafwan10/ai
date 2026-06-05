import { compactUrl, redactSensitiveText } from "./browserSecurity";

export type BrowserExtractMode = "visible_text" | "main_text" | "links" | "tables" | "forms" | "metadata";

export interface BrowserExtractionResult {
  mode: BrowserExtractMode;
  url: string;
  title: string;
  text?: string;
  links?: Array<{ text: string; href: string; title?: string }>;
  tables?: Array<{ caption: string; columns: string[]; rows: string[][] }>;
  forms?: Array<{
    action: string;
    method: string;
    controls: Array<{ type: string; name: string; label: string; placeholder: string; required: boolean; sensitive: boolean }>;
  }>;
  metadata?: Record<string, unknown>;
}

export const normalizeExtractMode = (value: unknown): BrowserExtractMode => {
  const mode = String(value || "visible_text").trim().toLowerCase();
  if (["visible_text", "main_text", "links", "tables", "forms", "metadata"].includes(mode)) return mode as BrowserExtractMode;
  throw new Error("browser_extract mode must be visible_text, main_text, links, tables, forms, or metadata.");
};

export const buildBrowserExtractScript = (mode: BrowserExtractMode) =>
  `(${BROWSER_EXTRACT_SCRIPT})(${JSON.stringify(mode)})`;

export const sanitizeBrowserExtraction = (raw: BrowserExtractionResult): BrowserExtractionResult => ({
  mode: normalizeExtractMode(raw.mode),
  url: compactUrl(String(raw.url || "")),
  title: redactSensitiveText(String(raw.title || ""), 240),
  text: raw.text ? redactSensitiveText(raw.text, 12_000) : undefined,
  links: raw.links?.slice(0, 80).map((link) => ({
    text: redactSensitiveText(String(link.text || ""), 240),
    href: compactExtractedHref(String(link.href || "")),
    title: link.title ? redactSensitiveText(String(link.title), 240) : undefined,
  })),
  tables: raw.tables?.slice(0, 8).map((table) => ({
    caption: redactSensitiveText(String(table.caption || ""), 180),
    columns: (table.columns || []).slice(0, 16).map((column) => redactSensitiveText(String(column || ""), 160)),
    rows: (table.rows || []).slice(0, 50).map((row) =>
      row.slice(0, 16).map((cell) => redactSensitiveText(String(cell || ""), 240)),
    ),
  })),
  forms: raw.forms?.slice(0, 12).map((form) => ({
    action: compactUrl(String(form.action || "")),
    method: redactSensitiveText(String(form.method || "get"), 20),
    controls: (form.controls || []).slice(0, 40).map((control) => ({
      type: redactSensitiveText(String(control.type || "text"), 40),
      name: redactSensitiveText(String(control.name || ""), 120),
      label: redactSensitiveText(String(control.label || ""), 160),
      placeholder: redactSensitiveText(String(control.placeholder || ""), 160),
      required: control.required === true,
      sensitive: control.sensitive === true,
    })),
  })),
  metadata: sanitizeMetadata(raw.metadata),
});

export const browserExtractionOutput = (result: BrowserExtractionResult) => {
  if (result.text) return result.text;
  if (result.links?.length) {
    return result.links.map((link) => `- ${link.text || "(untitled)"} — ${link.href}`).join("\n");
  }
  if (result.tables?.length) {
    return result.tables.map((table, index) => {
      const title = table.caption || `Table ${index + 1}`;
      const header = table.columns.length ? table.columns.join(" | ") : "(no columns)";
      const rows = table.rows.slice(0, 20).map((row) => row.join(" | ")).join("\n");
      return `${title}\n${header}${rows ? `\n${rows}` : ""}`;
    }).join("\n\n");
  }
  if (result.forms?.length) {
    return result.forms.map((form, index) => {
      const controls = form.controls.map((control) =>
        `- ${control.type}${control.name ? ` name=${control.name}` : ""}${control.label ? ` label=${control.label}` : ""}${control.sensitive ? " sensitive" : ""}`,
      ).join("\n");
      return `Form ${index + 1}: ${form.method.toUpperCase()} ${form.action || "(current page)"}\n${controls || "(no controls)"}`;
    }).join("\n\n");
  }
  if (result.metadata) return JSON.stringify(result.metadata, null, 2);
  return "(empty)";
};

const sanitizeMetadata = (metadata: unknown): Record<string, unknown> | undefined => {
  if (!metadata || typeof metadata !== "object") return undefined;
  const sanitizeValue = (value: unknown): unknown => {
    if (typeof value === "string") return redactSensitiveText(value, 1200);
    if (Array.isArray(value)) return value.slice(0, 30).map(sanitizeValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 40).map(([key, item]) => [
      redactSensitiveText(key, 120),
      sanitizeValue(item),
    ]));
  };
  return sanitizeValue(metadata) as Record<string, unknown>;
};

const compactExtractedHref = (rawHref: string) => {
  try {
    const parsed = new URL(rawHref);
    if (parsed.hostname.includes("duckduckgo.com") && parsed.pathname.startsWith("/l/")) {
      const target = parsed.searchParams.get("uddg");
      if (target) return compactUrl(target);
    }
    if (parsed.hostname.includes("google.") && parsed.pathname === "/url") {
      const target = parsed.searchParams.get("q");
      if (target) return compactUrl(target);
    }
  } catch {
    // Fall back to generic compaction below.
  }
  return compactUrl(rawHref);
};

const BROWSER_EXTRACT_SCRIPT = String.raw`
(mode) => {
  const compact = (value, limit = 1000) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
  const visible = (el) => {
    if (!el || el.nodeType !== 1) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.02;
  };
  const textOf = (el, limit = 12000) => compact(el && (el.innerText || el.textContent), limit);
  const absolute = (value) => {
    try { return new URL(value || "", location.href).toString(); } catch { return String(value || ""); }
  };
  const labelFor = (control) => {
    const id = control.id && document.querySelector("label[for='" + CSS.escape(control.id) + "']");
    const wrapping = control.closest("label");
    const aria = control.getAttribute("aria-label") || "";
    const labelledBy = (control.getAttribute("aria-labelledby") || "").split(/\s+/).map((id) => document.getElementById(id)?.innerText || "").join(" ");
    return compact(aria || labelledBy || id?.innerText || wrapping?.innerText || "", 180);
  };
  const visibleText = () => {
    const text = textOf(document.body, 12000);
    return text.split(/\n+/).map((line) => compact(line, 500)).filter(Boolean).slice(0, 240).join("\n");
  };
  const mainText = () => {
    const candidates = Array.from(document.querySelectorAll("article, main, [role='main'], section, .content, #content"));
    const ranked = candidates
      .filter(visible)
      .map((el) => ({ el, text: textOf(el, 14000) }))
      .filter((item) => item.text.length > 80)
      .sort((a, b) => b.text.length - a.text.length);
    return ranked[0]?.text || visibleText();
  };
  const links = () => Array.from(document.querySelectorAll("a[href]"))
    .filter(visible)
    .map((anchor) => ({
      text: compact(anchor.innerText || anchor.getAttribute("aria-label") || anchor.href, 240),
      href: absolute(anchor.getAttribute("href")),
      title: compact(anchor.getAttribute("title") || "", 180),
    }))
    .filter((link) => link.href)
    .slice(0, 80);
  const tables = () => Array.from(document.querySelectorAll("table"))
    .filter(visible)
    .slice(0, 8)
    .map((table, index) => {
      const rows = Array.from(table.querySelectorAll("tr")).slice(0, 60).map((row) =>
        Array.from(row.children).slice(0, 16).map((cell) => compact(cell.innerText || cell.textContent, 240)),
      ).filter((row) => row.some(Boolean));
      const explicitHeaders = Array.from(table.querySelectorAll("thead th")).map((cell) => compact(cell.innerText || cell.textContent, 160)).filter(Boolean);
      const firstRowHeaders = rows[0] || [];
      const columns = explicitHeaders.length ? explicitHeaders : firstRowHeaders;
      const bodyRows = explicitHeaders.length ? rows : rows.slice(1);
      return {
        caption: compact(table.querySelector("caption")?.innerText || table.getAttribute("aria-label") || "Table " + (index + 1), 180),
        columns,
        rows: bodyRows,
      };
    });
  const forms = () => Array.from(document.querySelectorAll("form"))
    .filter(visible)
    .slice(0, 12)
    .map((form) => ({
      action: absolute(form.getAttribute("action") || location.href),
      method: compact(form.getAttribute("method") || "get", 20).toLowerCase(),
      controls: Array.from(form.querySelectorAll("input, textarea, select, button"))
        .filter((control) => visible(control) || ["hidden", "password"].includes((control.getAttribute("type") || "").toLowerCase()))
        .slice(0, 40)
        .map((control) => {
          const type = compact(control.getAttribute("type") || control.tagName.toLowerCase(), 40).toLowerCase();
          const name = compact(control.getAttribute("name") || control.id || "", 120);
          const placeholder = compact(control.getAttribute("placeholder") || "", 160);
          const sensitive = type === "password" || /password|token|secret|api.?key|otp|mfa|card|cvv|ssn/i.test([name, placeholder, labelFor(control)].join(" "));
          return { type, name, label: labelFor(control), placeholder, required: control.hasAttribute("required"), sensitive };
        }),
    }));
  const metadata = () => {
    const meta = (name) => document.querySelector("meta[name='" + name + "'], meta[property='" + name + "']")?.getAttribute("content") || "";
    const headingNodes = Array.from(document.querySelectorAll("h1, h2")).filter(visible).slice(0, 20);
    return {
      url: location.href,
      title: document.title || "",
      description: meta("description") || meta("og:description"),
      canonical: document.querySelector("link[rel='canonical']")?.href || "",
      lang: document.documentElement.lang || "",
      publishedTime: meta("article:published_time") || meta("date") || meta("pubdate"),
      headings: headingNodes.map((node) => ({ level: node.tagName.toLowerCase(), text: compact(node.innerText, 220) })),
    };
  };
  const base = { mode, url: location.href, title: document.title || "" };
  if (mode === "main_text") return { ...base, text: mainText() };
  if (mode === "links") return { ...base, links: links() };
  if (mode === "tables") return { ...base, tables: tables() };
  if (mode === "forms") return { ...base, forms: forms() };
  if (mode === "metadata") return { ...base, metadata: metadata() };
  return { ...base, text: visibleText() };
}
`;
