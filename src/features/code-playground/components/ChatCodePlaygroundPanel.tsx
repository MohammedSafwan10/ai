import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronDown, Code2, Copy, Eye, Play, Square, Terminal, Trash2, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { CodeEditor } from "./CodeEditor";
import { transpileSnippet } from "../lib/transpileSnippet";
import { bootWebContainer, canUseWebContainer } from "../../webdev/runtime/webcontainer";
import { cn } from "../../../lib/utils";
import { copyTextToClipboard } from "../../../lib/clipboard";
import { useToast } from "../../ui/ToastProvider";
import type { WebContainerProcess } from "@webcontainer/api";

export interface CodePlaygroundPayload {
  code?: string;
  language?: string;
  version?: number;
}

type ConsoleEntry = {
  id: string;
  type: "log" | "warn" | "error" | "result" | "info" | "input" | "stdin";
  text: string;
};

type RunnerMode = "idle" | "browser" | "node";

const normalizeLanguage = (language?: string) => {
  const value = (language || "javascript").toLowerCase();
  if (value === "js" || value === "node") return "javascript";
  if (value === "ts") return "typescript";
  if (value === "html" || value === "css" || value === "json" || value === "jsx" || value === "tsx") return value;
  return "javascript";
};

const languageOptions = [
  { value: "javascript", label: "JavaScript", shortLabel: "JS", action: "Run" },
  { value: "typescript", label: "TypeScript", shortLabel: "TS", action: "Run" },
  { value: "jsx", label: "JSX", shortLabel: "JSX", action: "Preview" },
  { value: "tsx", label: "TSX", shortLabel: "TSX", action: "Preview" },
  { value: "html", label: "HTML", shortLabel: "HTML", action: "Preview" },
  { value: "css", label: "CSS", shortLabel: "CSS", action: "Preview" },
  { value: "json", label: "JSON", shortLabel: "JSON", action: "Validate" },
] as const;

const createEntry = (type: ConsoleEntry["type"], text: string): ConsoleEntry => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type,
  text,
});

const cleanTerminalChunk = (value: string) =>
  value
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "\n");

const usesCommonJsRuntime = (code: string) =>
  /\brequire\s*\(|\bmodule\.exports\b|\bexports\./.test(code);

const usesPromptInput = (code: string) => /\bprompt\s*\(/.test(code);

const wrapCommonJsPromptSnippet = (code: string) => `"use strict";
${getNodeCommonJsPrelude()}

(async () => {
${prepareNodeSnippet(code)}
  __privoraClosePrompt();
})().catch(error => {
  __privoraClosePrompt();
  console.error(error && (error.stack || error.message) ? (error.stack || error.message) : error);
  process.exitCode = 1;
});
`;

const wrapCommonJsSnippet = (code: string) => usesPromptInput(code)
  ? wrapCommonJsPromptSnippet(code)
  : `"use strict";\n\n${code}\n`;

const getNodeCommonJsPrelude = () => `const __privoraNodeReadline = require("node:readline");
const __privoraPromptReader = __privoraNodeReadline.createInterface({ input: process.stdin, output: process.stdout });
const __privoraPrompt = (message = "", defaultValue = "") => new Promise(resolve => {
  __privoraPromptReader.question(message ? String(message) : "", answer => resolve(answer || defaultValue || ""));
});
const __privoraClosePrompt = () => __privoraPromptReader.close();
`;

const getNodeEsmPrelude = () => `import { createInterface as __privoraCreateInterface } from "node:readline";
const __privoraPromptReader = __privoraCreateInterface({ input: process.stdin, output: process.stdout });
const __privoraPrompt = (message = "", defaultValue = "") => new Promise(resolve => {
  __privoraPromptReader.question(message ? String(message) : "", answer => resolve(answer || defaultValue || ""));
});
const __privoraClosePrompt = () => __privoraPromptReader.close();
`;

const prepareNodeSnippet = (code: string) => code.replace(/\bprompt\s*\(/g, "await __privoraPrompt(");

const wrapEsmPromptSnippet = (code: string) => `${getNodeEsmPrelude()}
try {
${prepareNodeSnippet(code)}
} finally {
  __privoraClosePrompt();
}
`;

const wrapEsmSnippet = (code: string) => usesPromptInput(code) ? wrapEsmPromptSnippet(code) : code;

const emptyPreviewSrcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{height:100%;margin:0;font-family:Inter,system-ui,sans-serif;color:#8a817a;background:#fffdf9}
body{display:grid;place-items:center}.hint{font-size:13px}
</style></head><body><div class="hint">Run or preview code to see output.</div></body></html>`;

const escapeClosingScript = (value: string) => value.replace(/<\/script/gi, "<\\/script");

const getConsoleBridge = (token: string, stdin = "") => `<script>
(function(){
  var token = ${JSON.stringify(token)};
  var stdinText = ${JSON.stringify(stdin)};
  var stdinLines = stdinText.length > 0 ? stdinText.replace(/\\r\\n/g, "\\n").split("\\n") : [];
  function send(kind, value) {
    try { parent.postMessage({ type: "privora-playground-event", token: token, kind: kind, value: value }, "*"); } catch (_) {}
  }
  function format(value) {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.stack || value.message;
    try { return JSON.stringify(value, null, 2); } catch (_) { return String(value); }
  }
  ["log","warn","error"].forEach(function(kind) {
    var original = console[kind];
    console[kind] = function() {
      var args = Array.prototype.slice.call(arguments).map(format).join(" ");
      send(kind, args);
      original.apply(console, arguments);
    };
  });
  function readInput(defaultValue) {
    if (stdinLines.length > 0) return stdinLines.shift();
    return defaultValue == null ? "" : String(defaultValue);
  }
  window.prompt = function(message, defaultValue) {
    if (message) send("input", String(message));
    var value = readInput(defaultValue);
    send("stdin", value);
    return value;
  };
  window.process = window.process || { stdin: {}, stdout: {}, stderr: {}, env: {} };
  window.require = window.require || function(name) {
    if (name === "readline" || name === "node:readline") {
      return {
        createInterface: function() {
          return {
            question: function(query, callback) {
              if (query) send("input", String(query));
              var value = readInput("");
              send("stdin", value);
              setTimeout(function() { callback(value); }, 0);
            },
            close: function() {}
          };
        }
      };
    }
    throw new Error('Module "' + name + '" is not available in the browser playground.');
  };
  window.addEventListener("error", function(event) {
    send("error", event.error ? format(event.error) : event.message);
  });
  window.addEventListener("unhandledrejection", function(event) {
    send("error", format(event.reason || "Unhandled promise rejection"));
  });
  window.__privoraPlaygroundDone = function() { send("done", ""); };
  window.__privoraPlaygroundResult = function(value) {
    if (value !== undefined) send("result", format(value));
  };
})();
</script>`;

const prepareReactSnippet = (code: string) =>
  code
    .replace(/^\s*import\s+React(?:\s*,\s*\{[^}]*\})?\s+from\s+["']react["'];?\s*$/gm, "")
    .replace(/^\s*import\s+\{?\s*createRoot\s*\}?\s+from\s+["']react-dom\/client["'];?\s*$/gm, "")
    .replace(/^\s*import\s+ReactDOM\s+from\s+["']react-dom\/client["'];?\s*$/gm, "")
    .replace(/\b(?:ReactDOM\.)?createRoot\s*\([^)]*\)\s*\.\s*render\s*\(/g, "render(");

const getUnsupportedBrowserSnippetMessage = (code: string) => {
  const usesFs = /["']fs["']|["']node:fs["']/.test(code);
  const unsupportedRequire = code.match(/\brequire\s*\(\s*["'](?!readline["']|node:readline["'])([^"']+)["']\s*\)/);

  if (!unsupportedRequire && !usesFs) return null;

  const moduleName = usesFs ? "fs" : unsupportedRequire?.[1] || "that module";

  return [
    `This needs the Node.js "${moduleName}" module, but Code Playground runs browser snippets.`,
    "Use JavaScript or TypeScript Console mode for Node snippets. Use Web Dev mode for full app examples.",
  ].join("\n");
};

const wrapUserModule = (code: string, autoRenderApp: boolean) => `${getInlineReactRuntime()}
try {
  const __privoraResult = await (async () => {
${code}
    ${autoRenderApp ? '\nif (typeof App === "function") render(React.createElement(App));' : ""}
  })();
  window.__privoraPlaygroundResult(__privoraResult);
} catch (error) {
  console.error(error);
} finally {
  window.__privoraPlaygroundDone();
}`;

const getInlineReactRuntime = () => `const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat() };
  },
  Fragment: Symbol.for("privora.fragment"),
};
const renderNode = (node) => {
  if (node == null || node === false || node === true) return document.createTextNode("");
  if (typeof node === "string" || typeof node === "number") return document.createTextNode(String(node));
  if (Array.isArray(node)) {
    const fragment = document.createDocumentFragment();
    node.forEach(child => fragment.appendChild(renderNode(child)));
    return fragment;
  }
  if (typeof node.type === "function") return renderNode(node.type({ ...(node.props || {}), children: node.children }));
  if (node.type === React.Fragment) return renderNode(node.children);
  const element = document.createElement(node.type);
  Object.entries(node.props || {}).forEach(([key, value]) => {
    if (key === "children" || value == null || typeof value === "function") return;
    if (key === "className") element.setAttribute("class", String(value));
    else if (key === "style" && typeof value === "object") Object.assign(element.style, value);
    else element.setAttribute(key, String(value));
  });
  node.children.forEach(child => element.appendChild(renderNode(child)));
  return element;
};
const root = document.getElementById("root");
const render = (node) => {
  if (!root) return;
  root.replaceChildren(renderNode(node));
};
`;

const createScriptPreview = (code: string, token: string, isPreviewLanguage: boolean, stdin = "") => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      html, body, #root { min-height: 100%; }
      body { margin: 0; font-family: Inter, system-ui, sans-serif; color: #292524; background: #fffdf9; }
      #root { padding: ${isPreviewLanguage ? "16px" : "0"}; }
    </style>
    ${getConsoleBridge(token, stdin)}
  </head>
  <body>
    <div id="root"></div>
    <script type="module">${escapeClosingScript(wrapUserModule(code, isPreviewLanguage))}</script>
  </body>
</html>`;

const createCssPreview = (code: string, token: string) => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${getConsoleBridge(token)}
    <style>${code}</style>
  </head>
  <body>
    <main class="playground-demo">
      <section>
        <h1>CSS Preview</h1>
        <p>Edit CSS and preview how common elements respond.</p>
        <button>Button</button>
      </section>
    </main>
    <script>window.__privoraPlaygroundDone();</script>
  </body>
</html>`;

const createHtmlPreview = (code: string, token: string, stdin = "") => {
  const bridge = getConsoleBridge(token, stdin);
  const doneScript = "<script>window.__privoraPlaygroundDone();</script>";
  if (/<html[\s>]/i.test(code)) {
    const withBridge = /<head[\s>]/i.test(code)
      ? code.replace(/<head(\s[^>]*)?>/i, match => `${match}${bridge}`)
      : code.replace(/<html(\s[^>]*)?>/i, match => `${match}${bridge}`);
    return /<\/body>/i.test(withBridge) ? withBridge.replace(/<\/body>/i, `${doneScript}</body>`) : `${withBridge}${doneScript}`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${bridge}</head><body>${code}${doneScript}</body></html>`;
};

export const ChatCodePlaygroundPanel = memo(function ChatCodePlaygroundPanel({
  isOpen,
  isDarkMode,
  width,
  payload,
  onWidthChange,
  onClose,
}: {
  isOpen: boolean;
  isDarkMode: boolean;
  width: number;
  payload?: CodePlaygroundPayload;
  onWidthChange: (width: number) => void;
  onClose: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const terminalInputRef = useRef<HTMLInputElement | null>(null);
  const nodeProcessRef = useRef<WebContainerProcess | null>(null);
  const nodeInputWriterRef = useRef<WritableStreamDefaultWriter<string> | null>(null);
  const codeRef = useRef(payload?.code ?? "");
  const activeRunTokenRef = useRef("");
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const [code, setCode] = useState(payload?.code ?? "");
  const [language, setLanguage] = useState(payload?.language || "javascript");
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [tab, setTab] = useState<"code" | "preview" | "console">("code");
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [terminalInput, setTerminalInput] = useState("");
  const [runnerMode, setRunnerMode] = useState<RunnerMode>("idle");
  const [previewSrcDoc, setPreviewSrcDoc] = useState(emptyPreviewSrcDoc);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const { notify } = useToast();
  const normalizedLanguage = useMemo(() => normalizeLanguage(language), [language]);
  const selectedLanguage = useMemo(
    () => languageOptions.find(option => option.value === normalizedLanguage) || languageOptions[0],
    [normalizedLanguage]
  );
  const selectedLanguageHasDistinctBadge = selectedLanguage.shortLabel !== selectedLanguage.label;
  const actionLabel = selectedLanguage.action;
  const actionTitle =
    normalizedLanguage === "json"
      ? "Validate JSON"
      : actionLabel === "Preview"
        ? `Preview ${selectedLanguage.label}`
        : `Run ${selectedLanguage.label}`;

  useEffect(() => {
    if (payload?.code !== undefined) setCode(payload.code);
    if (payload?.language) setLanguage(payload.language);
    if (payload?.version) setTab("code");
  }, [payload?.version]);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => () => {
    nodeInputWriterRef.current?.releaseLock();
    nodeInputWriterRef.current = null;
    nodeProcessRef.current?.kill();
    nodeProcessRef.current = null;
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data || {};
      if (data.type !== "privora-playground-event") return;
      if (data.token !== activeRunTokenRef.current) return;
      if (data.kind === "done") {
        setEntries(prev => prev.filter(entry => entry.text !== "Running..." && entry.text !== "Previewing..."));
        setIsRunning(false);
        return;
      }
      const type: ConsoleEntry["type"] =
        data.kind === "error"
          ? "error"
          : data.kind === "warn"
            ? "warn"
            : data.kind === "result"
              ? "result"
              : data.kind === "input"
                ? "input"
                : data.kind === "stdin"
                  ? "stdin"
                  : "log";
      setEntries(prev => [
        ...prev.filter(entry => entry.text !== "Running..." && entry.text !== "Previewing..."),
        createEntry(type, String(data.value || "")),
      ]);
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    if (!isLanguageMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setIsLanguageMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsLanguageMenuOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLanguageMenuOpen]);

  const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const maxWidth = Math.min(900, Math.round(window.innerWidth * 0.72));
      const minWidth = Math.min(400, Math.round(window.innerWidth * 0.52));
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, window.innerWidth - moveEvent.clientX));
      onWidthChange(nextWidth);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }, [onWidthChange]);

  const stopRun = useCallback(() => {
    activeRunTokenRef.current = "";
    nodeInputWriterRef.current?.releaseLock();
    nodeInputWriterRef.current = null;
    nodeProcessRef.current?.kill();
    nodeProcessRef.current = null;
    setIsRunning(false);
    setRunnerMode("idle");
    setTerminalInput("");
    setEntries(prev => [
      ...prev.filter(entry => entry.text !== "Running..." && entry.text !== "Previewing..."),
      createEntry("info", "Process stopped."),
    ]);
  }, []);

  const runCode = useCallback(async () => {
    if (isRunning) return;
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    nodeInputWriterRef.current?.releaseLock();
    nodeInputWriterRef.current = null;
    nodeProcessRef.current?.kill();
    nodeProcessRef.current = null;

    if (normalizedLanguage === "json") {
      try {
        const parsed = JSON.parse(codeRef.current);
        const formatted = JSON.stringify(parsed, null, 2);
        setCode(formatted);
        setEntries([createEntry("result", "Valid JSON")]);
      } catch (error) {
        setEntries([createEntry("error", error instanceof Error ? error.message : "Invalid JSON")]);
      }
      setTab("console");
      setRunnerMode("idle");
      return;
    }

    if (normalizedLanguage === "jsx" || normalizedLanguage === "tsx") {
      const unsupportedMessage = getUnsupportedBrowserSnippetMessage(codeRef.current);
      if (unsupportedMessage) {
        setEntries([createEntry("error", unsupportedMessage)]);
        setTab("console");
        setRunnerMode("idle");
        return;
      }
    }

    activeRunTokenRef.current = token;
    setIsRunning(true);
    setRunnerMode("browser");
    setEntries([createEntry("info", actionLabel === "Preview" ? "Previewing..." : "Running...")]);

    try {
      if (normalizedLanguage === "javascript" || normalizedLanguage === "typescript") {
        if (!canUseWebContainer()) {
          setEntries([
            createEntry(
              "error",
              "Interactive terminal runs need WebContainer support and cross-origin isolation. Browser preview can still run simple snippets, but stdin needs the Node runtime."
            ),
          ]);
          setIsRunning(false);
          setRunnerMode("idle");
          setTab("console");
          return;
        }

        setRunnerMode("node");
        setTab("console");
        setEntries([createEntry("info", "Booting Node terminal...")]);

        let runnableCode = codeRef.current;
        if (normalizedLanguage === "typescript") {
          const result = await transpileSnippet(codeRef.current, "typescript");
          const diagnostics = result.diagnostics || [];
          if (diagnostics.length > 0) {
            setEntries(diagnostics.map(diagnostic => createEntry(diagnostic.category === "error" ? "error" : "warn", diagnostic.message)));
            if (diagnostics.some(diagnostic => diagnostic.category === "error")) {
              setIsRunning(false);
              setRunnerMode("idle");
              return;
            }
          }
          runnableCode = result.code;
        }

        const webcontainer = await bootWebContainer();
        const isCommonJs = usesCommonJsRuntime(runnableCode);
        const fileName = isCommonJs ? "playground.cjs" : "playground.mjs";
        await webcontainer.fs.writeFile(`/${fileName}`, isCommonJs ? wrapCommonJsSnippet(runnableCode) : wrapEsmSnippet(runnableCode));
        const process = await webcontainer.spawn("node", [fileName], {
          terminal: {
            cols: 80,
            rows: 24,
          },
        });
        nodeProcessRef.current = process;
        nodeInputWriterRef.current = process.input.getWriter();
        setEntries([]);
        window.setTimeout(() => terminalInputRef.current?.focus(), 0);

        const reader = process.output.getReader();
        void (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const text = cleanTerminalChunk(value).trimEnd();
              if (text) setEntries(prev => [...prev, createEntry("log", text)]);
            }
          } catch (error) {
            if (activeRunTokenRef.current === token) {
              setEntries(prev => [...prev, createEntry("error", error instanceof Error ? error.message : "Unable to read terminal output.")]);
            }
          }
        })();

        const exitCode = await process.exit;
        if (activeRunTokenRef.current !== token) return;
        nodeInputWriterRef.current?.releaseLock();
        nodeInputWriterRef.current = null;
        nodeProcessRef.current = null;
        setIsRunning(false);
        setRunnerMode("idle");
        setEntries(prev => [...prev, createEntry(exitCode === 0 ? "info" : "error", `Process exited with code ${exitCode}.`)]);
        return;
      }

      if (normalizedLanguage === "html") {
        setPreviewSrcDoc(createHtmlPreview(codeRef.current, token));
        setTab("preview");
        window.setTimeout(() => {
          setIsRunning(false);
          setRunnerMode("idle");
        }, 250);
        return;
      }
      if (normalizedLanguage === "css") {
        setPreviewSrcDoc(createCssPreview(codeRef.current, token));
        setTab("preview");
        window.setTimeout(() => {
          setIsRunning(false);
          setRunnerMode("idle");
        }, 250);
        return;
      }

      let runnableCode = codeRef.current;
      if (normalizedLanguage === "jsx" || normalizedLanguage === "tsx") {
        const sourceCode = prepareReactSnippet(codeRef.current);
        const result = await transpileSnippet(sourceCode, normalizedLanguage);
        const diagnostics = result.diagnostics || [];
        if (diagnostics.length > 0) {
          setEntries(diagnostics.map(diagnostic => createEntry(diagnostic.category === "error" ? "error" : "warn", diagnostic.message)));
          if (diagnostics.some(diagnostic => diagnostic.category === "error")) {
            setIsRunning(false);
            setRunnerMode("idle");
            setTab("console");
            return;
          }
        }
        runnableCode = result.code;
      }

      setPreviewSrcDoc(createScriptPreview(runnableCode, token, normalizedLanguage === "jsx" || normalizedLanguage === "tsx"));
      setTab(normalizedLanguage === "jsx" || normalizedLanguage === "tsx" ? "preview" : "console");
      window.setTimeout(() => {
        if (activeRunTokenRef.current !== token) return;
        setIsRunning(false);
        setRunnerMode("idle");
        setEntries(prev => {
          const next = prev.filter(entry => entry.text !== "Running..." && entry.text !== "Previewing...");
          return next.length === 0 ? [createEntry("info", "Execution is still open in the preview. Check for long timers or an unfinished async task.")] : next;
        });
      }, 5000);
    } catch (error) {
      setEntries([createEntry("error", error instanceof Error ? error.message : "Unable to run this snippet.")]);
      setIsRunning(false);
      setRunnerMode("idle");
      setTab("console");
    }
  }, [actionLabel, isRunning, normalizedLanguage]);

  const sendTerminalInput = useCallback(async () => {
    if (!nodeInputWriterRef.current || runnerMode !== "node") return;
    const value = terminalInput;
    setTerminalInput("");
    setEntries(prev => [...prev, createEntry("stdin", value)]);
    try {
      await nodeInputWriterRef.current.write(`${value}\n`);
    } catch (error) {
      setEntries(prev => [...prev, createEntry("error", error instanceof Error ? error.message : "Unable to send input to the running process.")]);
    }
  }, [runnerMode, terminalInput]);

  const handleCopy = useCallback(async () => {
    try {
      await copyTextToClipboard(codeRef.current);
      setCopied(true);
      notify({ title: "Copied", description: "Playground code copied.", variant: "success" });
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      notify({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "error" });
    }
  }, [notify]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/15 md:hidden"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 260 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-[var(--privora-border)] bg-[var(--privora-surface)]/96 shadow-2xl backdrop-blur-xl md:w-[var(--privora-playground-width)]"
            style={{ "--privora-playground-width": `${width}px` } as CSSProperties}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              title="Resize Playground"
              onPointerDown={handleResizeStart}
              className="absolute inset-y-0 left-0 hidden w-2 -translate-x-1 cursor-col-resize touch-none md:block"
            >
              <div className="mx-auto h-full w-px bg-transparent transition-colors hover:bg-[var(--privora-accent)]" />
            </div>
            <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-[var(--privora-border)] bg-[var(--privora-surface)] px-3 py-2">
              <div className="flex items-center rounded-lg border border-[var(--privora-border)] bg-[var(--privora-bg)] p-0.5">
                <button
                  type="button"
                  onClick={() => setTab("code")}
                  className={cn("flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition", tab === "code" ? "bg-[var(--privora-surface)] text-[var(--privora-text)] shadow-sm" : "text-[var(--privora-muted)] hover:text-[var(--privora-text)]")}
                >
                  <Code2 className="h-3.5 w-3.5" /> Code
                </button>
                <button
                  type="button"
                  onClick={() => setTab("preview")}
                  className={cn("flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition", tab === "preview" ? "bg-[var(--privora-surface)] text-[var(--privora-text)] shadow-sm" : "text-[var(--privora-muted)] hover:text-[var(--privora-text)]")}
                >
                  <Eye className="h-3.5 w-3.5" /> Preview
                </button>
                <button
                  type="button"
                  onClick={() => setTab("console")}
                  className={cn("flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition", tab === "console" ? "bg-[var(--privora-surface)] text-[var(--privora-text)] shadow-sm" : "text-[var(--privora-muted)] hover:text-[var(--privora-text)]")}
                >
                  <Terminal className="h-3.5 w-3.5" /> Console
                </button>
              </div>
              <div className="min-w-0 flex-1 truncate px-1 text-center text-sm font-semibold text-[var(--privora-text)]">
                Code Playground
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={isRunning ? stopRun : runCode}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition hover:opacity-90",
                    isRunning
                      ? "bg-red-600 text-white"
                      : "bg-[var(--privora-text)] text-[var(--privora-bg)]"
                  )}
                  title={isRunning ? "Stop running code" : actionTitle}
                >
                  {isRunning ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {isRunning ? "Stop" : actionLabel}
                </button>
                <button type="button" onClick={handleCopy} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--privora-muted)] transition hover:bg-[var(--privora-text)]/10 hover:text-[var(--privora-text)]" title="Copy code">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
                <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--privora-muted)] transition hover:bg-[var(--privora-text)]/10 hover:text-[var(--privora-text)]" title="Close Playground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="relative min-h-0 flex-1">
              <div
                aria-hidden={tab !== "code"}
                className={cn("absolute inset-0 flex min-h-0 flex-col", tab === "code" ? "visible opacity-100" : "invisible pointer-events-none opacity-0")}
              >
                  <div className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-b border-[var(--privora-border)] bg-[var(--privora-bg)]/45 px-3">
                    <div ref={languageMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setIsLanguageMenuOpen(prev => !prev)}
                        className="flex h-7 min-w-36 items-center justify-between gap-2 rounded-md border border-[var(--privora-border)] bg-[var(--privora-surface)] px-2.5 text-xs font-semibold text-[var(--privora-text)] shadow-sm transition hover:bg-[var(--privora-bg)]"
                        aria-haspopup="listbox"
                        aria-expanded={isLanguageMenuOpen}
                      >
                        <span className="flex items-center gap-2">
                          {selectedLanguageHasDistinctBadge && (
                            <span className="rounded bg-[var(--privora-text)]/10 px-1.5 py-0.5 text-[10px] text-[var(--privora-muted)]">
                              {selectedLanguage.shortLabel}
                            </span>
                          )}
                          {selectedLanguage.label}
                        </span>
                        <ChevronDown className={cn("h-3.5 w-3.5 text-[var(--privora-muted)] transition", isLanguageMenuOpen && "rotate-180")} />
                      </button>
                      {isLanguageMenuOpen && (
                        <div className="absolute left-0 top-8 z-30 w-48 overflow-hidden rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] p-1 shadow-xl">
                          {languageOptions.filter(option => option.value !== normalizedLanguage).map(option => (
                            <button
                              key={option.value}
                              type="button"
                              role="option"
                              aria-selected={false}
                              onClick={() => {
                                setLanguage(option.value);
                                setCode("");
                                setEntries([]);
                                setPreviewSrcDoc(emptyPreviewSrcDoc);
                                setRunnerMode("idle");
                                setIsLanguageMenuOpen(false);
                              }}
                              className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs text-[var(--privora-muted)] transition hover:bg-[var(--privora-bg)] hover:text-[var(--privora-text)]"
                            >
                              <span className="font-semibold">{option.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => setCode("")} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-[var(--privora-muted)] transition hover:bg-[var(--privora-surface)] hover:text-[var(--privora-text)]">
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear
                    </button>
                  </div>
                  <div className="min-h-0 flex-1">
                    <CodeEditor
                      value={code}
                      language={normalizedLanguage}
                      isDarkMode={isDarkMode}
                      onChange={setCode}
                    />
                  </div>
              </div>
              <section
                aria-hidden={tab !== "preview"}
                className={cn("absolute inset-0 flex min-h-0 flex-1 flex-col bg-white", tab === "preview" ? "visible opacity-100" : "invisible pointer-events-none opacity-0")}
              >
                <iframe
                  ref={iframeRef}
                  title="Code playground preview"
                  sandbox="allow-scripts allow-forms"
                  srcDoc={previewSrcDoc}
                  className="h-full w-full border-0 bg-white"
                />
              </section>
              <section
                aria-hidden={tab !== "console"}
                className={cn("absolute inset-0 flex min-h-0 flex-1 flex-col bg-[var(--privora-bg)]/55", tab === "console" ? "visible opacity-100" : "invisible pointer-events-none opacity-0")}
              >
                  <div className="flex min-h-10 shrink-0 items-center justify-between border-b border-[var(--privora-border)]/60 px-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--privora-muted)]">Console output</span>
                    <button type="button" onClick={() => setEntries([])} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-[var(--privora-muted)] transition hover:bg-[var(--privora-surface)] hover:text-[var(--privora-text)]" title="Clear console">
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto bg-[var(--privora-surface)] p-3 font-mono text-[12px] leading-5 text-[var(--privora-text)]">
                    <div className="space-y-1">
                      {entries.length === 0 && (
                        <div className="text-[var(--privora-muted)]">Run code to see logs, errors, and returned values.</div>
                      )}
                      {entries.map(entry => (
                        <pre
                          key={entry.id}
                          className={cn(
                            "whitespace-pre-wrap",
                            entry.type === "error"
                              ? "rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-red-500"
                              : entry.type === "warn"
                                ? "text-amber-600 dark:text-amber-400"
                                : entry.type === "result"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : entry.type === "input"
                                    ? "text-[var(--privora-text)]"
                                    : entry.type === "stdin"
                                      ? "text-[var(--privora-muted)]"
                                      : "text-[var(--privora-text)]"
                          )}
                        >
                          {entry.type === "stdin" ? entry.text : entry.text}
                        </pre>
                      ))}
                      {(normalizedLanguage === "javascript" || normalizedLanguage === "typescript") && (
                        <div className="flex items-center gap-1 text-[var(--privora-text)]">
                          <input
                            ref={terminalInputRef}
                            value={terminalInput}
                            onChange={event => setTerminalInput(event.target.value)}
                            onKeyDown={event => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void sendTerminalInput();
                              }
                            }}
                            disabled={runnerMode !== "node"}
                            spellCheck={false}
                            aria-label="Terminal input"
                            placeholder={runnerMode === "node" ? "" : "run code to start terminal"}
                            className="min-w-0 flex-1 bg-transparent p-0 font-mono text-[12px] leading-5 outline-none placeholder:text-[var(--privora-muted)] disabled:cursor-not-allowed"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
});
