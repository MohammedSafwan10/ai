import { ChevronRight, Folder, FolderOpen, MessageSquarePlus, MoreHorizontal, PanelLeft, PanelLeftClose, Pencil, Search, Star, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ActiveRunState, ThreadRecord, WorkspaceRecord } from "../../shared/types";

interface SidebarProps {
  threads: ThreadRecord[];
  workspaces: WorkspaceRecord[];
  activeThreadId: string | null;
  activeRunsByThread?: Record<string, ActiveRunState>;
  activeWorkspace: WorkspaceRecord | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectWorkspace: () => void;
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onToggleThreadStar: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  footer?: ReactNode;
}

export function Sidebar({
  threads,
  workspaces,
  activeThreadId,
  activeRunsByThread = {},
  activeWorkspace,
  collapsed,
  onToggleCollapsed,
  onSelectWorkspace,
  onNewThread,
  onSelectThread,
  onRenameThread,
  onToggleThreadStar,
  onDeleteThread,
  footer,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const visibleThreads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return threads;
    return threads.filter((thread) => thread.title.toLowerCase().includes(needle));
  }, [query, threads]);
  const grouped = workspaces.map((workspace) => ({
    workspace,
    threads: visibleThreads.filter((thread) => thread.workspaceId === workspace.id),
  }));
  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-copy">
          <strong>Privora</strong>
        </div>
        <button className="sidebar-collapse" onClick={onToggleCollapsed} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <div className="sidebar-top-actions">
        <button onClick={onNewThread} title="New chat">
          <MessageSquarePlus size={16} />
          <span>New chat</span>
        </button>
        <label className="sidebar-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" />
        </label>
      </div>

      <div className="project-heading">
        <span>Projects</span>
        <button onClick={onSelectWorkspace} title="Use an existing folder">
          <FolderOpen size={15} />
        </button>
      </div>

      <div className="project-list">
        {grouped.map(({ workspace, threads: workspaceThreads }) => (
          <ProjectGroup
            key={workspace.id}
            id={workspace.id}
            title={workspace.name}
            active={workspace.id === activeWorkspace?.id}
            collapsed={collapsedGroups.has(workspace.id)}
            onToggle={toggleGroup}
            icon={
              workspace.id === activeWorkspace?.id ? <FolderOpen size={15} /> : <Folder size={15} />
            }
          >
            {workspaceThreads.length === 0 ? (
              <small className="empty-project">No chats</small>
            ) : (
              workspaceThreads.map((thread) => (
                <ThreadButton
                  key={thread.id}
                  thread={thread}
                  active={thread.id === activeThreadId}
                  run={activeRunsByThread[thread.id]}
                  onClick={() => onSelectThread(thread.id)}
                  onRename={onRenameThread}
                  onToggleStar={onToggleThreadStar}
                  onDelete={onDeleteThread}
                />
              ))
            )}
          </ProjectGroup>
        ))}

      </div>
      {footer && <div className="sidebar-footer">{footer}</div>}
    </aside>
  );
}

function ProjectGroup({
  id,
  title,
  active,
  collapsed,
  onToggle,
  icon,
  children,
}: {
  id: string;
  title: string;
  active?: boolean;
  collapsed: boolean;
  onToggle: (id: string) => void;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={clsx("project-group", collapsed && "collapsed")}>
      <button
        type="button"
        className={clsx("project-name", active && "active")}
        onClick={() => onToggle(id)}
        title={collapsed ? `Show ${title}` : `Hide ${title}`}
      >
        <ChevronRight className="project-chevron" size={13} />
        {icon && <span className="project-icon">{icon}</span>}
        <span>{title}</span>
      </button>
      {!collapsed && <div className="project-thread-list">{children}</div>}
    </section>
  );
}

function ThreadButton({
  thread,
  active,
  run,
  onClick,
  onRename,
  onToggleStar,
  onDelete,
}: {
  thread: ThreadRecord;
  active: boolean;
  run?: ActiveRunState;
  onClick: () => void;
  onRename: (threadId: string, title: string) => void;
  onToggleStar: (threadId: string) => void;
  onDelete: (threadId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(thread.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const rename = () => {
    setRenameValue(thread.title);
    setRenameOpen(true);
  };

  const saveRename = () => {
    const nextTitle = renameValue.trim();
    if (nextTitle && nextTitle !== thread.title) onRename(thread.id, nextTitle);
    setRenameOpen(false);
    setMenuOpen(false);
  };

  const remove = () => {
    onDelete(thread.id);
    setMenuOpen(false);
    setConfirmDelete(false);
  };

  return (
    <div className={clsx("thread-row-wrap", active && "active", menuOpen && "menu-open")} ref={menuRef}>
      {renameOpen ? (
        <form
          className="thread-rename-form"
          onSubmit={(event) => {
            event.preventDefault();
            saveRename();
          }}
        >
          <input
            autoFocus
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onBlur={saveRename}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setRenameOpen(false);
                setMenuOpen(false);
              }
            }}
          />
        </form>
      ) : (
        <button className="thread-row" onClick={onClick} title={thread.title}>
          <span className="thread-title-line">
            {thread.starred && <Star size={12} fill="currentColor" />}
            <span>{thread.title}</span>
          </span>
          <small>
            {run ? <ThreadRunBadge run={run} /> : formatAge(thread.updatedAt)}
          </small>
        </button>
      )}
      <button
        type="button"
        className="thread-menu-button"
        title="Chat options"
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((open) => !open);
        }}
      >
        <MoreHorizontal size={15} />
      </button>
      {menuOpen && (
        <div className="thread-menu">
          {confirmDelete ? (
            <>
              <button type="button" className="danger" onClick={remove}>
                <Trash2 size={15} />
                <span>Delete now</span>
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)}>
                <span>Cancel</span>
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => {
                onToggleStar(thread.id);
                setMenuOpen(false);
              }}>
                <Star size={15} fill={thread.starred ? "currentColor" : "none"} />
                <span>{thread.starred ? "Unstar" : "Star"}</span>
              </button>
              <button type="button" onClick={rename}>
                <Pencil size={15} />
                <span>Rename</span>
              </button>
              <button type="button" className="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={15} />
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ThreadRunBadge({ run }: { run: ActiveRunState }) {
  const label = run.status === "awaiting_approval"
    ? "needs approval"
    : run.status === "stalled"
      ? "stalled"
      : run.status === "stopped"
        ? "stopped"
        : run.status === "failed"
          ? "failed"
          : "running";
  return (
    <span className={clsx("thread-run-badge", run.status)}>
      <span aria-hidden="true" />
      {label}
    </span>
  );
}

function formatAge(timestamp: number) {
  const diff = Date.now() - timestamp;
  const day = 86_400_000;
  if (diff < day) return "today";
  if (diff < day * 7) return `${Math.max(1, Math.floor(diff / day))}d`;
  if (diff < day * 35) return `${Math.max(1, Math.floor(diff / (day * 7)))}w`;
  return new Date(timestamp).toLocaleDateString([], { month: "short", day: "numeric" });
}
