import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import { Check, ChevronDown, Clipboard, Code2, Download, ExternalLink, Eye, MoreVertical, X } from "lucide-react";
import mermaid from "mermaid";
import { AnimatePresence, motion } from "motion/react";
import { MarkdownRenderer } from "../../chat/components/MarkdownRenderer";
import type { ArtifactRecord } from "../../../lib/db";
import { normalizeArtifactRecord } from "../../../lib/artifacts";
import { cn } from "../../../lib/utils";
import { useToast } from "../../ui/ToastProvider";
import { SandboxedPreviewFrame } from "./SandboxedPreviewFrame";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));
const MONACO_LIGHT_THEME = "privora-artifact-light";
const MONACO_DARK_THEME = "privora-artifact-dark";
const ARTIFACT_EDITOR_LINE_HEIGHT = 18;

interface CanvasPanelProps {
  isOpen: boolean;
  artifact?: ArtifactRecord;
  isDarkMode: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  onCopy: () => void | Promise<void>;
  onDownload: () => void;
}

const languageForMonaco = (artifact?: ArtifactRecord) => {
  if (!artifact) return "markdown";
  if (artifact.kind === "markdown" || artifact.kind === "table" || artifact.kind === "prompt") return "markdown";
  if (artifact.kind === "yaml") return "yaml";
  if (artifact.kind === "mermaid") return "markdown";
  if (artifact.kind === "svg") return "xml";
  return artifact.language || artifact.kind;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const defineArtifactEditorThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(MONACO_LIGHT_THEME, {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#00000000",
      "editor.foreground": "#292524",
      "editorGutter.background": "#00000000",
      "editorLineNumber.foreground": "#8A817A",
      "editorLineNumber.activeForeground": "#292524",
      "editor.lineHighlightBackground": "#F3EEE5",
      "editor.lineHighlightBorder": "#00000000",
      "editorCursor.foreground": "#292524",
      "editor.selectionBackground": "#D8CBBB",
      "editor.inactiveSelectionBackground": "#EEE7DC",
    },
  });

  monaco.editor.defineTheme(MONACO_DARK_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#00000000",
      "editor.foreground": "#ECECEC",
      "editorGutter.background": "#00000000",
      "editorLineNumber.foreground": "#9B9B9B",
      "editorLineNumber.activeForeground": "#ECECEC",
      "editor.lineHighlightBackground": "#3A3A3A",
      "editor.lineHighlightBorder": "#00000000",
      "editorCursor.foreground": "#ECECEC",
      "editor.selectionBackground": "#5E554B",
      "editor.inactiveSelectionBackground": "#3F3F3F",
    },
  });
};

const normalizeMermaidSvg = (svg: string) => {
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch?.[1]?.split(/\s+/).map(Number) || [];
  const width = viewBox[2];
  const height = viewBox[3];
  const normalizedWidth = Number.isFinite(width) && width > 0 ? Math.ceil(width) : 1200;
  const normalizedHeight = Number.isFinite(height) && height > 0 ? Math.ceil(height) : 800;

  return svg
    .replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
      const nextAttrs = attrs
        .replace(/\swidth="[^"]*"/g, "")
        .replace(/\sheight="[^"]*"/g, "")
        .replace(/\sstyle="[^"]*"/g, "");
      return `<svg${nextAttrs} width="${normalizedWidth}" height="${normalizedHeight}" style="width:${normalizedWidth}px;height:${normalizedHeight}px;max-width:none;">`;
    })
    .replace(/max-width:\s*[^;"]+;?/gi, "max-width:none;")
    .replace(/width:\s*100%;?/gi, `width:${normalizedWidth}px;`);
};

const buildArtifactTabDocument = (artifact: ArtifactRecord, content: string) => {
  if (artifact.kind === "html") return content;
  if (artifact.kind === "svg") {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(artifact.title)}</title><style>html,body{margin:0;min-height:100%;background:#f4f0ea}body{display:grid;place-items:center;padding:32px;box-sizing:border-box}svg{max-width:100%;height:auto}</style></head><body>${content}</body></html>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(artifact.title)}</title><style>:root{color-scheme:light dark}body{margin:0;background:#f4f0ea;color:#292524;font:14px/1.65 Inter,ui-sans-serif,system-ui,sans-serif}main{max-width:1100px;margin:0 auto;padding:32px}h1{font-size:20px;margin:0 0 16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #e2dcd0;border-radius:12px;background:#fff;padding:20px}@media (prefers-color-scheme:dark){body{background:#212121;color:#ececec}pre{background:#2f2f2f;border-color:#424242}}</style></head><body><main><h1>${escapeHtml(artifact.title)}</h1><pre>${escapeHtml(content)}</pre></main></body></html>`;
};

const buildSandboxedTabDocument = (title: string, html: string, isDarkMode: boolean) => {
  const pageBg = isDarkMode ? "#212121" : "#f4f0ea";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>html,body{margin:0;height:100%;background:${pageBg}}body{overflow:hidden}iframe{display:block;width:100%;height:100%;border:0;background:transparent}</style></head><body><iframe title="${escapeHtml(title)}" sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="${escapeHtml(html)}"></iframe></body></html>`;
};

const buildSandboxedArtifactTabDocument = (artifact: ArtifactRecord, content: string, isDarkMode: boolean) => {
  return buildSandboxedTabDocument(artifact.title, buildArtifactTabDocument(artifact, content), isDarkMode);
};

const createMessageToken = () => {
  const bytes = new Uint32Array(2);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    bytes[0] = Math.floor(Math.random() * 0xffffffff);
    bytes[1] = Date.now();
  }
  return Array.from(bytes, value => value.toString(36)).join("-");
};

const buildPreviewSrcDoc = (artifact: ArtifactRecord, messageToken: string) => {
  const parentOrigin = typeof window === "undefined" ? "*" : window.location.origin;
  const resizeBridge = `<script>(function(){var id=${JSON.stringify(artifact.id)};var token=${JSON.stringify(messageToken)};var target=${JSON.stringify(parentOrigin)};var raf=0;var stopPolling=0;function post(height){try{parent.postMessage({type:"privora-artifact-resize",artifactId:id,token:token,height:height},target)}catch(_){try{parent.postMessage({type:"privora-artifact-resize",artifactId:id,token:token,height:height},"*")}catch(__){}}}function measure(){var body=document.body,doc=document.documentElement;if(!body||!doc)return;var height=Math.ceil(Math.max(body.scrollHeight,body.offsetHeight,doc.scrollHeight,doc.offsetHeight));post(height)}function queue(){cancelAnimationFrame(raf);raf=requestAnimationFrame(measure)}window.addEventListener("load",queue);window.addEventListener("resize",queue);window.addEventListener("click",function(event){var anchor=event.target&&event.target.closest?event.target.closest("a[href]"):null;if(anchor){anchor.setAttribute("target","_blank");anchor.setAttribute("rel","noopener noreferrer")}},true);if("ResizeObserver"in window){var ro=new ResizeObserver(queue);ro.observe(document.documentElement);if(document.body)ro.observe(document.body)}if("MutationObserver"in window&&document.documentElement){new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true})}Array.prototype.forEach.call(document.images||[],function(image){image.addEventListener("load",queue,{once:true});image.addEventListener("error",queue,{once:true})});if(document.fonts&&document.fonts.ready)document.fonts.ready.then(queue).catch(function(){});setTimeout(queue,50);setTimeout(queue,350);stopPolling=window.setInterval(queue,500);setTimeout(function(){clearInterval(stopPolling)},6000);})();</script>`;
  if (artifact.kind === "svg") {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(artifact.title)}</title><style>html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}body{display:grid;place-items:start center;box-sizing:border-box}svg{display:block;max-width:100%;max-height:100%;width:auto;height:auto}</style></head><body>${artifact.content}${resizeBridge}</body></html>`;
  }
  if (artifact.kind !== "html") return artifact.content;

  const errorBridge = `<script>(function(){var id=${JSON.stringify(artifact.id)};var token=${JSON.stringify(messageToken)};var target=${JSON.stringify(parentOrigin)};function post(message){message.token=token;try{parent.postMessage(message,target)}catch(_){try{parent.postMessage(message,"*")}catch(__){}}}function send(type,event){post({type:"privora-artifact-runtime-error",artifactId:id,message:event&&event.message?event.message:String(event&&event.reason||"Artifact runtime error"),line:event&&event.lineno,column:event&&event.colno})}window.addEventListener("error",function(event){send("error",event)});window.addEventListener("unhandledrejection",function(event){send("unhandledrejection",event)});})();</script>`;
  if (/<head[\s>]/i.test(artifact.content)) {
    return artifact.content.replace(/<head([^>]*)>/i, `<head$1>${errorBridge}${resizeBridge}`);
  }
  return `${errorBridge}${resizeBridge}${artifact.content}`;
};

const formatHtmlForEditor = (content: string) => {
  const normalized = content.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
  if (!normalized.trim() || (lines.length > 3 && longestLine < 160)) return normalized;

  return normalized
    .trim()
    .replace(/>\s*</g, ">\n<")
    .replace(/([{}])/g, "\n$1\n")
    .replace(/;\s*/g, ";\n")
    .replace(/(<\/?(?:!doctype|html|head|body|main|section|article|header|footer|nav|div|style|script|canvas|svg|title|meta|link|button|p|h[1-6]|ul|ol|li)\b[^>]*>)/gi, "\n$1\n")
    .replace(/\n{2,}/g, "\n")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .join("\n");
};

const prepareContentForEditor = (artifact?: ArtifactRecord) => {
  if (!artifact) return "";
  if (artifact.kind === "html") return formatHtmlForEditor(artifact.content);
  return artifact.content;
};

function MermaidPreview({ content, isDarkMode }: { content: string; isDarkMode: boolean }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    let cancelled = false;
    mermaid.initialize({ startOnLoad: false, theme: isDarkMode ? "dark" : "default" });
    mermaid.render(`privora-artifact-${Date.now()}`, content)
      .then(result => {
        if (!cancelled) setSvg(normalizeMermaidSvg(result.svg));
      })
      .catch(() => {
        if (!cancelled) setSvg("");
      });
    return () => {
      cancelled = true;
    };
  }, [content, isDarkMode]);

  if (!svg) {
    return <pre className="whitespace-pre-wrap rounded-xl border border-[var(--privora-border)] p-4 text-sm">{content}</pre>;
  }

  return <div className="privora-artifact-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function ArtifactPreview({ artifact, isDarkMode }: { artifact: ArtifactRecord; isDarkMode: boolean }) {
  const svgAspectRatio = useMemo(() => {
    if (artifact.kind !== "svg") return undefined;
    const viewBoxMatch = artifact.content.match(/\bviewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i);
    const widthMatch = artifact.content.match(/\bwidth\s*=\s*["']([\d.]+)(?:px)?["']/i);
    const heightMatch = artifact.content.match(/\bheight\s*=\s*["']([\d.]+)(?:px)?["']/i);
    const width = Number(viewBoxMatch?.[1] || widthMatch?.[1]);
    const height = Number(viewBoxMatch?.[2] || heightMatch?.[1]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
    return width / height;
  }, [artifact.content, artifact.kind]);

  if (artifact.kind === "html" || artifact.kind === "svg") {
    return (
      <SandboxedPreviewFrame
        id={artifact.id}
        title={artifact.title}
        content={artifact.content}
        mode={artifact.kind}
        updatedAt={artifact.updatedAt}
        theme={isDarkMode ? "dark" : "light"}
        className={artifact.kind === "html" ? "min-h-80" : "min-h-0"}
        style={artifact.kind === "svg"
          ? {
              aspectRatio: svgAspectRatio || 1.6,
              height: "auto",
              maxHeight: "calc(100vh - 7.5rem)",
            }
          : undefined}
      />
    );
  }

  if (artifact.kind === "mermaid") {
    return <MermaidPreview content={artifact.content} isDarkMode={isDarkMode} />;
  }

  if (["markdown", "table", "prompt", "text"].includes(artifact.kind)) {
    return (
      <article className="markdown-body privora-artifact-prose">
        <MarkdownRenderer tableMode="report" isStreaming={artifact.status === "streaming"}>{artifact.content}</MarkdownRenderer>
      </article>
    );
  }

  return (
    <pre className="min-h-[60vh] overflow-auto rounded-xl border border-[var(--privora-border)] bg-[var(--privora-bg)] p-4 font-mono text-sm leading-6">
      {artifact.content}
    </pre>
  );
}

function useStreamingPreviewArtifact(artifact?: ArtifactRecord) {
  const [previewArtifact, setPreviewArtifact] = useState<ArtifactRecord | undefined>(artifact);
  const lastPreviewAtRef = useRef(0);

  useEffect(() => {
    if (!artifact || artifact.status !== "streaming") {
      setPreviewArtifact(artifact);
      lastPreviewAtRef.current = Date.now();
      return;
    }

    const delay = Math.max(0, 450 - (Date.now() - lastPreviewAtRef.current));
    const timeout = window.setTimeout(() => {
      setPreviewArtifact(artifact);
      lastPreviewAtRef.current = Date.now();
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [artifact]);

  return previewArtifact;
}

function ArtifactLineNumbers({ lineCount, scrollTop }: { lineCount: number; scrollTop: number }) {
  return (
    <div
      aria-hidden="true"
      className="w-10 shrink-0 overflow-hidden bg-transparent pt-0 pr-2 text-right font-mono text-[13px] text-[var(--privora-muted)] select-none"
      style={{ lineHeight: `${ARTIFACT_EDITOR_LINE_HEIGHT}px` }}
    >
      <div style={{ transform: `translateY(-${scrollTop}px)` }}>
        {Array.from({ length: lineCount }, (_, index) => (
          <div key={index + 1} className="h-[18px] tabular-nums">
            {index + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CanvasPanel({ isOpen, artifact, isDarkMode, width, onWidthChange, onClose, onCopy, onDownload }: CanvasPanelProps) {
  const normalizedArtifact = useMemo(() => artifact ? normalizeArtifactRecord(artifact) : undefined, [artifact]);
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [editorScrollTop, setEditorScrollTop] = useState(0);
  const previousArtifactContentRef = useRef("");
  const tabTouchedRef = useRef(false);
  const downloadWarningRef = useRef<{ artifactId: string; expiresAt: number } | null>(null);

  useEffect(() => {
    const nextDraft = prepareContentForEditor(normalizedArtifact);
    setDraft(nextDraft);
    previousArtifactContentRef.current = nextDraft;
    tabTouchedRef.current = false;
    setTab(normalizedArtifact?.status === "streaming" ? "code" : "preview");
  }, [normalizedArtifact?.id]);

  useEffect(() => {
    if (normalizedArtifact?.status === "ready" && !tabTouchedRef.current) {
      setTab("preview");
    }
  }, [normalizedArtifact?.status]);

  useEffect(() => {
    if (!normalizedArtifact) return;
    setDraft(prev => {
      const nextDraft = prepareContentForEditor(normalizedArtifact);
      const shouldAcceptExternalUpdate =
        normalizedArtifact.status === "streaming" ||
        prev === previousArtifactContentRef.current;
      return shouldAcceptExternalUpdate ? nextDraft : prev;
    });
    previousArtifactContentRef.current = prepareContentForEditor(normalizedArtifact);
  }, [normalizedArtifact?.content, normalizedArtifact?.status]);

  const selectedContent = normalizedArtifact ? draft : "";
  const editorValue = selectedContent;
  const editorLanguage = languageForMonaco(normalizedArtifact);
  const editorLineCount = useMemo(() => Math.max(1, editorValue.split(/\r\n|\r|\n/).length), [editorValue]);

  const livePreviewArtifact = useMemo(() => (normalizedArtifact ? { ...normalizedArtifact, content: selectedContent } : undefined), [normalizedArtifact, selectedContent]);
  const previewArtifact = useStreamingPreviewArtifact(livePreviewArtifact);
  const { notify } = useToast();

  const handleEditorMount: OnMount = (editor) => {
    editor.updateOptions({ wordWrap: "off" });
    if (editor.getValue() !== editorValue) {
      editor.setValue(editorValue);
    }
    setEditorScrollTop(editor.getScrollTop());
    const scrollSubscription = editor.onDidScrollChange((event) => {
      if (typeof event.scrollTop === "number") {
        setEditorScrollTop(event.scrollTop);
      }
    });
    editor.onDidDispose(() => scrollSubscription.dispose());
    window.requestAnimationFrame(() => editor.layout());
  };

  const handleCopy = async () => {
    try {
      await onCopy();
      setCopied(true);
      setIsMoreOpen(false);
      notify({ title: "Copied", description: "Artifact copied.", variant: "success" });
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      notify({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "error" });
    }
  };

  const handleDownload = () => {
    if (!normalizedArtifact) return;
    const executableArtifact = normalizedArtifact.kind === "html" || normalizedArtifact.kind === "svg";
    const warningActive =
      downloadWarningRef.current?.artifactId === normalizedArtifact.id &&
      downloadWarningRef.current.expiresAt > Date.now();

    if (executableArtifact && !warningActive) {
      downloadWarningRef.current = { artifactId: normalizedArtifact.id, expiresAt: Date.now() + 8000 };
      notify({
        title: "Runnable artifact",
        description: "HTML/SVG files can run scripts when opened. Click Download again to save it.",
        variant: "info",
        durationMs: 8000,
      });
      return;
    }

    onDownload();
    downloadWarningRef.current = null;
    setIsMoreOpen(false);
    notify({ title: "Download started", description: "Artifact file is being downloaded.", variant: "success" });
  };

  const handleOpenInNewTab = async () => {
    if (!normalizedArtifact) return;
    setIsMoreOpen(false);
    const tabWindow = window.open("", "_blank");
    if (!tabWindow) {
      notify({ title: "Pop-up blocked", description: "Allow pop-ups to open this artifact in a new tab.", variant: "error" });
      return;
    }

    tabWindow.opener = null;
    tabWindow.document.open();
    tabWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(normalizedArtifact.title)}</title><style>body{margin:0;background:${isDarkMode ? "#212121" : "#f4f0ea"};color:${isDarkMode ? "#ececec" : "#292524"};font:14px Inter,ui-sans-serif,system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}</style></head><body>Opening...</body></html>`);
    tabWindow.document.close();

    let html = buildSandboxedArtifactTabDocument(normalizedArtifact, selectedContent, isDarkMode);
    if (normalizedArtifact.kind === "mermaid") {
      try {
        mermaid.initialize({ startOnLoad: false, theme: isDarkMode ? "dark" : "default" });
        const result = await mermaid.render(`privora-artifact-tab-${Date.now()}`, selectedContent);
        const pageBg = isDarkMode ? "#212121" : "#f4f0ea";
        const canvasBg = isDarkMode ? "#2f2f2f" : "#fff";
        const border = isDarkMode ? "#424242" : "#e2dcd0";
        const mermaidDocument = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(normalizedArtifact.title)}</title><style>html,body{margin:0;min-height:100%;background:${pageBg}}body{padding:32px;box-sizing:border-box;overflow:auto}.canvas{display:inline-block;border:1px solid ${border};border-radius:12px;background:${canvasBg};padding:24px}svg{display:block;max-width:none!important}</style></head><body><div class="canvas">${normalizeMermaidSvg(result.svg)}</div></body></html>`;
        html = buildSandboxedTabDocument(normalizedArtifact.title, mermaidDocument, isDarkMode);
      } catch {
        html = buildSandboxedArtifactTabDocument(normalizedArtifact, selectedContent, isDarkMode);
      }
    }

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    tabWindow.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    notify({ title: "Opened in new tab", variant: "success" });
  };

  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const maxWidth = Math.min(880, Math.round(window.innerWidth * 0.72));
      const minWidth = Math.min(420, Math.round(window.innerWidth * 0.52));
      const nextWidth = Math.max(minWidth, Math.min(maxWidth, window.innerWidth - moveEvent.clientX));
      onWidthChange(nextWidth);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  };

  return (
    <AnimatePresence>
      {isOpen && normalizedArtifact && previewArtifact && (
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
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-[var(--privora-border)] bg-[var(--privora-surface)]/96 shadow-2xl backdrop-blur-xl md:w-[var(--privora-canvas-panel-width)]"
            style={{ "--privora-canvas-panel-width": `${width}px` } as CSSProperties}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              title="Resize Canvas"
              onPointerDown={handleResizeStart}
              className="absolute inset-y-0 left-0 hidden w-2 -translate-x-1 cursor-col-resize touch-none md:block"
            >
              <div className="mx-auto h-full w-px bg-transparent transition-colors hover:bg-[var(--privora-accent)]" />
            </div>
            <header className="relative z-10 flex min-h-14 items-center gap-2 border-b border-[var(--privora-border)] bg-[var(--privora-surface)] px-3">
              <div className="flex shrink-0 items-center rounded-xl border border-[var(--privora-border)] bg-[var(--privora-bg)]/55 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    tabTouchedRef.current = true;
                    setTab("preview");
                  }}
                  className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-[var(--privora-muted)] transition", tab === "preview" ? "bg-[var(--privora-surface)] text-[var(--privora-text)] shadow-sm" : "hover:text-[var(--privora-text)]")}
                  aria-label="Preview artifact"
                  title="Preview"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    tabTouchedRef.current = true;
                    setTab("code");
                  }}
                  className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-[var(--privora-muted)] transition", tab === "code" ? "bg-[var(--privora-surface)] text-[var(--privora-text)] shadow-sm" : "hover:text-[var(--privora-text)]")}
                  aria-label="View code"
                  title="Code"
                >
                  <Code2 className="h-4 w-4" />
                </button>
              </div>

              <div className="min-w-0 flex-1 px-1">
                <h2 className="truncate text-sm font-medium text-[var(--privora-text)]">
                  {normalizedArtifact.title}
                  <span className="font-normal uppercase text-[var(--privora-muted)]"> · {normalizedArtifact.language || normalizedArtifact.kind}</span>
                </h2>
              </div>

              <div className="hidden items-center overflow-hidden rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] text-sm sm:flex">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="h-9 px-3 font-medium text-[var(--privora-text)] transition hover:bg-[var(--privora-bg)]"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsMoreOpen(value => !value)}
                  className="flex h-9 w-8 items-center justify-center border-l border-[var(--privora-border)] text-[var(--privora-muted)] transition hover:bg-[var(--privora-bg)] hover:text-[var(--privora-text)]"
                  aria-label="Artifact actions"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              <button type="button" onClick={handleCopy} className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--privora-muted)] transition hover:bg-[var(--privora-bg)] hover:text-[var(--privora-text)] sm:hidden" aria-label="Copy artifact">
                {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
              </button>
              <button type="button" onClick={() => setIsMoreOpen(value => !value)} className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--privora-muted)] transition hover:bg-[var(--privora-bg)] hover:text-[var(--privora-text)] sm:hidden" aria-label="More artifact actions">
                <MoreVertical className="h-4 w-4" />
              </button>
              <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--privora-muted)] transition hover:bg-[var(--privora-bg)] hover:text-[var(--privora-text)]" aria-label="Close Canvas">
                <X className="h-4 w-4" />
              </button>

              {isMoreOpen && (
                <div className="absolute right-12 top-12 z-10 w-44 overflow-hidden rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] py-1 text-sm text-[var(--privora-text)] shadow-xl">
                  <button type="button" onClick={handleDownload} className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-[var(--privora-bg)]">
                    <Download className="h-4 w-4 text-[var(--privora-muted)]" /> Download
                  </button>
                  <button type="button" onClick={handleOpenInNewTab} className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-[var(--privora-bg)]">
                    <ExternalLink className="h-4 w-4 text-[var(--privora-muted)]" /> Open tab
                  </button>
                </div>
              )}
            </header>

            <div className="relative z-10 flex gap-2 border-b border-[var(--privora-border)] bg-[var(--privora-surface)] px-4 py-2 sm:hidden">
              <button type="button" onClick={() => { tabTouchedRef.current = true; setTab("preview"); }} className={cn("h-9 flex-1 rounded-full text-sm", tab === "preview" ? "bg-[var(--privora-text)] text-[var(--privora-bg)]" : "bg-[var(--privora-user-bubble)] text-[var(--privora-muted)]")}>Preview</button>
              <button type="button" onClick={() => { tabTouchedRef.current = true; setTab("code"); }} className={cn("h-9 flex-1 rounded-full text-sm", tab === "code" ? "bg-[var(--privora-text)] text-[var(--privora-bg)]" : "bg-[var(--privora-user-bubble)] text-[var(--privora-muted)]")}>Code</button>
            </div>

            <div
              className={cn(
                "min-h-0 flex-1",
                tab === "code" || (tab === "preview" && previewArtifact.kind === "svg") ? "overflow-hidden" : "overflow-auto px-4 py-5 sm:px-6"
              )}
            >
              {tab === "preview" ? (
                <ArtifactPreview artifact={previewArtifact} isDarkMode={isDarkMode} />
              ) : (
                <div className="flex h-full min-h-0 overflow-hidden bg-transparent">
                  <ArtifactLineNumbers lineCount={editorLineCount} scrollTop={editorScrollTop} />
                  <div className="min-w-0 flex-1">
                    <Suspense fallback={<div className="p-4 text-sm text-[var(--privora-muted)]">Loading editor...</div>}>
                    <MonacoEditor
                      key={normalizedArtifact.id}
                      height="100%"
                      width="100%"
                      beforeMount={defineArtifactEditorThemes}
                      theme={isDarkMode ? MONACO_DARK_THEME : MONACO_LIGHT_THEME}
                      language={editorLanguage}
                      onChange={(value) => setDraft(value || "")}
                      options={{
                        minimap: { enabled: false },
                        wordWrap: "off",
                        fontSize: 13,
                        lineHeight: ARTIFACT_EDITOR_LINE_HEIGHT,
                        fontFamily: "Consolas, 'Courier New', monospace",
                        lineNumbers: "off",
                        lineNumbersMinChars: 0,
                        glyphMargin: false,
                        folding: false,
                        lineDecorationsWidth: 0,
                        fontLigatures: false,
                        renderLineHighlight: "none",
                        guides: { indentation: false, highlightActiveIndentation: false },
                        overviewRulerLanes: 0,
                        automaticLayout: true,
                        fixedOverflowWidgets: true,
                        padding: { top: 0, bottom: 0 },
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        renderValidationDecorations: "off",
                      }}
                      path={`privora://${normalizedArtifact.id}.${normalizedArtifact.language || normalizedArtifact.kind}`}
                      value={editorValue}
                      onMount={handleEditorMount}
                    />
                    </Suspense>
                  </div>
                </div>
              )}
            </div>

          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
