import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDesktopState } from "./state/useDesktopState";
import { Sidebar } from "./components/Sidebar";
import { Composer } from "./components/Composer";
import { ChatMessage } from "./components/ChatMessage";
import { SettingsPanel } from "./components/SettingsPanel";
import { AppLauncher } from "./components/AppLauncher";
import { ReviewPanel } from "./components/ReviewPanel";
import type { ContextMentionRecord, DesktopAttachmentRecord, SaveSettingsInput } from "../shared/types";

export default function App() {
  const { snapshot, activeThread, activeWorkspace, toast, refresh } = useDesktopState();
  const [reviewMessageId, setReviewMessageId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [composerDraft, setComposerDraft] = useState<{ id: number; text: string; attachments?: DesktopAttachmentRecord[] } | null>(null);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const followBottomRef = useRef(true);
  const manualScrollHoldUntilRef = useRef(0);
  const programmaticScrollRef = useRef(false);
  const runStatus = snapshot.activeRun?.status;
  const running =
    runStatus === "sampling" ||
    runStatus === "running" ||
    runStatus === "executing_tool" ||
    runStatus === "waiting_tool" ||
    runStatus === "awaiting_approval" ||
    runStatus === "draining" ||
    runStatus === "completing";
  const resumable = snapshot.activeRun?.resumable === true && (runStatus === "stalled" || runStatus === "stopped");
  const messages = snapshot.messages;
  const lastToolUpdatedAt = useMemo(
    () => snapshot.toolEvents.reduce((latest, tool) => Math.max(latest, tool.updatedAt || tool.createdAt || 0), 0),
    [snapshot.toolEvents],
  );
  const latestActivityKey = `${messages[messages.length - 1]?.id || ""}:${messages[messages.length - 1]?.updatedAt || 0}:${lastToolUpdatedAt}:${snapshot.activeRun?.updatedAt || 0}`;
  const messageVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => 190,
    overscan: 6,
    getItemKey: (index) => messages[index]?.id ?? index,
  });

  const toolsByMessage = useMemo(() => {
    const map = new Map<string, typeof snapshot.toolEvents>();
    snapshot.toolEvents.forEach((tool) => {
      const current = map.get(tool.messageId) || [];
      current.push(tool);
      map.set(tool.messageId, current);
    });
    return map;
  }, [snapshot.toolEvents]);

  const reviewTools = useMemo(
    () => reviewMessageId ? (toolsByMessage.get(reviewMessageId) || []) : [],
    [reviewMessageId, toolsByMessage],
  );

  useEffect(() => {
    const root = document.documentElement;
    const theme = snapshot.settings.theme;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedTheme = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
    root.dataset.theme = resolvedTheme;
    root.classList.toggle("dark", resolvedTheme === "dark");
  }, [snapshot.settings.theme]);

  useEffect(() => {
    if (Date.now() < manualScrollHoldUntilRef.current) {
      setShowJumpButton((value) => value ? value : true);
      return;
    }
    if (!followBottomRef.current || !scrollerRef.current) {
      setShowJumpButton((value) => value ? value : true);
      return;
    }
    window.requestAnimationFrame(() => {
      programmaticScrollRef.current = true;
      if (messages.length > 0) {
        messageVirtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      } else {
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight });
      }
      window.setTimeout(() => {
        programmaticScrollRef.current = false;
      }, 90);
      setShowJumpButton((value) => value && false);
    });
  }, [latestActivityKey, messages.length]);

  useEffect(() => {
    setComposerDraft(null);
    setReviewMessageId(null);
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

  const startPrompt = (prompt: string, attachments?: DesktopAttachmentRecord[], contextMentions?: ContextMentionRecord[]) => {
    if (!activeThread || running) return;
    void window.privoraDesktop.startTurn({ threadId: activeThread.id, prompt, attachments, contextMentions });
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

        <div
          className="message-list"
          ref={scrollerRef}
          onWheel={(event) => {
            if (event.deltaY < 0) {
              manualScrollHoldUntilRef.current = Date.now() + 1200;
              followBottomRef.current = false;
            }
          }}
          onPointerDown={() => {
            manualScrollHoldUntilRef.current = Date.now() + 900;
          }}
          onScroll={() => {
            const scroller = scrollerRef.current;
            if (!scroller) return;
            const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
            if (!programmaticScrollRef.current) {
              followBottomRef.current = distance < 96;
              if (distance >= 96) manualScrollHoldUntilRef.current = Date.now() + 900;
            }
            const shouldShow = distance > 220;
            setShowJumpButton((value) => value === shouldShow ? value : shouldShow);
          }}
        >
          {messages.length === 0 && (
            <div className="empty-state">
              <h2>Local coding agent, clean room.</h2>
              <p>Select a workspace and ask for a real repo task. Privora will read files, patch code, run commands, and pause for risky actions.</p>
            </div>
          )}
          {messages.length > 0 && (
            <div className="virtual-message-spacer" style={{ height: `${messageVirtualizer.getTotalSize()}px` }}>
              {messageVirtualizer.getVirtualItems().map((virtualItem) => {
                const message = messages[virtualItem.index];
                if (!message) return null;
                return (
                  <div
                    key={message.id}
                    ref={messageVirtualizer.measureElement}
                    data-index={virtualItem.index}
                    className="virtual-message-row"
                    style={{ transform: `translateY(${virtualItem.start}px)` }}
                  >
                    <ChatMessage
                      message={message}
                      tools={toolsByMessage.get(message.id) || EMPTY_TOOLS}
                      activeRunStatus={
                        snapshot.activeRun?.assistantMessageId === message.id
                          ? snapshot.activeRun.status
                          : null
                      }
                      onApprove={(callId, approved) => {
                        if (!activeThread) return;
                        void window.privoraDesktop.decideApproval({ threadId: activeThread.id, callId, approved });
                      }}
                      onApproveAll={(callIds) => {
                        if (!activeThread) return;
                        void window.privoraDesktop.decideApproval({
                          threadId: activeThread.id,
                          decisions: callIds.map((callId) => ({ callId, approved: true })),
                        });
                      }}
                      onOpenReview={setReviewMessageId}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="composer-stack">
          {showJumpButton && (
            <button
              type="button"
              className="jump-to-bottom"
              onClick={() => {
                followBottomRef.current = true;
                manualScrollHoldUntilRef.current = 0;
                programmaticScrollRef.current = true;
                scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
                window.setTimeout(() => {
                  programmaticScrollRef.current = false;
                }, 180);
                setShowJumpButton(false);
              }}
            >
              v
            </button>
          )}
          {resumable && activeThread && (
            <button
              type="button"
              className="continue-run-button"
              onClick={() => {
                void window.privoraDesktop.continueRun(activeThread.id);
              }}
            >
              Continue remaining steps
            </button>
          )}
          <Composer
            settings={snapshot.settings}
            disabled={!activeThread || !activeWorkspace}
            running={running}
            activeThreadId={activeThread?.id || null}
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
      <ReviewPanel tools={reviewTools} open={Boolean(reviewMessageId)} onClose={() => setReviewMessageId(null)} />
    </div>
  );
}

const EMPTY_TOOLS: [] = [];
