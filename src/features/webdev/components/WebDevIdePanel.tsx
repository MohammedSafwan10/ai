import { Code2, Download, Eye, PanelRightClose } from "lucide-react";
import { useMemo, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "../../../lib/utils";
import { useWebContainerRuntime } from "../runtime/webcontainer";
import { downloadWebDevProject } from "../lib/download";
import type { WebDevFile, WebDevIdeTab, WebDevProject } from "../lib/types";
import { WebDevEditor } from "./WebDevEditor";
import { WebDevFileTree } from "./WebDevFileTree";
import { WebDevPreview } from "./WebDevPreview";

export function WebDevIdePanel({
  project,
  files,
  activeFilePath,
  isDarkMode,
  isGenerating,
  width,
  onWidthChange,
  onClose,
  onSelectFile,
  onFileChange,
  onCreateFile,
  onCreateFolder,
  onRenamePath,
  onDeletePath,
}: {
  project?: WebDevProject;
  files: WebDevFile[];
  activeFilePath?: string;
  isDarkMode: boolean;
  isGenerating: boolean;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
  onSelectFile: (path: string) => void;
  onFileChange: (path: string, content: string) => void;
  onCreateFile: (basePath?: string) => void;
  onCreateFolder: (basePath?: string) => void;
  onRenamePath: (path: string) => void;
  onDeletePath: (path: string) => void;
}) {
  const [tab, setTab] = useState<WebDevIdeTab>("code");
  const activeFile = useMemo(() => files.find(file => file.path === activeFilePath) || files[0], [activeFilePath, files]);
  const { runtime, restart } = useWebContainerRuntime(project?.id || null, files);

  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
      const maxWidth = Math.min(980, Math.round(window.innerWidth * 0.76));
      const minWidth = Math.min(460, Math.round(window.innerWidth * 0.58));
      onWidthChange(Math.max(minWidth, Math.min(maxWidth, window.innerWidth - moveEvent.clientX)));
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  };

  return (
    <aside
      className="relative hidden h-full min-w-0 shrink-0 flex-col border-l border-[var(--privora-border)] bg-[var(--privora-surface)] shadow-2xl lg:flex"
      style={{ width } as CSSProperties}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        title="Resize Web Dev panel"
        onPointerDown={handleResizeStart}
        className="absolute inset-y-0 left-0 z-20 w-2 -translate-x-1 cursor-col-resize touch-none"
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
        </div>
        <div className="min-w-0 flex-1 truncate px-1 text-center text-sm font-semibold text-[var(--privora-text)]">
          {project?.title || "Web Dev"}
        </div>
        <button
          type="button"
          onClick={() => project && void downloadWebDevProject(project.title, files)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--privora-muted)] transition hover:bg-[var(--privora-bg)] hover:text-[var(--privora-text)]"
          title="Download project"
        >
          <Download className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--privora-muted)] transition hover:bg-[var(--privora-bg)] hover:text-[var(--privora-text)]"
          title="Close Web Dev panel"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1">
        {tab === "code" ? (
          <div className="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)]">
            <WebDevFileTree
              files={files}
              activePath={activeFile?.path}
              onSelectFile={onSelectFile}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onRenamePath={onRenamePath}
              onDeletePath={onDeletePath}
            />
            <div className="flex min-h-0 flex-col">
              <div className="flex min-h-10 shrink-0 items-center gap-2 border-b border-[var(--privora-border)] bg-[var(--privora-bg)]/45 px-3 text-xs font-semibold text-[var(--privora-text)]">
                <span className="truncate">{activeFile?.path || "No file selected"}</span>
                {isGenerating && <span className="ml-auto text-[var(--privora-muted)]">Read only while AI edits</span>}
              </div>
              <div className="min-h-0 flex-1">
                <WebDevEditor
                  file={activeFile}
                  isDarkMode={isDarkMode}
                  readOnly={isGenerating}
                  onChange={(content) => activeFile && onFileChange(activeFile.path, content)}
                />
              </div>
            </div>
          </div>
        ) : (
          <WebDevPreview runtime={runtime} onRestart={restart} />
        )}
      </div>
    </aside>
  );
}
