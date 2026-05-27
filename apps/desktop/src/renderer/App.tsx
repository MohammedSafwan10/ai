import { useEffect, useMemo, useRef, useState } from "react";
import { useDesktopState } from "./state/useDesktopState";
import { Sidebar } from "./components/Sidebar";
import { Composer } from "./components/Composer";
import { ChatMessage } from "./components/ChatMessage";
import { SettingsPanel } from "./components/SettingsPanel";
import { AppLauncher } from "./components/AppLauncher";
import { ReviewPanel, ReviewStrip } from "./components/ReviewPanel";
import type { DesktopAttachmentRecord, SaveSettingsInput } from "../shared/types";

export default function App() {
  const { snapshot, activeThread, activeWorkspace, toast, refresh } = useDesktopState();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [composerDraft, setComposerDraft] = useState<{ id: number; text: string; attachments?: DesktopAttachmentRecord[] } | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const running = snapshot.activeRun?.status === "running" || snapshot.activeRun?.status === "awaiting_approval";
  const messages = snapshot.messages;

  const toolsByMessage = useMemo(() => {
    const map = new Map<string, typeof snapshot.toolEvents>();
    snapshot.toolEvents.forEach((tool) => {
      const current = map.get(tool.messageId) || [];
      current.push(tool);
      map.set(tool.messageId, current);
    });
    return map;
  }, [snapshot.toolEvents]);

  const latestReviewTools = useMemo(() => {
    const assistantIds = messages.filter((message) => message.role === "assistant").map((message) => message.id).reverse();
    const latestId = assistantIds.find((messageId) => (toolsByMessage.get(messageId) || []).some((tool) => tool.diff));
    return latestId ? (toolsByMessage.get(latestId) || []).filter((tool) => tool.diff) : [];
  }, [messages, toolsByMessage]);

  useEffect(() => {
    const root = document.documentElement;
    const theme = snapshot.settings.theme;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedTheme = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
    root.dataset.theme = resolvedTheme;
    root.classList.toggle("dark", resolvedTheme === "dark");
  }, [snapshot.settings.theme]);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, snapshot.activeRun, snapshot.toolEvents.length]);

  useEffect(() => {
    setComposerDraft(null);
  }, [activeThread?.id]);

  const saveSettings = async (settings: SaveSettingsInput) => {
    try {
      await window.privoraDesktop.saveSettings(settings);
      await refresh();
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const startPrompt = (prompt: string, attachments?: DesktopAttachmentRecord[]) => {
    if (!activeThread || running) return;
    void window.privoraDesktop.startTurn({ threadId: activeThread.id, prompt, attachments });
  };

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <Sidebar
        threads={snapshot.threads}
        workspaces={snapshot.workspaces}
        activeThreadId={snapshot.activeThreadId}
        activeWorkspace={activeWorkspace}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        onSelectWorkspace={async () => {
          await window.privoraDesktop.selectWorkspace();
          await refresh();
        }}
        onNewThread={async () => {
          await window.privoraDesktop.createThread(activeWorkspace?.id ?? null);
          await refresh();
        }}
        onSelectThread={async (threadId) => {
          await window.privoraDesktop.setActiveThread(threadId);
          await refresh();
        }}
        onRenameThread={async (threadId, title) => {
          await window.privoraDesktop.renameThread(threadId, title);
          await refresh();
        }}
        onToggleThreadStar={async (threadId) => {
          await window.privoraDesktop.toggleThreadStar(threadId);
          await refresh();
        }}
        onDeleteThread={async (threadId) => {
          await window.privoraDesktop.deleteThread(threadId);
          await refresh();
        }}
      />
      <main className="chat-shell">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{activeThread?.title || "New chat"}</h1>
          </div>
          <div className="topbar-actions">
            <AppLauncher disabled={!activeWorkspace} />
            <SettingsPanel settings={snapshot.settings} onSave={saveSettings} />
          </div>
        </header>

        <div className="message-list" ref={scrollerRef}>
          {messages.length === 0 && (
            <div className="empty-state">
              <h2>Local coding agent, clean room.</h2>
              <p>Select a workspace and ask for a real repo task. Privora will read files, patch code, run commands, and pause for risky actions.</p>
            </div>
          )}
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              message={message}
              tools={toolsByMessage.get(message.id) || []}
              activeRunStatus={
                snapshot.activeRun?.assistantMessageId === message.id
                  ? snapshot.activeRun.status
                  : null
              }
              onApprove={(callId, approved) => {
                if (!activeThread) return;
                void window.privoraDesktop.decideApproval({ threadId: activeThread.id, callId, approved });
              }}
              onOpenPath={(targetPath) => {
                void window.privoraDesktop.openPath(targetPath);
              }}
            />
          ))}
        </div>

        <div className="composer-stack">
          <ReviewStrip tools={latestReviewTools} onOpen={() => setReviewOpen(true)} />
          <Composer
            settings={snapshot.settings}
            disabled={!activeThread || !activeWorkspace}
            running={running}
            draft={composerDraft}
            onDraftConsumed={() => setComposerDraft(null)}
            onSubmit={startPrompt}
            onStop={() => {
              if (!activeThread) return;
              void window.privoraDesktop.stopTurn(activeThread.id);
            }}
            onSettings={saveSettings}
          />
        </div>
        {toast && <div className="toast">{toast}</div>}
      </main>
      <ReviewPanel tools={latestReviewTools} open={reviewOpen} onClose={() => setReviewOpen(false)} />
    </div>
  );
}
