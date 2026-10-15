import { Edit3, Folder, FolderOpen, MoreHorizontal, Pencil, Search, Shield, Star, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ActiveRunState, ThreadRecord, WorkspaceRecord } from "../../shared/types";
import { buildSidebarRows } from "../sidebarRows";
import { promptSubmissionError } from "../features/chat/promptSubmission";

interface SidebarProps {
  threads: ThreadRecord[];
  workspaces: WorkspaceRecord[];
  activeThreadId: string | null;
  activeRunsByThread?: Record<string, ActiveRunState>;
  activeWorkspace: WorkspaceRecord | null;
  onSelectWorkspace: () => void;
  onCreateSecurityWorkspace?: () => void;
  onEditSecurityWorkspace?: (workspaceId: string, renameOnly: boolean) => void;
  onNewThread: () => void;
  onSelectThread: (threadId: string) => void;
  onRenameThread: (threadId: string, title: string) => void;
  onToggleThreadStar: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void | Promise<void>;
  onRemoveWorkspace: (workspaceId: string) => void;
  onMoveChat: (threadId: string, workspaceId: string, discardStoppedRun?: boolean) => Promise<void>;
  onReorderWorkspace: (id: string, targetId: string, position: "before" | "after") => Promise<void>;
  footer?: ReactNode;
}

export function Sidebar({
  threads,
  workspaces,
  activeThreadId,
  activeRunsByThread = {},
  activeWorkspace,
  onSelectWorkspace,
  onCreateSecurityWorkspace,
  onEditSecurityWorkspace,
  onNewThread,
  onSelectThread,
  onRenameThread,
  onToggleThreadStar,
  onDeleteThread,
  onRemoveWorkspace,
  onMoveChat,
  onReorderWorkspace,
  footer,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "security" | "normal">(() => { try { const saved = localStorage.getItem("privora.sidebar.filter"); return saved === "security" || saved === "normal" ? saved : "all"; } catch { return "all"; } });
  const [organizationError, setOrganizationError] = useState<string | null>(null);
  const [moveCandidate, setMoveCandidate] = useState<{ threadId: string; workspaceId?: string } | null>(null);
  const drag = useRef<{ type: "project" | "chat"; id: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dropMark, setDropMark] = useState<{ key: string; position: "before" | "after" | "inside" } | null>(null);
  useEffect(() => {
    if (!dragging) return;
    const clear = () => { drag.current = null; setDragging(false); setDropMark(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") clear(); };
    window.addEventListener("dragend", clear); window.addEventListener("drop", clear); window.addEventListener("blur", clear); window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("dragend", clear); window.removeEventListener("drop", clear); window.removeEventListener("blur", clear); window.removeEventListener("keydown", escape); };
  }, [dragging]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const projectListRef = useRef<HTMLDivElement | null>(null);
  const rows = useMemo(
    () => buildSidebarRows({ threads, workspaces, collapsedGroups, query, filter }),
    [collapsedGroups, query, threads, workspaces, filter],
  );
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => projectListRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (row?.type === "project") return 32;
      if (row?.type === "empty-project") return 26;
      return 32;
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

  const organize = async (operation: () => Promise<void>) => { setOrganizationError(null); try { await operation(); } catch (error) { setOrganizationError(error instanceof Error ? error.message : String(error)); } };
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
        {onCreateSecurityWorkspace && <button type="button" onClick={onCreateSecurityWorkspace} title="New security project" aria-label="New security project"><Shield size={15} /></button>}
        <button onClick={onSelectWorkspace} title="Use an existing folder">
          <FolderOpen size={15} />
        </button>
      </div>

      <div className="sidebar-type-filter" role="group" aria-label="Filter projects">{(["all", "security", "normal"] as const).map((type) => <button type="button" key={type} aria-pressed={filter === type} onClick={() => { setFilter(type); try { localStorage.setItem("privora.sidebar.filter", type); } catch { /* Keep the session preference when storage is unavailable. */ } }}>{type === "all" ? "All" : type === "security" ? "Security" : "Normal"}</button>)}</div>
      {organizationError && <div className="sidebar-organization-error" role="alert">{organizationError}<button type="button" onClick={() => setOrganizationError(null)} aria-label="Dismiss organization error">×</button></div>}
      <div className={clsx("project-list", dragging && "sidebar-dragging")} ref={projectListRef}>
        <div className="sidebar-virtual-spacer" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const row = rows[virtualItem.index];
            if (!row) return null;
            return (
              <div
                key={row.key}
                className={clsx("sidebar-virtual-row", dropMark?.key === row.key && `sidebar-drop-${dropMark.position}`)}
                draggable={row.type === "project" || (row.type === "thread" && workspaces.find((workspace) => workspace.id === row.workspaceId)?.type !== "security" && !activeRunsByThread[row.thread.id])}
                onDragStart={(event) => {
                  if ((event.target as HTMLElement).closest("input, .thread-menu-button, .project-menu-button") || row.type === "empty-project") { event.preventDefault(); return; }
                  drag.current = { type: row.type === "project" ? "project" : "chat", id: row.type === "project" ? row.workspace.id : row.thread.id };
                  event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-privora-sidebar", JSON.stringify(drag.current)); setDragging(true); setOrganizationError(null);
                }}
                onDragEnd={() => { drag.current = null; setDragging(false); setDropMark(null); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropMark(null); }}
                onDragOver={(event) => {
                  const item = drag.current; if (!item) return;
                  const scroller = projectListRef.current;
                  if (scroller) { const area = scroller.getBoundingClientRect(); if (event.clientY < area.top + 28) scroller.scrollTop -= 12; else if (event.clientY > area.bottom - 28) scroller.scrollTop += 12; }
                  if (item.type === "project") {
                    if (row.type !== "project" || row.workspace.id === item.id) return;
                    event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect();
                    setDropMark({ key: row.key, position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" });
                  } else {
                    const targetId = row.type === "project" ? row.workspace.id : row.workspaceId;
                    if (workspaces.find((workspace) => workspace.id === targetId)?.type === "security" || threads.find((thread) => thread.id === item.id)?.workspaceId === targetId) return;
                    event.preventDefault(); setDropMark({ key: row.key, position: "inside" });
                  }
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault(); const item = drag.current; const mark = dropMark;
                  drag.current = null; setDragging(false); setDropMark(null);
                  if (!item || mark?.key !== row.key) return;
                  if (item.type === "project" && row.type === "project" && mark.position !== "inside") void organize(() => onReorderWorkspace(item.id, row.workspace.id, mark.position as "before" | "after"));
                  else if (item.type === "chat") setMoveCandidate({ threadId: item.id, workspaceId: row.type === "project" ? row.workspace.id : row.workspaceId });
                }}
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
                    security={row.workspace.type === "security"}
                    onToggle={toggleGroup}
                    onRemove={onRemoveWorkspace}
                    onEdit={onEditSecurityWorkspace}
                    onReorder={(direction) => { const visible = workspaces.filter((workspace) => filter === "all" || (filter === "security" ? workspace.type === "security" : workspace.type !== "security")); const index = visible.findIndex((workspace) => workspace.id === row.workspace.id); const target = visible[index + (direction === "before" ? -1 : 1)]; if (target) void organize(() => onReorderWorkspace(row.workspace.id, target.id, direction)); }}
                    icon={
                      row.workspace.type === "security" ? <Shield size={15} className={collapsedGroups.has(row.workspace.id) ? "security-project-icon" : "security-project-icon expanded"} /> : collapsedGroups.has(row.workspace.id) ? <Folder size={15} /> : <FolderOpen size={15} />
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
                  onMove={workspaces.find((workspace) => workspace.id === row.workspaceId)?.type === "security" ? undefined : () => setMoveCandidate({ threadId: row.thread.id })}
                />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {footer && <div className="sidebar-footer">{footer}</div>}
      {moveCandidate && createPortal(<MoveChatDialog thread={threads.find((thread) => thread.id === moveCandidate.threadId)} workspaces={workspaces} initialWorkspaceId={moveCandidate.workspaceId} onClose={() => setMoveCandidate(null)} onMove={async (threadId, workspaceId, discardStoppedRun) => { await onMoveChat(threadId, workspaceId, discardStoppedRun); setCollapsedGroups((current) => { const next = new Set(current); next.delete(workspaceId); return next; }); }} />, document.body)}
    </aside>
  );
}

function MoveChatDialog({ thread, workspaces, initialWorkspaceId, onClose, onMove }: { thread?: ThreadRecord; workspaces: WorkspaceRecord[]; initialWorkspaceId?: string; onClose: () => void; onMove: (threadId: string, workspaceId: string, discardStoppedRun?: boolean) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(initialWorkspaceId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discardStoppedRun, setDiscardStoppedRun] = useState(false);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const destinations = workspaces.filter((workspace) => workspace.type !== "security" && workspace.id !== thread?.workspaceId);
  return <dialog ref={dialog} className="sidebar-move-dialog" aria-labelledby="move-chat-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id="move-chat-title">Move chat</h2><p className="sidebar-move-title">{thread?.title ?? "Chat no longer available"}</p>
    <p>History and completed subagents move with the chat. Files stay in their original folders. Previous approvals won’t carry over, and rewinding messages from the previous project will be disabled.</p>
    <fieldset disabled={busy}><legend>Destination project</legend><div className="sidebar-move-projects">{destinations.map((workspace) => <label key={workspace.id}><input type="radio" name="move-chat-project" value={workspace.id} checked={selected === workspace.id} onChange={() => setSelected(workspace.id)} /><span>{workspace.name}<small>{workspace.path}</small></span></label>)}{!destinations.length && <p>Add another normal project folder first.</p>}</div></fieldset>
    <p>Security chats remain in their original project to keep scope, jobs and evidence together.</p>
    {error && <p className="sidebar-organization-error" role="alert">{error}</p>}
    {(discardStoppedRun || error?.includes("resumable runs")) && <label className="sidebar-discard-run"><input type="checkbox" checked={discardStoppedRun} disabled={busy} onChange={(event) => setDiscardStoppedRun(event.target.checked)} /><span>Discard saved stopped-run progress and move. Chat history and files stay saved, but this run cannot be resumed. Pending approvals and unconfirmed tools still block the move.</span></label>}
    <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" disabled={busy || !thread || !destinations.some((workspace) => workspace.id === selected)} onClick={() => { if (!thread) return; setBusy(true); setError(null); void onMove(thread.id, selected, discardStoppedRun).then(onClose).catch((failure) => setError(promptSubmissionError(failure))).finally(() => setBusy(false)); }}>{busy ? "Moving…" : discardStoppedRun ? "Discard stopped run & move" : "Move chat"}</button></footer>
  </dialog>;
}

function ProjectRow({
  id,
  title,
  active,
  collapsed,
  onToggle,
  onRemove,
  onEdit,
  onReorder,
  icon,
  security = false,
}: {
  id: string;
  title: string;
  active?: boolean;
  collapsed: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit?: (id: string, renameOnly: boolean) => void;
  onReorder: (direction: "before" | "after") => void;
  icon?: ReactNode;
  security?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuStyle = useFloatingMenuStyle(menuOpen, buttonRef);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
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
    <section className={clsx("project-group", collapsed && "collapsed", menuOpen && "menu-open")} ref={rootRef}>
      <button
        type="button"
        className={clsx("project-name", active && "active")}
        onClick={() => onToggle(id)}
        title={collapsed ? `Show ${title}` : `Hide ${title}`}
        aria-expanded={!collapsed}
      >
        {icon && <span className="project-icon">{icon}</span>}
        <span>{title}</span>
      </button>
      <button
        ref={buttonRef}
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
      {menuOpen && createPortal(
        <div className="thread-menu project-menu floating-thread-menu" ref={menuRef} style={menuStyle}>
          {confirmRemove ? (
            <>
              {security && <p className="project-remove-note">Chats will be deleted. Local project files go to Recycle Bin; Kali files remain.</p>}
              <button type="button" className="danger" onClick={remove}>
                <Trash2 size={15} />
                <span>Remove now</span>
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)}>
                <span>Cancel</span>
              </button>
            </>
          ) : (
            <>
            <button type="button" onClick={() => { setMenuOpen(false); onReorder("before"); }}>Move project up</button><button type="button" onClick={() => { setMenuOpen(false); onReorder("after"); }}>Move project down</button>
            {security && onEdit && <><button type="button" onClick={() => { setMenuOpen(false); onEdit(id, true); }}><Pencil size={15} /><span>Rename project</span></button><button type="button" onClick={() => { setMenuOpen(false); onEdit(id, false); }}><Edit3 size={15} /><span>Edit objective & scope</span></button></>}
            <button type="button" className="danger" onClick={() => setConfirmRemove(true)}>
              <Trash2 size={15} />
              <span>Remove project</span>
            </button>
            </>
          )}
        </div>,
        document.body,
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
  onMove,
}: {
  thread: ThreadRecord;
  active: boolean;
  run?: ActiveRunState;
  onClick: () => void;
  onRename: (threadId: string, title: string) => void;
  onToggleStar: (threadId: string) => void;
  onDelete: (threadId: string) => void | Promise<void>;
  onMove?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(thread.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuStyle = useFloatingMenuStyle(menuOpen, buttonRef);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
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

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await onDelete(thread.id);
      setMenuOpen(false);
      setConfirmDelete(false);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") : "Could not delete this chat. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={clsx("thread-row-wrap", active && "active", menuOpen && "menu-open")} ref={rootRef}>
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
            {thread.unreadCompletionId && <span className="chat-unread-dot" role="img" aria-label="Unread completed response" title="New completed response" />}
            {thread.starred && <Star size={12} fill="currentColor" />}
            <span className={clsx(run && isLiveRun(run) && "active-text-shimmer")}>{thread.title}</span>
          </span>
          <small className="thread-time">{formatRelativeThreadTime(thread.updatedAt || thread.createdAt)}</small>
        </button>
      )}
      <button
        ref={buttonRef}
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
      {menuOpen && createPortal(
        <div className="thread-menu floating-thread-menu" ref={menuRef} style={menuStyle}>
          {confirmDelete ? (
            <>
              <button type="button" className="danger" disabled={deleting} onClick={() => void remove()}>
                <Trash2 size={15} />
                <span>{deleting ? "Deleting…" : "Delete now"}</span>
              </button>
              {deleteError && <p role="alert">{deleteError}</p>}
              <button type="button" disabled={deleting} onClick={() => { setConfirmDelete(false); setDeleteError(""); }}>
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
              <button type="button" disabled={!onMove || Boolean(run)} title={!onMove ? "Security chats stay with their project’s scope and evidence." : run ? "Finish the current run before moving this chat." : "Move this chat to another normal project"} onClick={() => { setMenuOpen(false); onMove?.(); }}><Folder size={15} /><span>Move to project…</span></button>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function useFloatingMenuStyle(open: boolean, buttonRef: RefObject<HTMLElement | null>) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const menuWidth = 156;
      const menuHeight = 124;
      const gap = 6;
      const top = rect.bottom + menuHeight + gap > window.innerHeight
        ? Math.max(8, rect.top - menuHeight - gap)
        : rect.bottom + gap;
      const left = Math.min(
        Math.max(8, rect.right - menuWidth),
        Math.max(8, window.innerWidth - menuWidth - 8),
      );
      setStyle({ top, left, minWidth: menuWidth });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [buttonRef, open]);

  return style;
}

function isLiveRun(run: ActiveRunState) {
  return [
    "sampling",
    "running",
    "executing_tool",
    "waiting_tool",
    "waiting_verification",
    "awaiting_approval",
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
