import type { ReactNode } from "react";

interface ChatShellProps {
  composerStack: ReactNode;
  messageList: ReactNode;
  settingsLayer: ReactNode;
  settingsOpen: boolean;
  title: string;
  topbarLeading?: ReactNode;
  topbarSecondary?: ReactNode;
  topbarTrailing?: ReactNode;
  toast?: string | null;
}

export function ChatShell({
  composerStack,
  messageList,
  settingsLayer,
  settingsOpen,
  title,
  topbarLeading,
  topbarSecondary,
  topbarTrailing,
  toast,
}: ChatShellProps) {
  return (
    <main className={settingsOpen ? "chat-shell settings-open" : "chat-shell"}>
      <header className="topbar">
        {topbarLeading}
        <div className="topbar-title">
          <h1>{title}</h1>
          {topbarSecondary}
        </div>
        {topbarTrailing && <div className="topbar-actions">{topbarTrailing}</div>}
      </header>

      {messageList}

      <div className="composer-stack">
        {composerStack}
      </div>
      {settingsOpen && (
        <div className="settings-screen-layer">
          {settingsLayer}
        </div>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
