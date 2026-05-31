import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, Pencil, Play, X } from "lucide-react";
import { useDesktopState } from "./state/useDesktopState";
import { Sidebar } from "./components/Sidebar";
import { Composer } from "./components/Composer";
import { ChatMessage } from "./components/ChatMessage";
import { SettingsPanel, SettingsScreen } from "./components/SettingsPanel";
import { ReviewPanel } from "./components/ReviewPanel";
import type { ContextMentionRecord, DesktopAttachmentRecord, SaveSettingsInput } from "../shared/types";

interface QueuedPrompt {
  id: string;
  prompt: string;
  attachments?: DesktopAttachmentRecord[];
  contextMentions?: ContextMentionRecord[];
}

export default function App() {
  const { snapshot, activeThread, activeWorkspace, toast, refresh } = useDesktopState();
  const [reviewMessageId, setReviewMessageId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [composerDraft, setComposerDraft] = useState<{
    id: number;
    text: string;
    attachments?: DesktopAttachmentRecord[];
    contextMentions?: ContextMentionRecord[];
  } | null>(null);
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const [queuePaused, setQueuePaused] = useState(false);
  const [queueExpanded, setQueueExpanded] = useState(false);
  const [stoppingThreadId, setStoppingThreadId] = useState<string | null>(null);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const followBottomRef = useRef(true);
  const manualScrollHoldUntilRef = useRef(0);
  const programmaticScrollRef = useRef(false);
  const queuedSubmitInFlightRef = useRef(false);
  const runStatus = snapshot.activeRun?.status;
  const running =
    runStatus === "sampling" ||
    runStatus === "running" ||
    runStatus === "executing_tool" ||
    runStatus === "waiting_tool" ||
    runStatus === "awaiting_approval" ||
    runStatus === "draining" ||
    runStatus === "completing";
  const stopping = Boolean(activeThread?.id && stoppingThreadId === activeThread.id && running);
  const resumable = snapshot.activeRun?.resumable === true && (runStatus === "stalled" || runStatus === "stopped");
  const messages = snapshot.messages;
  const promptHistory = useMemo(
    () => messages
      .filter((message) => message.role === "user" && message.threadId === activeThread?.id && message.content.trim())
      .map((message) => message.content)
      .filter((content, index, items) => index === 0 || content !== items[index - 1]),
    [activeThread?.id, messages],
  );
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

  const scrollToLatestMessage = (behavior: ScrollBehavior = "auto") => {
    followBottomRef.current = true;
    manualScrollHoldUntilRef.current = 0;
    window.requestAnimationFrame(() => {
      programmaticScrollRef.current = true;
      if (messages.length > 0) {
        messageVirtualizer.scrollToIndex(messages.length - 1, { align: "end" });
      } else {
        scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior });
      }
      window.setTimeout(() => {
        if (messages.length > 0) {
          messageVirtualizer.scrollToIndex(messages.length - 1, { align: "end" });
        } else {
          scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior });
        }
        programmaticScrollRef.current = false;
      }, 90);
      setShowJumpButton(false);
    });
  };

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
  const undoByMessage = useMemo(() => {
    const map = new Map<string, typeof snapshot.turnUndos[number]>();
    snapshot.turnUndos.forEach((undo) => map.set(undo.messageId, undo));
    return map;
  }, [snapshot.turnUndos]);

  useEffect(() => {
    const root = document.documentElement;
    const theme = snapshot.settings.theme;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedTheme = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
    root.dataset.theme = resolvedTheme;
    root.classList.toggle("dark", resolvedTheme === "dark");
  }, [snapshot.settings.theme]);

  useEffect(() => {
    if (settingsOpen) return;
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
  }, [latestActivityKey, messages.length, settingsOpen]);

  useEffect(() => {
    if (settingsOpen) return;
    scrollToLatestMessage();
  }, [activeThread?.id, settingsOpen, messages.length]);

  useEffect(() => {
    setComposerDraft(null);
    setReviewMessageId(null);
    setQueuedPrompts([]);
    setQueuePaused(false);
    setQueueExpanded(false);
    setStoppingThreadId(null);
    queuedSubmitInFlightRef.current = false;
  }, [activeThread?.id]);

  useEffect(() => {
    if (queuedPrompts.length <= 1) setQueueExpanded(false);
  }, [queuedPrompts.length]);

  const saveSettings = async (settings: SaveSettingsInput) => {
    try {
      await window.privoraDesktop.saveSettings(settings);
      await refresh();
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const startPrompt = async (prompt: string, attachments?: DesktopAttachmentRecord[], contextMentions?: ContextMentionRecord[]) => {
    if (!activeThread) return false;
    if (running) {
      setQueuedPrompts((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          prompt,
          attachments,
          contextMentions,
        },
      ]);
      return true;
    }
    void window.privoraDesktop.startTurn({ threadId: activeThread.id, prompt, attachments, contextMentions })
      .catch((error) => {
        console.error(error);
        setComposerDraft({
          id: Date.now(),
          text: prompt,
          attachments,
          contextMentions,
        });
      });
    return true;
  };

  useEffect(() => {
    if (!running && stoppingThreadId === activeThread?.id) setStoppingThreadId(null);
  }, [activeThread?.id, running, stoppingThreadId]);

  useEffect(() => {
    if (running) queuedSubmitInFlightRef.current = false;
    if (!activeThread || running || queuePaused || queuedSubmitInFlightRef.current || queuedPrompts.length === 0) return;
    const [next, ...rest] = queuedPrompts;
    queuedSubmitInFlightRef.current = true;
    setQueuedPrompts(rest);
    void window.privoraDesktop.startTurn({
      threadId: activeThread.id,
      prompt: next.prompt,
      attachments: next.attachments,
      contextMentions: next.contextMentions,
    }).catch(() => {
      queuedSubmitInFlightRef.current = false;
      setQueuedPrompts((current) => [next, ...current]);
    });
  }, [activeThread, queuePaused, queuedPrompts, running]);

  const runQueuedPrompt = (item: QueuedPrompt) => {
    if (!activeThread || running || queuedSubmitInFlightRef.current) return;
    queuedSubmitInFlightRef.current = true;
    setQueuePaused(false);
    setQueuedPrompts((current) => current.filter((candidate) => candidate.id !== item.id));
    void window.privoraDesktop.startTurn({
      threadId: activeThread.id,
      prompt: item.prompt,
      attachments: item.attachments,
      contextMentions: item.contextMentions,
    }).catch(() => {
      queuedSubmitInFlightRef.current = false;
      setQueuedPrompts((current) => [item, ...current]);
      setQueuePaused(true);
    });
  };

  const stopActiveTurn = () => {
    if (!activeThread || stoppingThreadId === activeThread.id) return;
    setStoppingThreadId(activeThread.id);
    if (queuedPrompts.length > 0) setQueuePaused(true);
    void window.privoraDesktop.stopTurn(activeThread.id);
  };

  const editQueuedPrompt = (item: QueuedPrompt) => {
    setComposerDraft({
      id: Date.now(),
      text: item.prompt,
      attachments: item.attachments,
      contextMentions: item.contextMentions,
    });
    setQueuedPrompts((current) => current.filter((candidate) => candidate.id !== item.id));
  };

  const removeQueuedPrompt = (item: QueuedPrompt) => {
    setQueuedPrompts((current) => current.filter((candidate) => candidate.id !== item.id));
  };

  const queuedHead = queuedPrompts[0] || null;
  const queuedRest = queuedPrompts.slice(1);

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <Sidebar
        threads={snapshot.threads}
        workspaces={snapshot.workspaces}
        activeThreadId={snapshot.activeThreadId}
        activeRunsByThread={snapshot.activeRunsByThread}
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
        footer={(
          <SettingsPanel
            settings={snapshot.settings}
            workspaceDisabled={!activeWorkspace}
            open={settingsOpen}
            onOpen={() => setSettingsOpen(true)}
            onClose={() => setSettingsOpen(false)}
            onSave={saveSettings}
          />
        )}
      />
      <main className={settingsOpen ? "chat-shell settings-mode" : "chat-shell"}>
        {settingsOpen ? (
          <SettingsScreen
            settings={snapshot.settings}
            workspaceDisabled={!activeWorkspace}
            open={settingsOpen}
            onOpen={() => setSettingsOpen(true)}
            onClose={() => setSettingsOpen(false)}
            onSave={saveSettings}
          />
        ) : (
          <>
            <header className="topbar">
              <div className="topbar-title">
                <h1>{activeThread?.title || "New chat"}</h1>
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
                      onApprove={(callId, approved, scope) => {
                        if (!activeThread) return;
                        void window.privoraDesktop.decideApproval({ threadId: activeThread.id, callId, approved, scope });
                      }}
                      onApproveAll={(callIds) => {
                        if (!activeThread) return;
                        void window.privoraDesktop.decideApproval({
                          threadId: activeThread.id,
                          decisions: callIds.map((callId) => ({ callId, approved: true })),
                        });
                      }}
                      onOpenReview={setReviewMessageId}
                      turnUndo={undoByMessage.get(message.id) || null}
                      onPrepareTurnUndo={(messageId) => window.privoraDesktop.prepareTurnUndo({ messageId })}
                      onUndoTurnChanges={(messageId) => window.privoraDesktop.undoTurnChanges({ messageId })}
                    />
                  </div>
                );
              })}
            </div>
          )}
            </div>

            <div className="composer-stack">
          {snapshot.recoveryNotice && (
            <div className="recovery-notice" role="status">
              <strong>Data recovery used</strong>
              <span>{snapshot.recoveryNotice.message}</span>
              <code>{snapshot.recoveryNotice.backupPath}</code>
            </div>
          )}
          {showJumpButton && (
            <button
              type="button"
              className="jump-to-bottom"
              onClick={() => {
                scrollToLatestMessage("smooth");
              }}
            >
              <ArrowDown size={15} />
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
          {queuedPrompts.length > 0 && (
            <div className={queuePaused ? "queued-prompts is-paused" : "queued-prompts"} aria-label="Queued prompts">
              {queuePaused && <div className="queued-prompt-note">Queue paused after stop</div>}
              {queuedHead && (
                <div className="queued-prompt">
                  <span className="queued-prompt-index">1</span>
                  <p>{queuedHead.prompt}</p>
                  {queuedRest.length > 0 && (
                    <button
                      type="button"
                      className="queued-count-pill"
                      aria-label={`${queuedRest.length} more queued prompts`}
                      aria-expanded={queueExpanded}
                      title={`${queuedRest.length} more queued`}
                      onClick={() => setQueueExpanded((value) => !value)}
                    >
                      +{queuedRest.length}
                    </button>
                  )}
                  {queuePaused && !running && (
                    <button
                      type="button"
                      className="queued-prompt-action"
                      aria-label="Run queued prompt"
                      title="Run queued prompt"
                      onClick={() => runQueuedPrompt(queuedHead)}
                    >
                      <Play size={13} fill="currentColor" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="queued-prompt-action"
                    aria-label="Edit queued prompt"
                    title="Edit queued prompt"
                    onClick={() => editQueuedPrompt(queuedHead)}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    className="queued-prompt-action"
                    aria-label="Remove queued prompt"
                    title="Remove queued prompt"
                    onClick={() => removeQueuedPrompt(queuedHead)}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {queueExpanded && queuedRest.length > 0 && (
                <div className="queued-popover">
                  {queuedRest.map((item, index) => (
                    <div className="queued-prompt queued-prompt-secondary" key={item.id}>
                      <span className="queued-prompt-index">{index + 2}</span>
                      <p>{item.prompt}</p>
                      {queuePaused && !running && (
                        <button
                          type="button"
                          className="queued-prompt-action"
                          aria-label="Run queued prompt"
                          title="Run queued prompt"
                          onClick={() => runQueuedPrompt(item)}
                        >
                          <Play size={13} fill="currentColor" />
                        </button>
                      )}
                      <button
                        type="button"
                        className="queued-prompt-action"
                        aria-label="Edit queued prompt"
                        title="Edit queued prompt"
                        onClick={() => editQueuedPrompt(item)}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        className="queued-prompt-action"
                        aria-label="Remove queued prompt"
                        title="Remove queued prompt"
                        onClick={() => removeQueuedPrompt(item)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <Composer
            settings={snapshot.settings}
            disabled={!activeThread || !activeWorkspace}
            running={running}
            stopping={stopping}
            activeThreadId={activeThread?.id || null}
            promptHistory={promptHistory}
            draft={composerDraft}
            onDraftConsumed={() => setComposerDraft(null)}
            onSubmit={startPrompt}
            onStop={() => {
              stopActiveTurn();
            }}
            onSettings={saveSettings}
          />
            </div>
          </>
        )}
        {toast && <div className="toast">{toast}</div>}
      </main>
      <ReviewPanel tools={reviewTools} open={Boolean(reviewMessageId)} onClose={() => setReviewMessageId(null)} />
    </div>
  );
}

const EMPTY_TOOLS: [] = [];
