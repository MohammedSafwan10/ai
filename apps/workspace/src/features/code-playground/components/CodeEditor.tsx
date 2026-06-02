import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));
const PLAYGROUND_LIGHT_THEME = "privora-playground-light";
const PLAYGROUND_DARK_THEME = "privora-playground-dark";
const PLAYGROUND_EDITOR_LINE_HEIGHT = 18;

const getMonacoLanguage = (language: string) => {
  if (language === "jsx") return "javascript";
  if (language === "tsx") return "typescript";
  return language || "javascript";
};

const getFileExtension = (language: string) => {
  if (language === "javascript") return "js";
  if (language === "typescript") return "ts";
  return language || "js";
};

const isMonacoCancellation = (reason: unknown) => {
  if (!reason || typeof reason !== "object") return false;
  const value = reason as { name?: unknown; message?: unknown; stack?: unknown };
  const name = typeof value.name === "string" ? value.name : "";
  const message = typeof value.message === "string" ? value.message : "";
  const stack = typeof value.stack === "string" ? value.stack : "";
  return name === "Canceled" || (message === "Canceled" && stack.includes("editor.api"));
};

const definePlaygroundThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(PLAYGROUND_LIGHT_THEME, {
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
  monaco.editor.defineTheme(PLAYGROUND_DARK_THEME, {
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

function PlaygroundLineNumbers({ lineCount, scrollTop }: { lineCount: number; scrollTop: number }) {
  return (
    <div
      aria-hidden="true"
      className="w-12 shrink-0 overflow-hidden border-r border-[var(--privora-border)]/55 bg-[var(--privora-text)]/[0.025] pr-3 pt-3 text-right font-mono text-[13px] text-[var(--privora-muted)] select-none"
      style={{ lineHeight: `${PLAYGROUND_EDITOR_LINE_HEIGHT}px` }}
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

export function CodeEditor({
  value,
  language,
  isDarkMode,
  readOnly = false,
  onChange,
}: {
  value: string;
  language: string;
  isDarkMode: boolean;
  readOnly?: boolean;
  onChange: (value: string) => void;
}) {
  const [editorScrollTop, setEditorScrollTop] = useState(0);
  const lineCount = useMemo(() => Math.max(1, value.split(/\r\n|\r|\n/).length), [value]);

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isMonacoCancellation(event.reason)) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
  }, []);

  const handleMount: OnMount = (editor) => {
    setEditorScrollTop(editor.getScrollTop());
    const scrollSubscription = editor.onDidScrollChange((event) => {
      if (typeof event.scrollTop === "number") {
        setEditorScrollTop(event.scrollTop);
      }
    });
    editor.onDidDispose(() => scrollSubscription.dispose());
    window.requestAnimationFrame(() => editor.layout());
  };

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[var(--privora-surface)]">
      <PlaygroundLineNumbers lineCount={lineCount} scrollTop={editorScrollTop} />
      <div className="min-w-0 flex-1 pl-2 pt-3">
        <Suspense fallback={<div className="p-4 text-sm text-[var(--privora-muted)]">Loading editor...</div>}>
          <MonacoEditor
            path={`privora-playground://scratch.${getFileExtension(language)}`}
            height="100%"
            width="100%"
            beforeMount={definePlaygroundThemes}
            onMount={handleMount}
            theme={isDarkMode ? PLAYGROUND_DARK_THEME : PLAYGROUND_LIGHT_THEME}
            language={getMonacoLanguage(language)}
            value={value}
            onChange={(nextValue) => onChange(nextValue || "")}
            options={{
              readOnly,
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: PLAYGROUND_EDITOR_LINE_HEIGHT,
              fontFamily: "Consolas, 'Courier New', monospace",
              fontLigatures: false,
              lineNumbers: "off",
              lineNumbersMinChars: 0,
              lineDecorationsWidth: 0,
              glyphMargin: false,
              folding: false,
              renderLineHighlight: "none",
              guides: { indentation: false, highlightActiveIndentation: false },
              overviewRulerLanes: 0,
              automaticLayout: true,
              fixedOverflowWidgets: true,
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              wordWrap: "off",
              renderValidationDecorations: "on",
              padding: { top: 0, bottom: 0 },
              scrollbar: { horizontalScrollbarSize: 10, verticalScrollbarSize: 10 },
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
