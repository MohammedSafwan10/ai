import { ChevronRight, Edit3, Folder, FolderOpen, MoreHorizontal, Pencil, Search, Star, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ActiveRunState, ThreadRecord, WorkspaceRecord } from "../../shared/types";
import { buildSidebarRows } from "../sidebarRows";

interface SidebarProps {
  threads: ThreadRecord[];
  workspaces: WorkspaceRecord[];
  activeThreadId: string | null;
  activeRunsByThread?: Record<string, ActiveRunState>;
  activeWorkspace: WorkspaceRecord | null;
  onSelectWorkspace: () => void;
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onToggleThreadStar: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onRemoveWorkspace: (workspaceId: string) => void;
  footer?: ReactNode;
}

export function Sidebar({
  threads,
  workspaces,
  activeThreadId,
  activeRunsByThread = {},
  activeWorkspace,
  onSelectWorkspace,
  onNewThread,
  onSelectThread,
  onRenameThread,
  onToggleThreadStar,
  onDeleteThread,
  onRemoveWorkspace,
  footer,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const projectListRef = useRef<HTMLDivElement | null>(null);
  const rows = useMemo(
    () => buildSidebarRows({ threads, workspaces, collapsedGroups, query }),
    [collapsedGroups, query, threads, workspaces],
  );
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => projectListRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (row?.type === "project") return 39;
      if (row?.type === "empty-project") return 30;
      return 40;
    },
    overscan: 8,
    getItemKey: (index) => rows[index]?.key || index,
  });
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
      <div className="sidebar-window-spacer" aria-hidden="true" />

      <div className="sidebar-top-actions">
        <button onClick={onNewThread} title="New chat">
          <Edit3 size={16} />
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

      <div className="project-list" ref={projectListRef}>
        <div className="sidebar-virtual-spacer" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const row = rows[virtualItem.index];
            if (!row) return null;
            return (
              <div
                key={row.key}
                className="sidebar-virtual-row"
                data-index={virtualItem.index}
                ref={rowVirtualizer.measureElement}
                style={{ transform: `translateY(${virtualItem.start}px)` }}
              >
                {row.type === "project" ? (
                  <ProjectRow
                    id={row.workspace.id}
                    title={row.workspace.name}
                    active={row.workspace.id === activeWorkspace?.id}
                    collapsed={collapsedGroups.has(row.workspace.id)}
                    onToggle={toggleGroup}
                    onRemove={onRemoveWorkspace}
                    icon={
                      row.workspace.id === activeWorkspace?.id ? <FolderOpen size={15} /> : <Folder size={15} />
                    }
                  />
                ) : row.type === "empty-project" ? (
                  <small className="empty-project">No chats</small>
                ) : (
                <ThreadButton
                  thread={row.thread}
                  active={row.thread.id === activeThreadId}
                  run={activeRunsByThread[row.thread.id]}
                  onClick={() => onSelectThread(row.thread.id)}
                  onRename={onRenameThread}
                  onToggleStar={onToggleThreadStar}
                  onDelete={onDeleteThread}
                />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {footer && <div className="sidebar-footer">{footer}</div>}
    </aside>
  );
}

function ProjectRow({
  id,
  title,
  active,
  collapsed,
  onToggle,
  onRemove,
  icon,
}: {
  id: string;
  title: string;
  active?: boolean;
  collapsed: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  icon?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
      setConfirmRemove(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  const remove = () => {
    onRemove(id);
    setMenuOpen(false);
    setConfirmRemove(false);
  };

  return (
    <section className={clsx("project-group", collapsed && "collapsed", menuOpen && "menu-open")} ref={menuRef}>
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
      <button
        type="button"
        className="project-menu-button"
        title="Project options"
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((open) => !open);
          setConfirmRemove(false);
        }}
      >
        <MoreHorizontal size={15} />
      </button>
      {menuOpen && (
        <div className="thread-menu project-menu">
          {confirmRemove ? (
            <>
              <button type="button" className="danger" onClick={remove}>
                <Trash2 size={15} />
                <span>Remove now</span>
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)}>
                <span>Cancel</span>
              </button>
            </>
          ) : (
            <button type="button" className="danger" onClick={() => setConfirmRemove(true)}>
              <Trash2 size={15} />
              <span>Remove project</span>
            </button>
          )}
        </div>
      )}
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
            <span className={clsx(run && isLiveRun(run) && "active-text-shimmer")}>{thread.title}</span>
          </span>
          <small className="thread-time">{formatRelativeThreadTime(thread.updatedAt || thread.createdAt)}</small>
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

function isLiveRun(run: ActiveRunState) {
  return [
    "sampling",
    "running",
    "executing_tool",
    "waiting_tool",
    "draining",
    "completing",
  ].includes(run.status);
}

function formatRelativeThreadTime(value: number) {
  const elapsedMs = Math.max(0, Date.now() - value);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;
  if (elapsedMs < minute) return "now";
  if (elapsedMs < hour) return `${Math.max(1, Math.floor(elapsedMs / minute))}m`;
  if (elapsedMs < day) return `${Math.floor(elapsedMs / hour)}h`;
  if (elapsedMs < week) return `${Math.floor(elapsedMs / day)}d`;
  if (elapsedMs < month) return `${Math.floor(elapsedMs / week)}w`;
  if (elapsedMs < year) return `${Math.floor(elapsedMs / month)}mo`;
  return `${Math.floor(elapsedMs / year)}y`;
}
