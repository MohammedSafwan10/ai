import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Editor, { DiffEditor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Check, ChevronDown, ChevronRight, ChevronUp, Copy, ExternalLink, File, FileCode2, Folder, FolderOpen, GitCompareArrows, Globe2, PanelRightClose, Search, X } from "lucide-react";
import clsx from "clsx";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { WorkspaceDirectoryEntry, WorkspaceDirectoryListing, WorkspaceFileReadResult, WorkspaceRecord } from "../../shared/types";
import type { ReviewFileModel, ReviewSession } from "../reviewModels";
import { languageForPath } from "../reviewModels";
import { buildFilteredWorkspaceRows, buildWorkspaceTreeRows, type WorkspaceTreeVirtualRow } from "../workspaceTreeRows";
import { BrowserPanel } from "../features/browser/BrowserPanel";

loader.config({ monaco });

interface WorkspaceIdeShellProps {
  workspace: WorkspaceRecord | null;
  reviewSession: ReviewSession | null;
  hidden: boolean;
  requestedPanelMode?: WorkspacePanelMode | null;
  requestedPanelModeKey?: number;
  onReviewClosed: () => void;
  onToggleCollapsed: () => void;
}

interface OpenTab {
  path: string;
  name: string;
  result: WorkspaceFileReadResult | null;
  loading: boolean;
  error: string | null;
}

type ActiveIdeTab = { type: "file"; path: string | null } | { type: "review" };
type WorkspacePanelMode = "files" | "review" | "browser";

export function WorkspaceIdeShell({ workspace, reviewSession, hidden, requestedPanelMode, requestedPanelModeKey, onReviewClosed, onToggleCollapsed }: WorkspaceIdeShellProps) {
  const [listings, setListings] = useState<Record<string, WorkspaceDirectoryListing>>({});
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["."]));
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(() => new Set());
  const [treeError, setTreeError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveIdeTab>({ type: "file", path: null });
  const [panelMode, setPanelMode] = useState<WorkspacePanelMode>("files");
  const [selectedReviewPath, setSelectedReviewPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const filterRef = useRef<HTMLInputElement | null>(null);
  const treeScrollerRef = useRef<HTMLDivElement | null>(null);
  const activeFileTab = activeTab.type === "file" ? tabs.find((tab) => tab.path === activeTab.path) || null : null;
  const activeReviewFile = reviewSession?.files.find((file) => file.path === selectedReviewPath) || reviewSession?.files[0] || null;
  const reviewActive = activeTab.type === "review" && Boolean(reviewSession);

  useEffect(() => {
    setListings({});
    setExpanded(new Set(["."]));
    setLoadingFolders(new Set());
    setTreeError(null);
    setFilter("");
    setTabs([]);
    setActiveTab({ type: "file", path: null });
    setPanelMode("files");
    setSelectedReviewPath(null);
    if (workspace) void loadDirectory(".");
  }, [workspace?.id]);

  useEffect(() => {
    if (!reviewSession) {
      if (activeTab.type === "review") setActiveTab({ type: "file", path: tabs[0]?.path || null });
      return;
    }
    setSelectedReviewPath(reviewSession.selectedPath);
    setActiveTab({ type: "review" });
    setPanelMode("review");
  }, [reviewSession?.messageId]);

  useEffect(() => {
    if (!requestedPanelMode || !workspace) return;
    setPanelMode(requestedPanelMode);
  }, [requestedPanelMode, requestedPanelModeKey, workspace?.id]);

  const loadedEntries = useMemo(
    () => Object.values(listings).flatMap((listing) => listing.entries),
    [listings],
  );
  const filteredEntries = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return [];
    return loadedEntries.filter((entry) => entry.path.toLowerCase().includes(query) || entry.name.toLowerCase().includes(query));
  }, [filter, loadedEntries]);
  const treeRows = useMemo(
    () => filter.trim()
      ? buildFilteredWorkspaceRows(filteredEntries)
      : buildWorkspaceTreeRows({ listings, expanded, loadingFolders }),
    [expanded, filter, filteredEntries, listings, loadingFolders],
  );

  async function loadDirectory(path: string) {
    if (!workspace || loadingFolders.has(path)) return;
    setTreeError(null);
    setLoadingFolders((current) => new Set(current).add(path));
    try {
      const listing = await window.privoraDesktop.listWorkspaceDirectory({ path });
      setListings((current) => ({ ...current, [path]: listing }));
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingFolders((current) => {
        const next = new Set(current);
        next.delete(path);
        return next;
      });
    }
  }

  const toggleDirectory = (path: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    if (!listings[path]) void loadDirectory(path);
  };

  const openFile = async (entry: WorkspaceDirectoryEntry) => {
    if (entry.kind === "directory") {
      toggleDirectory(entry.path);
      return;
    }
    setActiveTab({ type: "file", path: entry.path });
    setTabs((current) => {
      if (current.some((tab) => tab.path === entry.path)) return current;
      return [...current, { path: entry.path, name: entry.name, result: null, loading: true, error: null }];
    });
    try {
      const result = await window.privoraDesktop.readWorkspaceFile({ path: entry.path });
      setTabs((current) => current.map((tab) => tab.path === entry.path ? { ...tab, result, loading: false, error: null } : tab));
    } catch (error) {
      setTabs((current) => current.map((tab) => tab.path === entry.path ? {
        ...tab,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      } : tab));
    }
  };

  const closeTab = (path: string) => {
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.path === path);
      const next = current.filter((tab) => tab.path !== path);
      if (activeTab.type === "file" && activeTab.path === path) setActiveTab({ type: "file", path: next[Math.max(0, index - 1)]?.path || next[0]?.path || null });
      return next;
    });
  };

  const copyActiveFile = async () => {
    const content = reviewActive ? activeReviewFile?.modified : activeFileTab?.result?.binary ? "" : activeFileTab?.result?.content;
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const activeExternalPath = reviewActive ? activeReviewFile?.path : activeFileTab?.path;
  const fileMode = panelMode === "files" || (panelMode === "review" && !reviewSession);
  const browserMode = panelMode === "browser";
  const reviewMode = panelMode === "review" && Boolean(reviewSession);

  return (
    <aside className="workspace-ide" aria-label="Workspace editor">
      <header className="workspace-ide-topbar">
        <div className="workspace-mode-tabs" role="tablist" aria-label="Workspace panel">
          <button type="button" className={clsx(fileMode && "active")} onClick={() => setPanelMode("files")}>
            <File size={15} />
            <span>Files</span>
          </button>
          <button type="button" className={clsx(reviewMode && "active")} disabled={!reviewSession} onClick={() => setPanelMode("review")}>
            <GitCompareArrows size={15} />
            <span>Review</span>
          </button>
          <button type="button" className={clsx(browserMode && "active")} onClick={() => setPanelMode("browser")}>
            <Globe2 size={15} />
            <span>Browser</span>
          </button>
        </div>
        {fileMode || reviewMode ? (
        <div className="workspace-ide-tabs" role="tablist" aria-label="Open files">
          {reviewSession && (
            <button
              type="button"
              className={clsx("workspace-tab", reviewActive && "active")}
              onClick={() => setActiveTab({ type: "review" })}
              title="Review changes"
            >
              <GitCompareArrows size={16} />
              <span>Review</span>
              <span
                role="button"
                tabIndex={0}
                className="workspace-tab-close"
                title="Close review"
                onClick={(event) => {
                  event.stopPropagation();
                  onReviewClosed();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onReviewClosed();
                }}
              >
                <X size={13} />
              </span>
            </button>
          )}
          {tabs.length === 0 && !reviewSession ? (
            <button type="button" className="workspace-open-file" onClick={() => filterRef.current?.focus()}>
              <File size={16} />
              <span>Open file</span>
            </button>
          ) : tabs.map((tab) => (
            <button
              type="button"
              key={tab.path}
              className={clsx("workspace-tab", activeTab.type === "file" && activeTab.path === tab.path && "active")}
              onClick={() => setActiveTab({ type: "file", path: tab.path })}
              title={tab.path}
            >
              <FileIcon name={tab.name} />
              <span>{tab.name}</span>
              <span
                role="button"
                tabIndex={0}
                className="workspace-tab-close"
                title="Close file"
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(tab.path);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") closeTab(tab.path);
                }}
              >
                <X size={13} />
              </span>
            </button>
          ))}
          <button type="button" className="workspace-icon-button" title="Open another file" onClick={() => filterRef.current?.focus()}>
            <span>+</span>
          </button>
        </div>
        ) : <div />}
        <div className="workspace-ide-actions">
          {reviewMode && (
            <>
              <button type="button" className="workspace-icon-button" title="Previous diff" onClick={() => diffEditorRef.current?.goToDiff("previous")}>
                <ChevronUp size={15} />
              </button>
              <button type="button" className="workspace-icon-button" title="Next diff" onClick={() => diffEditorRef.current?.goToDiff("next")}>
                <ChevronDown size={15} />
              </button>
            </>
          )}
          <button type="button" className="workspace-icon-button" title="Copy contents" disabled={browserMode || (reviewMode ? !activeReviewFile : !activeFileTab?.result || activeFileTab.result.binary)} onClick={copyActiveFile}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
          <button type="button" className="workspace-icon-button" title="Open externally" disabled={browserMode || !activeExternalPath} onClick={() => activeExternalPath && window.privoraDesktop.openPath(activeExternalPath)}>
            <ExternalLink size={15} />
          </button>
          <button type="button" className="workspace-icon-button" title="Hide workspace" onClick={onToggleCollapsed}>
            <PanelRightClose size={16} />
          </button>
        </div>
      </header>

      {browserMode ? (
        <BrowserPanel workspace={workspace} active={browserMode} hidden={hidden} />
      ) : (
      <div className="workspace-ide-main">
        <section className="workspace-editor-panel" aria-label="Read-only file viewer">
          <div className="workspace-breadcrumb">
            {reviewActive && reviewSession ? (
              <>
                <span>{reviewSession.title}</span>
                <strong className="delta-add">+{reviewSession.additions}</strong>
                <strong className="delta-del">-{reviewSession.deletions}</strong>
                {activeReviewFile && <><ChevronRight size={14} /><strong>{activeReviewFile.path}</strong></>}
              </>
            ) : workspace ? (
              <>
                <span>{workspace.name}</span>
                {activeFileTab && <><ChevronRight size={14} /><strong>{activeFileTab.path}</strong></>}
              </>
            ) : <span>No project selected</span>}
          </div>
          {reviewMode && reviewSession ? (
            <ReviewSurface
              file={activeReviewFile}
              onMount={(editor) => {
                diffEditorRef.current = editor;
              }}
            />
          ) : (
            <EditorSurface tab={activeFileTab} />
          )}
        </section>

        <section className="workspace-file-panel" aria-label="Workspace files">
          {reviewMode && reviewSession ? (
            <ReviewFileList session={reviewSession} selectedPath={activeReviewFile?.path || null} onSelect={setSelectedReviewPath} />
          ) : (
            <>
              <div className="workspace-filter">
                <Search size={16} />
                <input ref={filterRef} value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter files..." />
              </div>
              {treeError && <div className="workspace-tree-error">{treeError}</div>}
              <div className="workspace-tree" ref={treeScrollerRef}>
                {!workspace && <div className="workspace-empty-tree">Open a project to browse files.</div>}
                {workspace && (
                  <VirtualWorkspaceTree
                    rows={treeRows}
                    scrollerRef={treeScrollerRef}
                    expanded={expanded}
                    onToggleDirectory={toggleDirectory}
                    onOpen={openFile}
                  />
                )}
              </div>
            </>
          )}
        </section>
      </div>
      )}
    </aside>
  );
}

function ReviewSurface({
  file,
  onMount,
}: {
  file: ReviewFileModel | null;
  onMount: (editor: monaco.editor.IStandaloneDiffEditor) => void;
}) {
  if (!file) {
    return (
      <div className="workspace-editor-empty">
        <GitCompareArrows size={38} />
        <strong>No review changes</strong>
        <span>This turn has no retained file diffs.</span>
      </div>
    );
  }
  if (file.status === "renamed" && file.original === file.modified) {
    return (
      <div className="workspace-editor-empty">
        <GitCompareArrows size={38} />
        <strong>Renamed file</strong>
        <span>{file.oldPath} {"->"} {file.path}</span>
      </div>
    );
  }
  return (
    <div className="workspace-monaco-wrap">
      {file.partial && <div className="workspace-file-notice">{file.note}</div>}
      <DiffEditor
        key={`${file.oldPath || ""}->${file.path}`}
        height="100%"
        original={file.original}
        modified={file.modified}
        language={file.language}
        theme="vs-dark"
        onMount={onMount}
        options={{
          readOnly: true,
          domReadOnly: true,
          originalEditable: false,
          renderSideBySide: false,
          useInlineViewWhenSpaceIsLimited: true,
          compactMode: true,
          hideUnchangedRegions: {
            enabled: true,
            contextLineCount: 4,
            minimumLineCount: 10,
            revealLineCount: 8,
          },
          renderIndicators: true,
          renderGutterMenu: false,
          renderMarginRevertIcon: false,
          minimap: { enabled: false },
          stickyScroll: { enabled: false },
          fontSize: 13,
          fontLigatures: true,
          lineNumbersMinChars: 4,
          scrollBeyondLastLine: false,
          wordWrap: "off",
          padding: { top: 14, bottom: 18 },
          automaticLayout: true,
          contextmenu: true,
        }}
      />
    </div>
  );
}

function ReviewFileList({
  session,
  selectedPath,
  onSelect,
}: {
  session: ReviewSession;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: session.files.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 34,
    overscan: 12,
    getItemKey: (index) => {
      const file = session.files[index];
      return file ? `${file.oldPath || ""}->${file.path}` : index;
    },
  });
  return (
    <div className="review-file-browser">
      <div className="review-file-browser-head">
        <span>{session.files.length} {session.files.length === 1 ? "file" : "files"}</span>
        <span><b className="delta-add">+{session.additions}</b> <b className="delta-del">-{session.deletions}</b></span>
      </div>
      <div className="workspace-tree" ref={scrollerRef}>
        <div className="workspace-virtual-spacer" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const file = session.files[virtualItem.index];
            if (!file) return null;
            return (
              <div
                key={`${file.oldPath || ""}->${file.path}`}
                className="workspace-virtual-row"
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                <button
                  type="button"
                  className={clsx("workspace-tree-row review-file-row", selectedPath === file.path && "active")}
                  onClick={() => onSelect(file.path)}
                  title={file.oldPath && file.oldPath !== file.path ? `${file.oldPath} -> ${file.path}` : file.path}
                >
                  <FileIcon name={file.path} />
                  <span>{file.path}</span>
                  <b className="delta-add">+{file.additions}</b>
                  <b className="delta-del">-{file.deletions}</b>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EditorSurface({ tab }: { tab: OpenTab | null }) {
  if (!tab) {
    return (
      <div className="workspace-editor-empty">
        <FolderOpen size={38} />
        <strong>Open file</strong>
        <span>Select a file from the workspace tree</span>
      </div>
    );
  }
  if (tab.loading) return <div className="workspace-editor-empty"><span>Loading {tab.name}...</span></div>;
  if (tab.error) return <div className="workspace-editor-empty danger"><strong>Could not open file</strong><span>{tab.error}</span></div>;
  if (!tab.result) return null;
  if (tab.result.binary) {
    return (
      <div className="workspace-editor-empty">
        <File size={34} />
        <strong>Binary file</strong>
        <span>{formatBytes(tab.result.sizeBytes)} cannot be previewed in the read-only editor.</span>
      </div>
    );
  }
  return (
    <div className="workspace-monaco-wrap">
      {tab.result.truncated && (
        <div className="workspace-file-notice">
          Preview truncated at {formatBytes(tab.result.content.length)}. Open externally for the full file.
        </div>
      )}
      <Editor
        height="100%"
        value={tab.result.content}
        language={languageForPath(tab.path)}
        theme="vs-dark"
        options={{
          readOnly: true,
          domReadOnly: true,
          minimap: { enabled: false },
          stickyScroll: { enabled: false },
          fontSize: 13,
          fontLigatures: true,
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          wordWrap: "off",
          renderLineHighlight: "line",
          padding: { top: 14, bottom: 18 },
          automaticLayout: true,
          contextmenu: true,
        }}
      />
    </div>
  );
}

function VirtualWorkspaceTree({
  rows,
  scrollerRef,
  expanded,
  onToggleDirectory,
  onOpen,
}: {
  rows: WorkspaceTreeVirtualRow[];
  scrollerRef: RefObject<HTMLDivElement | null>;
  expanded: Set<string>;
  onToggleDirectory: (path: string) => void;
  onOpen: (entry: WorkspaceDirectoryEntry) => void;
}) {
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 34,
    overscan: 12,
    getItemKey: (index) => rows[index]?.key || index,
  });
  return (
    <div className="workspace-virtual-spacer" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
      {rowVirtualizer.getVirtualItems().map((virtualItem) => {
        const row = rows[virtualItem.index];
        if (!row) return null;
        return (
          <div
            key={row.key}
            className="workspace-virtual-row"
            style={{ transform: `translateY(${virtualItem.start}px)` }}
          >
            <WorkspaceTreeRow
              row={row}
              expanded={expanded}
              onToggleDirectory={onToggleDirectory}
              onOpen={onOpen}
            />
          </div>
        );
      })}
    </div>
  );
}

function WorkspaceTreeRow({
  row,
  expanded,
  onToggleDirectory,
  onOpen,
}: {
  row: WorkspaceTreeVirtualRow;
  expanded: Set<string>;
  onToggleDirectory: (path: string) => void;
  onOpen: (entry: WorkspaceDirectoryEntry) => void;
}) {
  if (row.type === "empty") return <div className="workspace-empty-tree">{row.message}</div>;
  if (row.type === "loading") {
    return <div className="workspace-tree-loading" style={{ paddingLeft: 34 + row.depth * 16 }}>Loading...</div>;
  }
  const entry = row.entry;
  if (row.type === "filtered-entry") {
    return (
      <button type="button" className="workspace-tree-row filtered" onClick={() => onOpen(entry)} title={entry.path}>
        {entry.kind === "directory" ? <Folder size={16} /> : <FileIcon name={entry.name} />}
        <span>{entry.path}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      className="workspace-tree-row"
      style={{ paddingLeft: 12 + row.depth * 16 }}
      onClick={() => entry.kind === "directory" ? onToggleDirectory(entry.path) : onOpen(entry)}
      title={entry.path}
    >
      {entry.kind === "directory" ? (
        expanded.has(entry.path) ? <ChevronDown size={16} /> : <ChevronRight size={16} />
      ) : <span className="workspace-tree-spacer" />}
      {entry.kind === "directory" ? expanded.has(entry.path) ? <FolderOpen size={16} /> : <Folder size={16} /> : <FileIcon name={entry.name} />}
      <span>{entry.name}</span>
    </button>
  );
}

function FileIcon({ name }: { name: string }) {
  return /\.(tsx?|jsx?|json|css|html|md|ya?ml|toml|cjs|mjs)$/i.test(name)
    ? <FileCode2 size={16} />
    : <File size={16} />;
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
