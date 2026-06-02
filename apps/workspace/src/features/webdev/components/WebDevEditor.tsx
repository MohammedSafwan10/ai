import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { getLanguageForWebDevPath } from "../lib/files";
import type { WebDevFile, WebDevFileDiff } from "../lib/types";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));
const MONACO_LIGHT_THEME = "privora-webdev-light";
const MONACO_DARK_THEME = "privora-webdev-dark";
const WEBDEV_EDITOR_LINE_HEIGHT = 18;

type MonacoTypeScriptDefaults = {
  javascriptDefaults?: {
    setCompilerOptions: (options: Record<string, unknown>) => void;
    setDiagnosticsOptions: (options: Record<string, unknown>) => void;
  };
  typescriptDefaults?: {
    setCompilerOptions: (options: Record<string, unknown>) => void;
    setDiagnosticsOptions: (options: Record<string, unknown>) => void;
  };
};

const configureTypeScriptDefaults = (monaco: typeof Monaco) => {
  const ts = (monaco.languages as unknown as { typescript?: MonacoTypeScriptDefaults }).typescript;
  if (!ts?.typescriptDefaults || !ts.javascriptDefaults) return;

  const compilerOptions = {
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    jsx: 4,
    module: 99,
    moduleResolution: 2,
    noEmit: true,
    skipLibCheck: true,
    target: 99,
  };

  ts.typescriptDefaults.setCompilerOptions(compilerOptions);
  ts.javascriptDefaults.setCompilerOptions(compilerOptions);
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: true,
  });
  ts.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: true,
  });
};

const defineThemes: BeforeMount = (monaco) => {
  configureTypeScriptDefaults(monaco);
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

const getFirstChangedModifiedLine = (before: string, after: string) => {
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  let start = 0;
  while (start < beforeLines.length && start < afterLines.length && beforeLines[start] === afterLines[start]) {
    start += 1;
  }
  if (start >= beforeLines.length && start >= afterLines.length) return 1;
  return Math.max(1, Math.min(afterLines.length || 1, start + 1));
};

function WebDevLineNumbers({ lineCount, scrollTop }: { lineCount: number; scrollTop: number }) {
  return (
    <div
      aria-hidden="true"
      className="w-12 shrink-0 overflow-hidden bg-transparent pt-0 pr-3 text-right font-mono text-[13px] text-[var(--privora-muted)] select-none"
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

function ManualWebDevDiffEditor({
  diff,
  language,
  isDarkMode,
  firstDiffLine,
}: {
  diff: WebDevFileDiff;
  language: string;
  isDarkMode: boolean;
  firstDiffLine: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const diffEditorRef = useRef<Monaco.editor.IStandaloneDiffEditor | null>(null);
  const originalModelRef = useRef<Monaco.editor.ITextModel | null>(null);
  const modifiedModelRef = useRef<Monaco.editor.ITextModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    let diffSubscription: Monaco.IDisposable | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const sessionKey = `${diff.path}:${diff.beforeContent.length}:${diff.afterContent.length}:${firstDiffLine}`;

    const revealFirstChange = (editor: Monaco.editor.IStandaloneDiffEditor) => {
      let lineChanges: Monaco.editor.ILineChange[] | null = null;
      try {
        lineChanges = editor.getLineChanges();
      } catch {
        return;
      }
      if (!lineChanges) return;
      const firstChange = lineChanges?.find(change => change.modifiedEndLineNumber > 0 || change.originalEndLineNumber > 0);
      const modifiedLine = Math.max(1, firstChange?.modifiedStartLineNumber || firstDiffLine);
      const originalLine = Math.max(1, firstChange?.originalStartLineNumber || modifiedLine);
      const originalEditor = editor.getOriginalEditor();
      const modifiedEditor = editor.getModifiedEditor();

      editor.layout();
      originalEditor.revealLineInCenter(originalLine);
      modifiedEditor.revealLineInCenter(modifiedLine);
      modifiedEditor.setPosition({ lineNumber: modifiedLine, column: 1 });
    };

    setIsLoading(true);
    void import("@monaco-editor/react").then(({ loader }) => loader.init()).then((monaco) => {
      if (disposed || !containerRef.current) return;

      defineThemes(monaco);
      monaco.editor.setTheme(isDarkMode ? MONACO_DARK_THEME : MONACO_LIGHT_THEME);

      const encodedPath = encodeURIComponent(diff.path);
      const originalModel = monaco.editor.createModel(
        diff.beforeContent,
        language,
        monaco.Uri.parse(`privora-webdev-diff://original/${encodedPath}?session=${sessionKey}`)
      );
      const modifiedModel = monaco.editor.createModel(
        diff.afterContent,
        language,
        monaco.Uri.parse(`privora-webdev-diff://modified/${encodedPath}?session=${sessionKey}`)
      );

      originalModelRef.current = originalModel;
      modifiedModelRef.current = modifiedModel;

      const diffEditor = monaco.editor.createDiffEditor(containerRef.current, {
        readOnly: true,
        renderSideBySide: true,
        renderSideBySideInlineBreakpoint: 0,
        useInlineViewWhenSpaceIsLimited: false,
        enableSplitViewResizing: true,
        renderIndicators: true,
        renderMarginRevertIcon: false,
        renderGutterMenu: false,
        ignoreTrimWhitespace: false,
        hideUnchangedRegions: { enabled: false },
        compactMode: false,
        minimap: { enabled: false },
        fontSize: 13,
        lineHeight: WEBDEV_EDITOR_LINE_HEIGHT,
        fontFamily: "Consolas, 'Courier New', monospace",
        fontLigatures: false,
        lineNumbers: "off",
        lineNumbersMinChars: 0,
        lineDecorationsWidth: 10,
        renderLineHighlight: "none",
        guides: { indentation: false, highlightActiveIndentation: false },
        automaticLayout: true,
        fixedOverflowWidgets: true,
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        wordWrap: "off",
        diffWordWrap: "off",
        renderOverviewRuler: false,
        renderValidationDecorations: "off",
        padding: { top: 8, bottom: 8 },
        scrollbar: { horizontalScrollbarSize: 10, verticalScrollbarSize: 10 },
      });

      diffEditorRef.current = diffEditor;
      diffEditor.setModel({ original: originalModel, modified: modifiedModel });

      diffSubscription = diffEditor.onDidUpdateDiff(() => revealFirstChange(diffEditor));
      resizeObserver = new ResizeObserver(() => diffEditor.layout());
      resizeObserver.observe(containerRef.current);

      window.requestAnimationFrame(() => {
        if (disposed) return;
        revealFirstChange(diffEditor);
        window.setTimeout(() => {
          if (!disposed) revealFirstChange(diffEditor);
        }, 120);
      });
      setIsLoading(false);
    }).catch(() => {
      if (!disposed) setIsLoading(false);
    });

    return () => {
      disposed = true;
      diffSubscription?.dispose();
      resizeObserver?.disconnect();

      const editor = diffEditorRef.current;
      diffEditorRef.current = null;
      if (editor) {
        editor.setModel(null);
        editor.dispose();
      }

      originalModelRef.current?.dispose();
      modifiedModelRef.current?.dispose();
      originalModelRef.current = null;
      modifiedModelRef.current = null;
    };
  }, [diff.path, diff.beforeContent, diff.afterContent, language, isDarkMode, firstDiffLine]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 z-10 bg-[var(--privora-surface)] p-4 text-sm text-[var(--privora-muted)]">
          Loading changes...
        </div>
      )}
      <div ref={containerRef} className="h-full min-h-0 w-full" />
    </div>
  );
}

export function WebDevEditor({
  file,
  diff,
  isDarkMode,
  readOnly,
  onChange,
}: {
  file?: WebDevFile;
  diff?: WebDevFileDiff | null;
  isDarkMode: boolean;
  readOnly: boolean;
  onChange: (content: string) => void;
}) {
  const language = useMemo(() => getLanguageForWebDevPath(diff?.path || file?.path || "file.tsx"), [diff?.path, file?.path]);
  const previewFile = useMemo<WebDevFile | undefined>(() => {
    if (diff?.status !== "previewing") return undefined;
    return {
      id: `${diff.path}:preview`,
      projectId: file?.projectId || "preview",
      path: diff.path,
      content: diff.afterContent,
      status: "streaming",
      createdAt: file?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
  }, [diff?.path, diff?.afterContent, diff?.status, file?.projectId, file?.createdAt]);
  const editorFile = previewFile || file;
  const [editorScrollTop, setEditorScrollTop] = useState(0);
  const lineCount = useMemo(() => Math.max(1, (editorFile?.content || "").split(/\r\n|\r|\n/).length), [editorFile?.content]);
  const firstDiffLine = useMemo(
    () => diff ? getFirstChangedModifiedLine(diff.beforeContent, diff.afterContent) : 1,
    [diff?.beforeContent, diff?.afterContent]
  );
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

  if (diff && diff.status !== "previewing") {
    return (
      <div className="privora-webdev-diff-editor h-full min-h-0 overflow-hidden bg-[var(--privora-surface)]">
        <ManualWebDevDiffEditor
          diff={diff}
          language={language}
          isDarkMode={isDarkMode}
          firstDiffLine={firstDiffLine}
        />
      </div>
    );
  }

  if (!editorFile) {
    return (
      <div className="grid h-full place-items-center bg-[var(--privora-surface)] text-sm text-[var(--privora-muted)]">
        Select a file to edit.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[var(--privora-surface)]">
      <WebDevLineNumbers lineCount={lineCount} scrollTop={editorScrollTop} />
      <div className="min-w-0 flex-1 pl-1">
        <Suspense fallback={<div className="p-4 text-sm text-[var(--privora-muted)]">Loading editor...</div>}>
          <MonacoEditor
            key={`${editorFile.path}:${previewFile ? "patch-preview" : "file"}`}
            path={`${previewFile ? "privora-webdev-preview" : "privora-webdev"}://${editorFile.path}`}
            height="100%"
            width="100%"
            beforeMount={defineThemes}
            onMount={handleEditorMount}
            theme={isDarkMode ? MONACO_DARK_THEME : MONACO_LIGHT_THEME}
            language={language}
            value={editorFile.content}
            onChange={(value) => {
              if (!previewFile) onChange(value || "");
            }}
            options={{
              readOnly: readOnly || Boolean(previewFile),
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
              scrollbar: { horizontalScrollbarSize: 10, verticalScrollbarSize: 10 },
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
