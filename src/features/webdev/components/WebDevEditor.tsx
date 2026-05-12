import { lazy, Suspense, useMemo, useState } from "react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import { getLanguageForWebDevPath } from "../lib/files";
import type { WebDevFile } from "../lib/types";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));
const MONACO_LIGHT_THEME = "privora-webdev-light";
const MONACO_DARK_THEME = "privora-webdev-dark";
const WEBDEV_EDITOR_LINE_HEIGHT = 18;

const defineThemes: BeforeMount = (monaco) => {
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

function WebDevLineNumbers({ lineCount, scrollTop }: { lineCount: number; scrollTop: number }) {
  return (
    <div
      aria-hidden="true"
      className="w-10 shrink-0 overflow-hidden bg-transparent pr-2 text-right font-mono text-[13px] text-[var(--privora-muted)] select-none"
      style={{ lineHeight: `${WEBDEV_EDITOR_LINE_HEIGHT}px` }}
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

export function WebDevEditor({
  file,
  isDarkMode,
  readOnly,
  onChange,
}: {
  file?: WebDevFile;
  isDarkMode: boolean;
  readOnly: boolean;
  onChange: (content: string) => void;
}) {
  const language = useMemo(() => file ? getLanguageForWebDevPath(file.path) : "typescript", [file]);
  const [editorScrollTop, setEditorScrollTop] = useState(0);
  const lineCount = useMemo(() => Math.max(1, (file?.content || "").split(/\r\n|\r|\n/).length), [file?.content]);

  const handleEditorMount: OnMount = (editor) => {
    setEditorScrollTop(editor.getScrollTop());
    const scrollSubscription = editor.onDidScrollChange((event) => {
      if (typeof event.scrollTop === "number") {
        setEditorScrollTop(event.scrollTop);
      }
    });
    editor.onDidDispose(() => scrollSubscription.dispose());
    window.requestAnimationFrame(() => editor.layout());
  };

  if (!file) {
    return (
      <div className="grid h-full place-items-center bg-[var(--privora-surface)] text-sm text-[var(--privora-muted)]">
        Select a file to edit.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[var(--privora-surface)]">
      <WebDevLineNumbers lineCount={lineCount} scrollTop={editorScrollTop} />
      <div className="min-w-0 flex-1">
        <Suspense fallback={<div className="p-4 text-sm text-[var(--privora-muted)]">Loading editor...</div>}>
          <MonacoEditor
            key={file.path}
            path={`privora-webdev://${file.path}`}
            height="100%"
            width="100%"
            beforeMount={defineThemes}
            onMount={handleEditorMount}
            theme={isDarkMode ? MONACO_DARK_THEME : MONACO_LIGHT_THEME}
            language={language}
            value={file.content}
            onChange={(value) => onChange(value || "")}
            options={{
              readOnly,
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: WEBDEV_EDITOR_LINE_HEIGHT,
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
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
