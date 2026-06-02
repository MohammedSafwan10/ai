import { ChevronDown, ChevronRight, FileCode2, FilePlus2, Folder, FolderPlus, MoreHorizontal, Pencil, Search, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { cn } from "../../../lib/utils";
import type { WebDevFile } from "../lib/types";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children: TreeNode[];
  status?: WebDevFile["status"];
}

const buildTree = (files: WebDevFile[]) => {
  const root: TreeNode = { name: "", path: "", type: "folder", children: [] };
  files.filter(file => file.status !== "deleted").forEach(file => {
    const parts = file.path.split("/");
    let cursor = root;
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      const isFile = index === parts.length - 1;
      let child = cursor.children.find(item => item.name === part && item.type === (isFile ? "file" : "folder"));
      if (!child) {
        child = { name: part, path, type: isFile ? "file" : "folder", children: [] };
        cursor.children.push(child);
      }
      if (isFile) child.status = file.status;
      cursor = child;
    });
  });
  const sort = (node: TreeNode) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    node.children.forEach(sort);
  };
  sort(root);
  return root.children;
};

function StatusDot({ status }: { status?: WebDevFile["status"] }) {
  if (!status || status === "ready") return null;
  const label = status === "streaming" ? "Streaming" : status === "created" ? "New" : status === "updated" ? "Edited" : status;
  return (
    <span className={cn(
      "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
      status === "streaming"
        ? "bg-[var(--privora-accent)] text-[var(--privora-accent-fg)]"
        : "bg-[var(--privora-user-bubble)] text-[var(--privora-muted)]"
    )}>
      {label}
    </span>
  );
}

function NodeRow({
  node,
  depth,
  activePath,
  openFolders,
  onToggleFolder,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onRenamePath,
  onDeletePath,
}: {
  node: TreeNode;
  depth: number;
  activePath?: string;
  openFolders: Set<string>;
  onToggleFolder: (path: string) => void;
  onSelectFile: (path: string) => void;
  onCreateFile: (basePath?: string) => void;
  onCreateFolder: (basePath?: string) => void;
  onRenamePath: (path: string) => void;
  onDeletePath: (path: string) => void;
}) {
  const isOpen = openFolders.has(node.path);
  const isActive = node.type === "file" && activePath === node.path;
  const paddingLeft = 8 + depth * 14;
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const menu = (
    <AnimatePresence>
      {isMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={(event) => {
              event.stopPropagation();
              setIsMenuOpen(false);
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-1 top-7 z-40 w-40 overflow-hidden rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] py-1 shadow-xl"
          >
            {node.type === "folder" && (
              <>
                <button type="button" onClick={(event) => { event.stopPropagation(); setIsMenuOpen(false); onCreateFile(node.path); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--privora-text)] hover:bg-[var(--privora-text)]/5">
                  <FilePlus2 className="h-3.5 w-3.5" /> New file
                </button>
                <button type="button" onClick={(event) => { event.stopPropagation(); setIsMenuOpen(false); onCreateFolder(node.path); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--privora-text)] hover:bg-[var(--privora-text)]/5">
                  <FolderPlus className="h-3.5 w-3.5" /> New folder
                </button>
              </>
            )}
            <button type="button" onClick={(event) => { event.stopPropagation(); setIsMenuOpen(false); onRenamePath(node.path); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--privora-text)] hover:bg-[var(--privora-text)]/5">
              <Pencil className="h-3.5 w-3.5" /> Rename
            </button>
            <button type="button" onClick={(event) => { event.stopPropagation(); setIsMenuOpen(false); onDeletePath(node.path); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-500 hover:bg-red-500/10">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  const optionsButton = (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        setIsMenuOpen(value => !value);
      }}
      className={cn(
        "ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--privora-muted)] opacity-0 transition hover:bg-[var(--privora-text)]/10 hover:text-[var(--privora-text)] group-hover:opacity-100",
        isMenuOpen && "bg-[var(--privora-text)]/10 opacity-100"
      )}
      title={`${node.name} options`}
    >
      <MoreHorizontal className="h-3.5 w-3.5" />
    </button>
  );

  if (node.type === "folder") {
    return (
      <>
        <div className="group relative flex h-8 w-full items-center rounded-md pr-1 text-[13px] font-medium text-[var(--privora-text)] transition hover:bg-[var(--privora-text)]/5" style={{ paddingLeft }}>
          <button type="button" onClick={() => onToggleFolder(node.path)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" title={node.path}>
          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-[var(--privora-muted)]" /> : <ChevronRight className="h-3.5 w-3.5 text-[var(--privora-muted)]" />}
          <Folder className="h-3.5 w-3.5 text-[var(--privora-muted)]" />
          <span className="truncate">{node.name}</span>
          </button>
          {optionsButton}
          {menu}
        </div>
        {isOpen && node.children.map(child => (
          <NodeRow
            key={`${child.type}-${child.path}`}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            openFolders={openFolders}
            onToggleFolder={onToggleFolder}
            onSelectFile={onSelectFile}
            onCreateFile={onCreateFile}
            onCreateFolder={onCreateFolder}
            onRenamePath={onRenamePath}
            onDeletePath={onDeletePath}
          />
        ))}
      </>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex h-8 w-full items-center gap-1.5 rounded-md pr-1 text-left text-[13px] transition",
        isActive
          ? "bg-[var(--privora-text)]/10 text-[var(--privora-text)]"
          : "text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]"
      )}
      style={{ paddingLeft }}
      title={node.path}
    >
      <button type="button" onClick={() => onSelectFile(node.path)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
      <FileCode2 className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{node.name}</span>
      <StatusDot status={node.status} />
      </button>
      {optionsButton}
      {menu}
    </div>
  );
}

export function WebDevFileTree({
  files,
  activePath,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onRenamePath,
  onDeletePath,
}: {
  files: WebDevFile[];
  activePath?: string;
  onSelectFile: (path: string) => void;
  onCreateFile: (basePath?: string) => void;
  onCreateFolder: (basePath?: string) => void;
  onRenamePath: (path: string) => void;
  onDeletePath: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [openFolders, setOpenFolders] = useState<Set<string>>(() => new Set(["src", "src/components", "src/lib", "src/data"]));
  const filteredFiles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return files;
    return files.filter(file => file.path.toLowerCase().includes(normalized));
  }, [files, query]);
  const tree = useMemo(() => buildTree(filteredFiles), [filteredFiles]);

  const toggleFolder = (path: string) => {
    setOpenFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-[var(--privora-border)] bg-[var(--privora-bg)]/45">
      <div className="border-b border-[var(--privora-border)] p-2">
        <div className="mb-2 flex items-center gap-1">
          <button type="button" onClick={() => onCreateFile()} className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--privora-muted)] transition hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]" title="New file">
            <FilePlus2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => onCreateFolder()} className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--privora-muted)] transition hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]" title="New folder">
            <FolderPlus className="h-4 w-4" />
          </button>
        </div>
        <label className="flex h-9 items-center gap-2 rounded-lg border border-[var(--privora-border)] bg-[var(--privora-surface)] px-2 text-[13px] text-[var(--privora-muted)]">
          <Search className="h-3.5 w-3.5" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search files"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-[var(--privora-muted)]"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {tree.length > 0 ? tree.map(node => (
          <NodeRow
            key={`${node.type}-${node.path}`}
            node={node}
            depth={0}
            activePath={activePath}
            openFolders={openFolders}
            onToggleFolder={toggleFolder}
            onSelectFile={onSelectFile}
            onCreateFile={onCreateFile}
            onCreateFolder={onCreateFolder}
            onRenamePath={onRenamePath}
            onDeletePath={onDeletePath}
          />
        )) : (
          <div className="px-2 py-4 text-sm text-[var(--privora-muted)]">No files yet.</div>
        )}
      </div>
    </div>
  );
}
