import type { ReactNode } from "react";

interface ChatShellProps {
  composerStack: ReactNode;
  messageList: ReactNode;
  settingsLayer: ReactNode;
  settingsOpen: boolean;
  title: string;
  toast?: string | null;
}

export function ChatShell({
  composerStack,
  messageList,
  settingsLayer,
  settingsOpen,
  title,
  toast,
}: ChatShellProps) {
  return (
    <main className={settingsOpen ? "chat-shell settings-open" : "chat-shell"}>
      <header className="topbar">
        <div className="topbar-title">
          <h1>{title}</h1>
        </div>
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
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
