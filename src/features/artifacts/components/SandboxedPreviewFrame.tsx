import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cn } from "../../../lib/utils";

type PreviewMode = "html" | "svg";
type PreviewTheme = "light" | "dark";

interface SandboxedPreviewFrameProps {
  id: string;
  title: string;
  content: string;
  mode: PreviewMode;
  updatedAt?: number;
  theme?: PreviewTheme;
  className?: string;
  style?: CSSProperties;
  minHeight?: number;
  maxHeightRatio?: number;
  lockHeightToContent?: boolean;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

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

const previewBaseStyles = `
:root {
  color-scheme: light;
  --privora-bg: #f4f0ea;
  --privora-surface: #ffffff;
  --privora-card: #fbfaf7;
  --privora-border: #e2dcd0;
  --privora-text: #292524;
  --privora-muted: #78716c;
  --privora-accent: #171717;
  --privora-accent-fg: #ffffff;
  --background: 34 32% 94%;
  --foreground: 20 14% 15%;
  --card: 0 0% 100%;
  --card-foreground: 20 14% 15%;
  --popover: 0 0% 100%;
  --popover-foreground: 20 14% 15%;
  --primary: 0 0% 9%;
  --primary-foreground: 0 0% 100%;
  --secondary: 38 28% 88%;
  --secondary-foreground: 20 14% 15%;
  --muted: 38 20% 90%;
  --muted-foreground: 25 9% 46%;
  --accent: 38 28% 88%;
  --accent-foreground: 20 14% 15%;
  --destructive: 0 84% 60%;
  --destructive-foreground: 0 0% 100%;
  --border: 38 22% 85%;
  --input: 38 22% 85%;
  --ring: 20 14% 15%;
  --radius: 0.75rem;
}
html.dark {
  color-scheme: dark;
  --privora-bg: #212121;
  --privora-surface: #2f2f2f;
  --privora-card: #292929;
  --privora-border: #424242;
  --privora-text: #ececec;
  --privora-muted: #a1a1a1;
  --privora-accent: #ececec;
  --privora-accent-fg: #171717;
  --background: 0 0% 13%;
  --foreground: 0 0% 93%;
  --card: 0 0% 18%;
  --card-foreground: 0 0% 93%;
  --popover: 0 0% 18%;
  --popover-foreground: 0 0% 93%;
  --primary: 0 0% 93%;
  --primary-foreground: 0 0% 9%;
  --secondary: 0 0% 23%;
  --secondary-foreground: 0 0% 93%;
  --muted: 0 0% 23%;
  --muted-foreground: 0 0% 63%;
  --accent: 0 0% 23%;
  --accent-foreground: 0 0% 93%;
  --destructive: 0 63% 45%;
  --destructive-foreground: 0 0% 96%;
  --border: 0 0% 26%;
  --input: 0 0% 26%;
  --ring: 0 0% 93%;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: transparent; color: var(--privora-text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { overflow-x: hidden; }
a { color: inherit; }
button, input, textarea, select { font: inherit; }
img, svg, video, canvas { max-width: 100%; }
`;

const buildResizeBridge = (id: string, token: string) => {
  const parentOrigin = typeof window === "undefined" ? "*" : window.location.origin;
  return `<script>(function(){var id=${JSON.stringify(id)};var token=${JSON.stringify(token)};var target=${JSON.stringify(parentOrigin)};var raf=0;var poll=0;function post(message){message.artifactId=id;message.token=token;try{parent.postMessage(message,target)}catch(_){try{parent.postMessage(message,"*")}catch(__){}}}function measure(){var body=document.body,doc=document.documentElement;if(!body||!doc)return;var height=Math.ceil(Math.max(body.scrollHeight,body.offsetHeight,doc.scrollHeight,doc.offsetHeight));post({type:"privora-artifact-resize",height:height})}function queue(){cancelAnimationFrame(raf);raf=requestAnimationFrame(measure)}window.addEventListener("load",queue);window.addEventListener("resize",queue);window.addEventListener("click",function(event){var anchor=event.target&&event.target.closest?event.target.closest("a[href]"):null;if(anchor){anchor.setAttribute("target","_blank");anchor.setAttribute("rel","noopener noreferrer")}},true);window.addEventListener("error",function(event){post({type:"privora-artifact-runtime-error",message:event&&event.message?event.message:"Preview runtime error",line:event&&event.lineno,column:event&&event.colno})});window.addEventListener("unhandledrejection",function(event){post({type:"privora-artifact-runtime-error",message:String(event&&event.reason||"Preview runtime error")})});if("ResizeObserver"in window){var ro=new ResizeObserver(queue);ro.observe(document.documentElement);if(document.body)ro.observe(document.body)}if("MutationObserver"in window&&document.documentElement){new MutationObserver(queue).observe(document.documentElement,{childList:true,subtree:true,attributes:true,characterData:true})}Array.prototype.forEach.call(document.images||[],function(image){image.addEventListener("load",queue,{once:true});image.addEventListener("error",queue,{once:true})});if(document.fonts&&document.fonts.ready)document.fonts.ready.then(queue).catch(function(){});setTimeout(queue,50);setTimeout(queue,350);poll=window.setInterval(queue,500);setTimeout(function(){clearInterval(poll)},6000);})();</script>`;
};

const injectIntoHead = (content: string, headContent: string) => {
  if (/<head[\s>]/i.test(content)) {
    return content.replace(/<head([^>]*)>/i, `<head$1>${headContent}`);
  }
  return `${headContent}${content}`;
};

const applyHtmlThemeClass = (content: string, theme: PreviewTheme) => {
  if (!/<html[\s>]/i.test(content)) {
    return `<!doctype html><html class="${theme === "dark" ? "dark" : ""}"><head><meta charset="utf-8"></head><body>${content}</body></html>`;
  }

  return content.replace(/<html([^>]*)>/i, (_match, attrs: string) => {
    if (/\bclass\s*=/.test(attrs)) {
      return `<html${attrs.replace(/\bclass\s*=\s*["']([^"']*)["']/i, (_classMatch: string, className: string) => `class="${theme === "dark" ? `${className} dark`.trim() : className.replace(/\bdark\b/g, "").trim()}"`)}>`;
    }
    return `<html${attrs} class="${theme === "dark" ? "dark" : ""}">`;
  });
};

const buildPreviewSrcDoc = (id: string, title: string, content: string, mode: PreviewMode, theme: PreviewTheme, token: string) => {
  const bridge = buildResizeBridge(id, token);
  if (mode === "svg") {
    return `<!doctype html><html class="${theme === "dark" ? "dark" : ""}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${previewBaseStyles}html,body{width:100%;height:100%;overflow:hidden}body{display:grid;place-items:start center}svg{display:block;max-width:100%;max-height:100%;width:auto;height:auto}</style></head><body>${content}${bridge}</body></html>`;
  }

  const headContent = `<meta charset="utf-8"><title>${escapeHtml(title)}</title><style id="privora-preview-base">${previewBaseStyles}</style>`;
  return injectIntoHead(applyHtmlThemeClass(content, theme), `${headContent}${bridge}`);
};

export const hasLikelyUncompiledTailwind = (content: string) => {
  const hasStyles = /<style[\s>]/i.test(content) || /stylesheet/i.test(content);
  if (hasStyles) return false;
  const classMatches = content.match(/class\s*=\s*["'][^"']*(?:\b(?:flex|grid|rounded-|bg-|text-|p-|px-|py-|mt-|gap-|shadow-|border-|dark:|sm:|md:|lg:)[^"']*)["']/g);
  return (classMatches?.length || 0) >= 6;
};

export function SandboxedPreviewFrame({
  id,
  title,
  content,
  mode,
  updatedAt,
  theme = "light",
  className,
  style,
  minHeight = 320,
  maxHeightRatio = 0.78,
  lockHeightToContent = true,
}: SandboxedPreviewFrameProps) {
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [iframeHeight, setIframeHeight] = useState<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const messageToken = useMemo(() => createMessageToken(), [id, updatedAt]);
  const srcDoc = useMemo(() => buildPreviewSrcDoc(id, title, content, mode, theme, messageToken), [id, title, content, mode, theme, messageToken]);
  const hasTailwindWarning = useMemo(() => mode === "html" && hasLikelyUncompiledTailwind(content), [content, mode]);

  useEffect(() => {
    setRuntimeError(null);
    setIframeHeight(null);
  }, [id, updatedAt, content, theme]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (!data || data.artifactId !== id || data.token !== messageToken) return;
      if (data.type === "privora-artifact-runtime-error") {
        const location = data.line ? ` at line ${data.line}${data.column ? `:${data.column}` : ""}` : "";
        setRuntimeError(`${String(data.message || "Preview runtime error").slice(0, 500)}${location}`);
      }
      if (lockHeightToContent && mode === "html" && data.type === "privora-artifact-resize" && Number.isFinite(data.height)) {
        const viewportMax = Math.round(window.innerHeight * maxHeightRatio);
        setIframeHeight(Math.max(minHeight, Math.min(viewportMax, Math.round(Number(data.height)))));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [id, lockHeightToContent, maxHeightRatio, messageToken, minHeight, mode]);

  return (
    <div className="relative">
      {hasTailwindWarning && (
        <div className="absolute left-3 right-3 top-3 z-10 rounded-lg border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-sm dark:bg-amber-950/90 dark:text-amber-100">
          This preview contains utility classes without generated CSS. Ask Privora to convert it to self-contained CSS for exact rendering.
        </div>
      )}
      <iframe
        ref={iframeRef}
        key={`${id}-${updatedAt || 0}-${theme}`}
        title={title}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        className={cn("block w-full bg-transparent", className)}
        allowTransparency
        style={{
          height: mode === "html" ? iframeHeight ? `${iframeHeight}px` : style?.height || "calc(100vh - 8.5rem)" : style?.height,
          ...style,
        }}
      />
      {runtimeError && (
        <div className="absolute left-3 right-3 top-3 z-20 rounded-lg border border-red-500/25 bg-red-50 px-3 py-2 text-sm text-red-900 shadow-sm dark:bg-red-950/85 dark:text-red-100">
          Preview script error: {runtimeError}
        </div>
      )}
    </div>
  );
}

