import type { ComponentType, KeyboardEvent, MouseEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Code2, LayoutDashboard, MessageCircle, Moon, MoreHorizontal, PanelLeft, Pencil, Plus, Search, Star, Sun, Trash2 } from "lucide-react";
import type { CharacterRecord, CharacterSessionRecord, ChatRecord, WebDevProjectRecord, WebDevThreadRecord } from "../../../lib/db";

type WorkspaceMode = "chat" | "web-dev" | "characters" | "command-center";

function CharacterModeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none">
      <path
        d="M7.75 12.5c2.35-2.55 6.15-2.55 8.5 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M6.25 16.75c3.35-3.15 8.15-3.15 11.5 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="8.25" cy="8.25" r="2.25" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="15.75" cy="8.25" r="2.25" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 4.5v1.25M12 18.25v1.25"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

const workspaceNavItems: Array<{
  mode: WorkspaceMode;
  label: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  {
    mode: "chat",
    label: "Chat",
    icon: MessageCircle,
  },
  {
    mode: "web-dev",
    label: "Web Dev",
    icon: Code2,
  },
  {
    mode: "characters",
    label: "Characters",
    icon: CharacterModeIcon,
  },
  {
    mode: "command-center",
    label: "Command Center",
    icon: LayoutDashboard,
  },
];

interface ChatSidebarProps {
  isOpen: boolean;
  workspaceMode: WorkspaceMode;
  chats: ChatRecord[];
  webDevProjects: WebDevProjectRecord[];
  webDevThreads: WebDevThreadRecord[];
  characters: CharacterRecord[];
  characterSessions: CharacterSessionRecord[];
  currentChatId: string | null;
  currentWebDevProjectId: string | null;
  currentWebDevThreadId: string | null;
  currentCharacterSessionId: string | null;
  isTyping: boolean;
  isDarkMode: boolean;
  activeMenuId: string | null;
  onOpenChange: (isOpen: boolean) => void;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  onNewChat: () => void;
  onNewWebDevProject: () => void;
  onNewWebDevThread: (projectId: string) => void;
  onDeleteWebDevThread: (event: MouseEvent, projectId: string, threadId: string) => void;
  onNewCharacterSession: () => void;
  onSearchOpen: () => void;
  onSelectChat: (chatId: string) => void;
  onSelectWebDevProject: (projectId: string) => void;
  onSelectWebDevThread: (projectId: string, threadId: string) => void;
  onSelectCharacterSession: (sessionId: string) => void;
  onChatRowKeyDown: (event: KeyboardEvent<HTMLDivElement>, chatId: string) => void;
  onActiveMenuChange: (chatId: string | null) => void;
  onToggleDarkMode: () => void;
  onToggleStarChat: (event: MouseEvent, chatId: string) => void;
  onRenameChat: (event: MouseEvent, chatId: string) => void;
  onDeleteChat: (event: MouseEvent, chatId: string) => void;
  onRenameWebDevProject: (event: MouseEvent, projectId: string) => void;
  onDeleteWebDevProject: (event: MouseEvent, projectId: string) => void;
  onToggleStarWebDevProject: (event: MouseEvent, projectId: string) => void;
  onDeleteCharacterSession: (event: MouseEvent, sessionId: string) => void;
}

interface ChatRowProps {
  chat: ChatRecord;
  isActive: boolean;
  isTyping: boolean;
  isMenuOpen: boolean;
  starLabel: string;
  onSelect: (chatId: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>, chatId: string) => void;
  onMenuChange: (chatId: string | null) => void;
  onToggleStar: (event: MouseEvent, chatId: string) => void;
  onRename: (event: MouseEvent, chatId: string) => void;
  onDelete: (event: MouseEvent, chatId: string) => void;
}

function ChatRow({
  chat,
  isActive,
  isTyping,
  isMenuOpen,
  starLabel,
  onSelect,
  onKeyDown,
  onMenuChange,
  onToggleStar,
  onRename,
  onDelete,
}: ChatRowProps) {
  return (
    <div
      role="button"
      tabIndex={isTyping ? -1 : 0}
      aria-disabled={isTyping}
      aria-current={isActive ? "page" : undefined}
      onClick={() => !isTyping && onSelect(chat.id)}
      onKeyDown={(event) => onKeyDown(event, chat.id)}
      className={`relative group flex items-center justify-between p-2 rounded-lg transition-all ${
        isTyping ? "cursor-not-allowed" : "cursor-pointer"
      } ${
        isActive
          ? "bg-[var(--privora-text)]/10 text-[var(--privora-text)] font-medium"
          : "hover:bg-[var(--privora-text)]/5 text-[var(--privora-text)]/70 hover:text-[var(--privora-text)]"
      } ${isTyping && !isActive ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-3 overflow-hidden ml-1 w-full">
        <span className="text-sm truncate w-full pr-6">{chat.title}</span>
      </div>
      {!isTyping && (
        <button
          onClick={(event) => {
            event.stopPropagation();
            onMenuChange(isMenuOpen ? null : chat.id);
          }}
          className={`absolute right-1.5 sm:right-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-1.5 sm:p-1 rounded-md hover:bg-[var(--privora-text)]/10 transition-opacity ${
            isActive ? "text-[var(--privora-text)]" : "text-[var(--privora-muted)]"
          } ${isMenuOpen ? "opacity-100 bg-[var(--privora-text)]/10 text-[var(--privora-text)]" : ""}`}
          title="Chat options"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      )}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={(event) => {
                event.stopPropagation();
                onMenuChange(null);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute right-2 top-8 z-50 w-40 rounded-xl bg-[var(--privora-surface)] border border-[var(--privora-border)] shadow-xl overflow-hidden py-1"
            >
              <button
                onClick={(event) => onToggleStar(event, chat.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[var(--privora-text)] hover:bg-[var(--privora-text)]/5 transition-colors"
              >
                <Star className="w-4 h-4" />
                {starLabel}
              </button>
              <button
                onClick={(event) => onRename(event, chat.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[var(--privora-text)] hover:bg-[var(--privora-text)]/5 transition-colors"
              >
                <Pencil className="w-4 h-4" />
                Rename
              </button>
              <button
                onClick={(event) => onDelete(event, chat.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChatSection({
  title,
  chats,
  currentChatId,
  isTyping,
  activeMenuId,
  starLabel,
  onSelectChat,
  onChatRowKeyDown,
  onActiveMenuChange,
  onToggleStarChat,
  onRenameChat,
  onDeleteChat,
}: Omit<ChatSidebarProps,
  "isOpen" |
  "workspaceMode" |
  "isDarkMode" |
  "webDevProjects" |
  "webDevThreads" |
  "characters" |
  "characterSessions" |
  "currentWebDevProjectId" |
  "currentWebDevThreadId" |
  "currentCharacterSessionId" |
  "onOpenChange" |
  "onWorkspaceModeChange" |
  "onNewChat" |
  "onNewWebDevProject" |
  "onNewWebDevThread" |
  "onDeleteWebDevThread" |
  "onNewCharacterSession" |
  "onSearchOpen" |
  "onSelectWebDevProject" |
  "onSelectWebDevThread" |
  "onSelectCharacterSession" |
  "onToggleDarkMode" |
  "chats"
  | "onRenameWebDevProject"
  | "onDeleteWebDevProject"
  | "onToggleStarWebDevProject"
  | "onDeleteCharacterSession"
> & {
  title: string;
  chats: ChatRecord[];
  starLabel: string;
}) {
  if (chats.length === 0) return null;

  return (
    <div className={title === "Starred" ? "mb-4" : undefined}>
      <div className="px-3 pb-2 pt-2 text-xs font-medium text-[var(--privora-muted)]">{title}</div>
      {chats.map(chat => (
        <ChatRow
          key={chat.id}
          chat={chat}
          isActive={currentChatId === chat.id}
          isTyping={isTyping}
          isMenuOpen={activeMenuId === chat.id}
          starLabel={starLabel}
          onSelect={onSelectChat}
          onKeyDown={onChatRowKeyDown}
          onMenuChange={onActiveMenuChange}
          onToggleStar={onToggleStarChat}
          onRename={onRenameChat}
          onDelete={onDeleteChat}
        />
      ))}
    </div>
  );
}

function CharacterSection({
  sessions,
  characters,
  currentCharacterSessionId,
  activeMenuId,
  onSelectCharacterSession,
  onActiveMenuChange,
  onDeleteCharacterSession,
}: {
  sessions: CharacterSessionRecord[];
  characters: CharacterRecord[];
  currentCharacterSessionId: string | null;
  activeMenuId: string | null;
  onSelectCharacterSession: (sessionId: string) => void;
  onActiveMenuChange: (sessionId: string | null) => void;
  onDeleteCharacterSession: (event: MouseEvent, sessionId: string) => void;
}) {
  if (sessions.length === 0) {
    return <div className="px-3 py-4 text-sm text-[var(--privora-muted)]">No character chats yet.</div>;
  }

  return (
    <div>
      <div className="px-3 pb-2 pt-2 text-xs font-medium text-[var(--privora-muted)]">Character chats</div>
      {sessions.map(session => {
        const character = characters.find(item => item.id === session.characterId);
        const isActive = currentCharacterSessionId === session.id;
        const isMenuOpen = activeMenuId === session.id;
        return (
          <div
            key={session.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelectCharacterSession(session.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectCharacterSession(session.id);
              }
            }}
            className={`group relative flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-left text-sm transition ${
              isActive
                ? "bg-[var(--privora-text)]/10 font-medium text-[var(--privora-text)]"
                : "text-[var(--privora-text)]/70 hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]"
            }`}
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold text-white"
              style={{ background: character?.color || "var(--privora-accent)" }}
            >
              {character?.avatar || "AI"}
            </span>
            <span className="min-w-0 flex-1 truncate pr-7">{session.title}</span>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onActiveMenuChange(isMenuOpen ? null : session.id);
              }}
              className={`absolute right-1.5 rounded-md p-1.5 text-[var(--privora-muted)] opacity-100 transition hover:bg-[var(--privora-text)]/10 hover:text-[var(--privora-text)] sm:opacity-0 sm:group-hover:opacity-100 ${isMenuOpen ? "bg-[var(--privora-text)]/10 text-[var(--privora-text)] opacity-100" : ""}`}
              title="Character chat options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <AnimatePresence>
              {isMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(event) => { event.stopPropagation(); onActiveMenuChange(null); }} />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute right-2 top-8 z-50 w-40 overflow-hidden rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] py-1 shadow-xl"
                  >
                    <button
                      type="button"
                      onClick={(event) => onDeleteCharacterSession(event, session.id)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function WebDevSection({
  projects,
  threads,
  currentWebDevProjectId,
  currentWebDevThreadId,
  activeMenuId,
  onSelectWebDevProject,
  onSelectWebDevThread,
  onNewWebDevThread,
  onDeleteWebDevThread,
  onActiveMenuChange,
  onRenameWebDevProject,
  onDeleteWebDevProject,
  onToggleStarWebDevProject,
}: {
  projects: WebDevProjectRecord[];
  threads: WebDevThreadRecord[];
  currentWebDevProjectId: string | null;
  currentWebDevThreadId: string | null;
  activeMenuId: string | null;
  onSelectWebDevProject: (projectId: string) => void;
  onSelectWebDevThread: (projectId: string, threadId: string) => void;
  onNewWebDevThread: (projectId: string) => void;
  onDeleteWebDevThread: (event: MouseEvent, projectId: string, threadId: string) => void;
  onActiveMenuChange: (projectId: string | null) => void;
  onRenameWebDevProject: (event: MouseEvent, projectId: string) => void;
  onDeleteWebDevProject: (event: MouseEvent, projectId: string) => void;
  onToggleStarWebDevProject: (event: MouseEvent, projectId: string) => void;
}) {
  if (projects.length === 0) {
    return <div className="px-3 py-4 text-sm text-[var(--privora-muted)]">No web apps yet.</div>;
  }

  return (
    <div>
      <div className="px-3 pb-2 pt-2 text-xs font-medium text-[var(--privora-muted)]">Web apps</div>
      {projects.map(project => {
        const isActive = currentWebDevProjectId === project.id;
        const isMenuOpen = activeMenuId === project.id;
        const projectThreads = isActive ? threads.filter(thread => thread.projectId === project.id) : [];
        return (
          <div key={project.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelectWebDevProject(project.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectWebDevProject(project.id);
                }
              }}
              className={`group relative flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-left text-sm transition ${
                isActive
                  ? "bg-[var(--privora-text)]/10 font-medium text-[var(--privora-text)]"
                  : "text-[var(--privora-text)]/70 hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]"
              }`}
            >
              <Code2 className="h-4 w-4 shrink-0 text-[var(--privora-muted)]" />
              <span className="min-w-0 flex-1 truncate pr-7">{project.title}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onActiveMenuChange(isMenuOpen ? null : project.id);
                }}
                className={`absolute right-1.5 rounded-md p-1.5 text-[var(--privora-muted)] opacity-100 transition hover:bg-[var(--privora-text)]/10 hover:text-[var(--privora-text)] sm:opacity-0 sm:group-hover:opacity-100 ${isMenuOpen ? "bg-[var(--privora-text)]/10 text-[var(--privora-text)] opacity-100" : ""}`}
                title="Web app options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              <AnimatePresence>
                {isMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={(event) => { event.stopPropagation(); onActiveMenuChange(null); }} />
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute right-2 top-8 z-50 w-44 overflow-hidden rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] py-1 shadow-xl">
                      <button type="button" onClick={(event) => onToggleStarWebDevProject(event, project.id)} className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--privora-text)] transition-colors hover:bg-[var(--privora-text)]/5">
                        <Star className="h-4 w-4" /> {project.isStarred ? "Unstar" : "Star"}
                      </button>
                      <button type="button" onClick={(event) => { event.stopPropagation(); onNewWebDevThread(project.id); onActiveMenuChange(null); }} className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--privora-text)] transition-colors hover:bg-[var(--privora-text)]/5">
                        <MessageCircle className="h-4 w-4" /> New thread
                      </button>
                      <button type="button" onClick={(event) => onRenameWebDevProject(event, project.id)} className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--privora-text)] transition-colors hover:bg-[var(--privora-text)]/5">
                        <Pencil className="h-4 w-4" /> Rename
                      </button>
                      <button type="button" onClick={(event) => onDeleteWebDevProject(event, project.id)} className="flex w-full items-center gap-3 px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10">
                        <Trash2 className="h-4 w-4" /> Delete
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
            {isActive && (
              <div className="ml-6 mt-1 space-y-1 border-l border-[var(--privora-border)]/70 pl-2">
                {projectThreads.map(thread => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => onSelectWebDevThread(project.id, thread.id)}
                    className={`group/thread flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${
                      currentWebDevThreadId === thread.id
                        ? "bg-[var(--privora-text)]/10 font-medium text-[var(--privora-text)]"
                        : "text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]"
                    }`}
                  >
                    <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                    <span
                      role="button"
                      tabIndex={-1}
                      onClick={(event) => onDeleteWebDevThread(event, project.id, thread.id)}
                      className="rounded p-1 text-[var(--privora-muted)] opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover/thread:opacity-100"
                      title="Delete thread"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}
                <button type="button" onClick={() => onNewWebDevThread(project.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[var(--privora-muted)] transition hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]">
                  <Plus className="h-3.5 w-3.5" /> New thread
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ChatSidebar({
  isOpen,
  workspaceMode,
  chats,
  webDevProjects,
  webDevThreads,
  characters,
  characterSessions,
  currentChatId,
  currentWebDevProjectId,
  currentWebDevThreadId,
  currentCharacterSessionId,
  isTyping,
  isDarkMode,
  activeMenuId,
  onOpenChange,
  onWorkspaceModeChange,
  onNewChat,
  onNewWebDevProject,
  onNewWebDevThread,
  onDeleteWebDevThread,
  onNewCharacterSession,
  onSearchOpen,
  onSelectChat,
  onSelectWebDevProject,
  onSelectWebDevThread,
  onSelectCharacterSession,
  onChatRowKeyDown,
  onActiveMenuChange,
  onToggleDarkMode,
  onToggleStarChat,
  onRenameChat,
  onDeleteChat,
  onRenameWebDevProject,
  onDeleteWebDevProject,
  onToggleStarWebDevProject,
  onDeleteCharacterSession,
}: ChatSidebarProps) {
  const starredChats = chats.filter(chat => chat.isStarred);
  const recentChats = chats.filter(chat => !chat.isStarred);
  const activeMode = workspaceNavItems.find(item => item.mode === workspaceMode) || workspaceNavItems[0];
  const ActiveModeIcon = activeMode.icon;
  const newItemLabel =
    workspaceMode === "web-dev" ? "New web app" :
    workspaceMode === "characters" ? "New character chat" :
    workspaceMode === "command-center" ? "Open capture" :
    "New chat";
  const runNewItemAction = () => {
    if (workspaceMode === "web-dev") {
      onNewWebDevProject();
      return;
    }
    if (workspaceMode === "characters") {
      onNewCharacterSession();
      return;
    }
    if (workspaceMode === "command-center") {
      onWorkspaceModeChange("command-center");
      return;
    }
    if (!isTyping) onNewChat();
  };

  return (
    <motion.aside
      initial={false}
      animate={{
        width: isOpen ? 280 : 48,
        x: 0,
      }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className={`fixed md:relative h-full z-50 bg-[var(--privora-surface)] border-r border-[var(--privora-border)] flex flex-col overflow-visible shadow-2xl md:shadow-none transition-colors duration-500 ${!isOpen ? "max-md:hidden" : ""}`}
    >
      {!isOpen ? (
        <div className="w-12 h-full flex flex-col items-center py-2 bg-[var(--privora-surface)]">
          <button
            onClick={() => onOpenChange(true)}
            className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] transition-colors"
            title="Open sidebar"
          >
            <PanelLeft className="w-[18px] h-[18px]" />
          </button>

          <div className="mt-4 flex flex-col items-center gap-2">
            <button
              onClick={runNewItemAction}
              disabled={workspaceMode === "chat" && isTyping}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={newItemLabel}
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={onSearchOpen}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] transition-colors"
              title="Search chats"
            >
              <Search className="w-4 h-4" />
            </button>
            {workspaceNavItems.map(item => {
              const Icon = item.icon;
              const isActive = workspaceMode === item.mode;
              return (
                <button
                  key={item.mode}
                  onClick={() => {
                    onWorkspaceModeChange(item.mode);
                    onOpenChange(true);
                  }}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                    isActive
                      ? "bg-[var(--privora-text)] text-[var(--privora-bg)]"
                      : "text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]"
                  }`}
                  title={item.label}
                >
                  <Icon className="w-4 h-4" />
                </button>
              );
            })}
            {starredChats.length > 0 && (
              <button
                onClick={() => onOpenChange(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] transition-colors"
                title="Starred chats"
              >
                <Star className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="mt-auto flex flex-col items-center gap-2">
            <button
              onClick={onToggleDarkMode}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] transition-colors"
              title={isDarkMode ? "Light mode" : "Dark mode"}
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      ) : (
        <div className="w-[280px] h-full flex flex-col overflow-hidden">
          <div className="p-4 pl-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-semibold text-[19px] tracking-tight text-[var(--privora-text)]">Privora</span>
              <button
                onClick={() => onOpenChange(false)}
                className="p-1.5 rounded-md text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] transition-colors"
                title="Close sidebar"
              >
                <PanelLeft className="w-[18px] h-[18px]" />
              </button>
            </div>

            <div className="flex flex-col gap-3 w-full mt-2">
              <div>
                <div className="space-y-1 rounded-2xl border border-[var(--privora-border)] bg-[var(--privora-bg)]/45 p-1">
                  {workspaceNavItems.map(item => {
                    const Icon = item.icon;
                    const isActive = workspaceMode === item.mode;
                    return (
                      <button
                        key={item.mode}
                        type="button"
                        onClick={() => onWorkspaceModeChange(item.mode)}
                        className={`flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm font-medium transition ${
                          isActive
                            ? "bg-[var(--privora-surface)] text-[var(--privora-text)] shadow-sm"
                            : "text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]"
                        }`}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={runNewItemAction}
                disabled={workspaceMode === "chat" && isTyping}
                className="flex items-center gap-3 w-full rounded-xl border border-[var(--privora-border)] bg-[var(--privora-bg)]/55 p-2.5 text-left text-sm font-medium text-[var(--privora-text)] transition-colors hover:bg-[var(--privora-text)]/5 disabled:cursor-not-allowed disabled:opacity-50 group"
              >
                <div className="w-7 h-7 rounded-full bg-[var(--privora-text)]/5 flex items-center justify-center group-hover:bg-[var(--privora-text)]/10 transition-colors shrink-0">
                  <Plus className="w-4 h-4" />
                </div>
                <span className="min-w-0 flex-1 truncate">{newItemLabel}</span>
                <ActiveModeIcon className="h-4 w-4 shrink-0 text-[var(--privora-muted)]" />
              </button>

              {workspaceMode === "chat" && (
                <button
                  onClick={onSearchOpen}
                  className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-[var(--privora-text)]/5 transition-colors text-[14px] text-[var(--privora-text)] text-left group"
                >
                  <div className="w-7 h-7 flex items-center justify-center shrink-0">
                    <Search className="w-[18px] h-[18px] text-[var(--privora-text)]/80" />
                  </div>
                  Search
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar pl-4">
              {workspaceMode === "web-dev" ? (
                <WebDevSection
                  projects={webDevProjects}
                  threads={webDevThreads}
                currentWebDevProjectId={currentWebDevProjectId}
                currentWebDevThreadId={currentWebDevThreadId}
                activeMenuId={activeMenuId}
                onSelectWebDevProject={onSelectWebDevProject}
                onSelectWebDevThread={onSelectWebDevThread}
                onNewWebDevThread={onNewWebDevThread}
                onDeleteWebDevThread={onDeleteWebDevThread}
                onActiveMenuChange={onActiveMenuChange}
                onRenameWebDevProject={onRenameWebDevProject}
                onDeleteWebDevProject={onDeleteWebDevProject}
                onToggleStarWebDevProject={onToggleStarWebDevProject}
              />
              ) : workspaceMode === "characters" ? (
                <CharacterSection
                  sessions={characterSessions}
                  characters={characters}
                currentCharacterSessionId={currentCharacterSessionId}
                activeMenuId={activeMenuId}
                onSelectCharacterSession={onSelectCharacterSession}
                  onActiveMenuChange={onActiveMenuChange}
                  onDeleteCharacterSession={onDeleteCharacterSession}
                />
              ) : workspaceMode === "command-center" ? (
                <div className="px-3 py-3 text-sm text-[var(--privora-muted)]">
                  <div className="mb-2 font-medium text-[var(--privora-text)]">Workspace tools</div>
                  <div className="space-y-1.5">
                    {["Tasks", "Notes", "Finance", "Activity"].map(item => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => onWorkspaceModeChange("command-center")}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)]"
                      >
                        <LayoutDashboard className="h-3.5 w-3.5" />
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                <ChatSection
                  title="Starred"
                  chats={starredChats}
                  currentChatId={currentChatId}
                  isTyping={isTyping}
                  activeMenuId={activeMenuId}
                  starLabel="Unstar"
                  onSelectChat={onSelectChat}
                  onChatRowKeyDown={onChatRowKeyDown}
                  onActiveMenuChange={onActiveMenuChange}
                  onToggleStarChat={onToggleStarChat}
                  onRenameChat={onRenameChat}
                  onDeleteChat={onDeleteChat}
                />
                <ChatSection
                  title="Recents"
                  chats={recentChats}
                  currentChatId={currentChatId}
                  isTyping={isTyping}
                  activeMenuId={activeMenuId}
                  starLabel="Star"
                  onSelectChat={onSelectChat}
                  onChatRowKeyDown={onChatRowKeyDown}
                  onActiveMenuChange={onActiveMenuChange}
                  onToggleStarChat={onToggleStarChat}
                  onRenameChat={onRenameChat}
                  onDeleteChat={onDeleteChat}
                />
              </>
            )}
          </div>

          <div className="pt-4 border-t border-[var(--privora-border)] mt-4">
            <button
              onClick={onToggleDarkMode}
              className="flex items-center gap-3 w-full p-3 rounded-xl hover:bg-[var(--privora-text)]/5 transition-colors text-sm text-[var(--privora-muted)] hover:text-[var(--privora-text)]"
            >
              {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {isDarkMode ? "Light Mode" : "Dark Mode"}
            </button>
          </div>
        </div>
      )}
    </motion.aside>
  );
}
