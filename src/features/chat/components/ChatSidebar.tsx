import type { KeyboardEvent, MouseEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Code2, MessageCircle, Moon, MoreHorizontal, PanelLeft, Pencil, Plus, Search, Star, Sun, Trash2 } from "lucide-react";
import type { ChatRecord, WebDevProjectRecord } from "../../../lib/db";

interface ChatSidebarProps {
  isOpen: boolean;
  workspaceMode: "chat" | "web-dev";
  chats: ChatRecord[];
  webDevProjects: WebDevProjectRecord[];
  currentChatId: string | null;
  currentWebDevProjectId: string | null;
  isTyping: boolean;
  isDarkMode: boolean;
  activeMenuId: string | null;
  onOpenChange: (isOpen: boolean) => void;
  onWorkspaceModeChange: (mode: "chat" | "web-dev") => void;
  onNewChat: () => void;
  onNewWebDevProject: () => void;
  onSearchOpen: () => void;
  onSelectChat: (chatId: string) => void;
  onSelectWebDevProject: (projectId: string) => void;
  onChatRowKeyDown: (event: KeyboardEvent<HTMLDivElement>, chatId: string) => void;
  onActiveMenuChange: (chatId: string | null) => void;
  onToggleDarkMode: () => void;
  onToggleStarChat: (event: MouseEvent, chatId: string) => void;
  onRenameChat: (event: MouseEvent, chatId: string) => void;
  onDeleteChat: (event: MouseEvent, chatId: string) => void;
  onRenameWebDevProject: (event: MouseEvent, projectId: string) => void;
  onDeleteWebDevProject: (event: MouseEvent, projectId: string) => void;
  onToggleStarWebDevProject: (event: MouseEvent, projectId: string) => void;
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
  "currentWebDevProjectId" |
  "onOpenChange" |
  "onWorkspaceModeChange" |
  "onNewChat" |
  "onNewWebDevProject" |
  "onSearchOpen" |
  "onSelectWebDevProject" |
  "onToggleDarkMode" |
  "chats"
  | "onRenameWebDevProject"
  | "onDeleteWebDevProject"
  | "onToggleStarWebDevProject"
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

function WebDevSection({
  projects,
  currentWebDevProjectId,
  activeMenuId,
  onSelectWebDevProject,
  onActiveMenuChange,
  onRenameWebDevProject,
  onDeleteWebDevProject,
  onToggleStarWebDevProject,
}: {
  projects: WebDevProjectRecord[];
  currentWebDevProjectId: string | null;
  activeMenuId: string | null;
  onSelectWebDevProject: (projectId: string) => void;
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
        return (
          <div
            key={project.id}
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
                  <div
                    className="fixed inset-0 z-40"
                    onClick={(event) => {
                      event.stopPropagation();
                      onActiveMenuChange(null);
                    }}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute right-2 top-8 z-50 w-40 overflow-hidden rounded-xl border border-[var(--privora-border)] bg-[var(--privora-surface)] py-1 shadow-xl"
                  >
                    <button
                      type="button"
                      onClick={(event) => onToggleStarWebDevProject(event, project.id)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--privora-text)] transition-colors hover:bg-[var(--privora-text)]/5"
                    >
                      <Star className="h-4 w-4" />
                      {project.isStarred ? "Unstar" : "Star"}
                    </button>
                    <button
                      type="button"
                      onClick={(event) => onRenameWebDevProject(event, project.id)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-sm text-[var(--privora-text)] transition-colors hover:bg-[var(--privora-text)]/5"
                    >
                      <Pencil className="h-4 w-4" />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={(event) => onDeleteWebDevProject(event, project.id)}
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

export function ChatSidebar({
  isOpen,
  workspaceMode,
  chats,
  webDevProjects,
  currentChatId,
  currentWebDevProjectId,
  isTyping,
  isDarkMode,
  activeMenuId,
  onOpenChange,
  onWorkspaceModeChange,
  onNewChat,
  onNewWebDevProject,
  onSearchOpen,
  onSelectChat,
  onSelectWebDevProject,
  onChatRowKeyDown,
  onActiveMenuChange,
  onToggleDarkMode,
  onToggleStarChat,
  onRenameChat,
  onDeleteChat,
  onRenameWebDevProject,
  onDeleteWebDevProject,
  onToggleStarWebDevProject,
}: ChatSidebarProps) {
  const starredChats = chats.filter(chat => chat.isStarred);
  const recentChats = chats.filter(chat => !chat.isStarred);

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
              onClick={() => workspaceMode === "web-dev" ? onNewWebDevProject() : !isTyping && onNewChat()}
              disabled={workspaceMode === "chat" && isTyping}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={workspaceMode === "web-dev" ? "New web app" : "New chat"}
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
            <button
              onClick={() => {
                onWorkspaceModeChange("chat");
                onOpenChange(true);
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] transition-colors"
              title="Chats"
            >
              <MessageCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                onWorkspaceModeChange("web-dev");
                onOpenChange(true);
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--privora-muted)] hover:bg-[var(--privora-text)]/5 hover:text-[var(--privora-text)] transition-colors"
              title="Web Dev"
            >
              <Code2 className="w-4 h-4" />
            </button>
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

            <div className="flex flex-col gap-1 w-full mt-2">
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--privora-border)] bg-[var(--privora-bg)] p-1">
                <button
                  type="button"
                  onClick={() => onWorkspaceModeChange("chat")}
                  className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition ${
                    workspaceMode === "chat" ? "bg-[var(--privora-surface)] text-[var(--privora-text)] shadow-sm" : "text-[var(--privora-muted)] hover:text-[var(--privora-text)]"
                  }`}
                >
                  <MessageCircle className="h-4 w-4" /> Chat
                </button>
                <button
                  type="button"
                  onClick={() => onWorkspaceModeChange("web-dev")}
                  className={`flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition ${
                    workspaceMode === "web-dev" ? "bg-[var(--privora-surface)] text-[var(--privora-text)] shadow-sm" : "text-[var(--privora-muted)] hover:text-[var(--privora-text)]"
                  }`}
                >
                  <Code2 className="h-4 w-4" /> Web Dev
                </button>
              </div>

              <button
                onClick={() => workspaceMode === "web-dev" ? onNewWebDevProject() : !isTyping && onNewChat()}
                disabled={workspaceMode === "chat" && isTyping}
                className="flex items-center gap-3 w-full p-2.5 rounded-lg hover:bg-[var(--privora-text)]/5 transition-colors text-sm font-medium text-[var(--privora-text)] text-left disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                <div className="w-7 h-7 rounded-full bg-[var(--privora-text)]/5 flex items-center justify-center group-hover:bg-[var(--privora-text)]/10 transition-colors shrink-0">
                  <Plus className="w-4 h-4" />
                </div>
                {workspaceMode === "web-dev" ? "New web app" : "New chat"}
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
                currentWebDevProjectId={currentWebDevProjectId}
                activeMenuId={activeMenuId}
                onSelectWebDevProject={onSelectWebDevProject}
                onActiveMenuChange={onActiveMenuChange}
                onRenameWebDevProject={onRenameWebDevProject}
                onDeleteWebDevProject={onDeleteWebDevProject}
                onToggleStarWebDevProject={onToggleStarWebDevProject}
              />
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
