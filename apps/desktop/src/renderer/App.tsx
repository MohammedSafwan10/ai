import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { ArrowDown, BookOpen, Bug, ChevronDown, ChevronLeft, ChevronRight, Download, FileSearch, GitBranch, Layers, ListChecks, MessageSquareMore, PackageCheck, PanelLeftClose, PanelLeftOpen, PanelRightOpen, Pencil, Play, Recycle, RotateCw, ShieldAlert, Terminal, Wand2, X } from "lucide-react";
import clsx from "clsx";
import { useDesktopState } from "./state/useDesktopState";
import { Sidebar } from "./components/Sidebar";
import { Composer } from "./components/Composer";
import { ChatMessage } from "./components/ChatMessage";
import { SettingsPanel, SettingsScreen } from "./components/SettingsPanel";
import { WorkspaceIdeShell } from "./components/WorkspaceIdeShell";
import { AppLauncher } from "./components/AppLauncher";
import { ChatShell } from "./features/chat/ChatShell";
import { useMessageAutoScroll } from "./features/chat/useMessageAutoScroll";
import { usePromptQueue } from "./features/chat/usePromptQueue";
import { buildReviewSession, type ReviewSession } from "./reviewModels";
import type { ContextMentionRecord, DesktopAttachmentRecord, RequestUserInputRequestRecord, SaveSettingsInput, UpdateStatus } from "../shared/types";

export default function App() {
  const { snapshot, activeThread, activeWorkspace, toast, refresh } = useDesktopState();
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ideCollapsed, setIdeCollapsed] = useState(true);
  const [ideWidth, setIdeWidth] = useState(620);
  const [zoomToast, setZoomToast] = useState<{ id: number; percent: number; visible: boolean } | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const zoomToastTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [composerDraft, setComposerDraft] = useState<{
    id: number;
    text: string;
    attachments?: DesktopAttachmentRecord[];
    contextMentions?: ContextMentionRecord[];
  } | null>(null);
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
  const {
    handleMessagePointerDown,
    handleMessageScroll,
    handleMessageWheel,
    messageVirtualizer,
    scrollToLatestMessage,
    scrollerRef,
    showJumpButton,
  } = useMessageAutoScroll({
    activeThreadId: activeThread?.id || null,
    latestActivityKey,
    messages,
    settingsOpen,
  });

  const toolsByMessage = useMemo(() => {
    const map = new Map<string, typeof snapshot.toolEvents>();
    const childParentMessage = new Map(snapshot.subagents.map((agent) => [agent.threadId, agent.parentMessageId]));
    snapshot.toolEvents.forEach((tool) => {
      const messageId = childParentMessage.get(tool.threadId) || tool.messageId;
      const current = map.get(messageId) || [];
      current.push(tool);
      map.set(messageId, current);
    });
    return map;
  }, [snapshot.subagents, snapshot.toolEvents]);

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
    setComposerDraft(null);
    setReviewSession(null);
  }, [activeThread?.id]);

  useEffect(() => {
    const clearZoomToastTimers = () => {
      zoomToastTimers.current.forEach((timer) => clearTimeout(timer));
      zoomToastTimers.current = [];
    };

    const unsubscribe = window.privoraDesktop.onZoomChanged((percent) => {
      clearZoomToastTimers();
      const id = Date.now();
      setZoomToast({ id, percent, visible: true });
      zoomToastTimers.current = [
        setTimeout(() => {
          setZoomToast((current) => (current?.id === id ? { ...current, visible: false } : current));
        }, 900),
        setTimeout(() => {
          setZoomToast((current) => (current?.id === id ? null : current));
        }, 1120),
      ];
    });

    return () => {
      clearZoomToastTimers();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void window.privoraDesktop.getUpdateStatus()
      .then((status) => {
        if (mounted) setUpdateStatus(status);
      })
      .catch((error) => console.error(error));
    const unsubscribe = window.privoraDesktop.onUpdateStatusChanged(setUpdateStatus);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const saveSettings = async (settings: SaveSettingsInput) => {
    try {
      await window.privoraDesktop.saveSettings(settings);
      await refresh();
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const {
    editQueuedPrompt,
    queueExpanded,
    queuePaused,
    queuedHead,
    queuedPrompts,
    queuedRest,
    removeQueuedPrompt,
    runQueuedPrompt,
    setQueueExpanded,
    startPrompt,
    stopActiveTurn,
    stopping,
  } = usePromptQueue({
    activeThreadId: activeThread?.id || null,
    running,
    onDraft: setComposerDraft,
    startTurn: window.privoraDesktop.startTurn,
    stopTurn: window.privoraDesktop.stopTurn,
  });

  const implementPlan = useCallback((plan: string) => {
    if (!activeThread) return;
    void window.privoraDesktop.saveSettings({ collaborationMode: "default" })
      .then(refresh)
      .then(() => startPrompt(
        "Implement the proposed plan above. Keep the changes scoped to that plan and verify the result.",
      ))
      .catch((error) => {
        console.error(error);
        setComposerDraft({
          id: Date.now(),
          text: `Implement this proposed plan:\n\n${plan}`,
        });
      });
  }, [activeThread, refresh, startPrompt]);

  const suggestPlanChanges = useCallback((plan: string) => {
    setComposerDraft({
      id: Date.now(),
      text: `Suggest changes to this proposed plan before implementation:\n\n${plan}`,
    });
  }, []);

  const openReviewInIde = (messageId: string) => {
    const tools = toolsByMessage.get(messageId) || [];
    setReviewSession(buildReviewSession({
      messageId,
      title: messageId === messages[messages.length - 1]?.id ? "Last turn" : "Review",
      tools,
    }));
    setIdeCollapsed(false);
  };

  const startIdeResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = ideWidth;
    const onMove = (moveEvent: PointerEvent) => {
      const nextWidth = Math.max(420, Math.min(920, startWidth - (moveEvent.clientX - startX)));
      setIdeWidth(nextWidth);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className={sidebarCollapsed ? "app-shell sidebar-collapsed" : "app-shell"}>
      <button
        type="button"
        className="app-sidebar-toggle"
        onClick={() => setSidebarCollapsed((value) => !value)}
        title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        aria-label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
      >
        {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
      </button>
      {zoomToast && (
        <div className={zoomToast.visible ? "zoom-toast visible" : "zoom-toast"} role="status" aria-live="polite">
          Zoom {zoomToast.percent}%
        </div>
      )}
      <Sidebar
        threads={snapshot.threads}
        workspaces={snapshot.workspaces}
        activeThreadId={snapshot.activeThreadId}
        activeRunsByThread={snapshot.activeRunsByThread}
        activeWorkspace={activeWorkspace}
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
        onRemoveWorkspace={async (workspaceId) => {
          await window.privoraDesktop.removeWorkspace(workspaceId);
          await refresh();
        }}
        footer={(
          <SettingsPanel
            settings={snapshot.settings}
            updateStatus={updateStatus}
            workspaceDisabled={!activeWorkspace}
            open={settingsOpen}
            onOpen={() => setSettingsOpen(true)}
            onClose={() => setSettingsOpen(false)}
            onSave={saveSettings}
          />
        )}
      />
      <div
        className={ideCollapsed ? "main-workspace ide-collapsed" : "main-workspace"}
        style={{ "--workspace-ide-width": `${ideWidth}px` } as CSSProperties}
      >
      <ChatShell
        title={activeThread?.title || "New chat"}
        settingsOpen={settingsOpen}
        toast={toast}
        topbarTrailing={(
          <>
            <UpdateControl status={updateStatus} />
            <AppLauncher disabled={!activeWorkspace} />
          </>
        )}
        messageList={(
        <div
          className="message-list"
          ref={scrollerRef}
          onWheel={handleMessageWheel}
          onPointerDown={handleMessagePointerDown}
          onScroll={handleMessageScroll}
        >
          {messages.length === 0 && (
            <EmptyThreadState
              workspaceName={activeWorkspace?.name || null}
              workspacePath={activeWorkspace?.path || null}
              disabled={!activeThread || !activeWorkspace}
              onPrompt={(text) => {
                setComposerDraft({ id: Date.now(), text });
              }}
            />
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
                      subagents={snapshot.subagents}
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
                      onOpenReview={openReviewInIde}
                      turnUndo={undoByMessage.get(message.id) || null}
                      onPrepareTurnUndo={(messageId) => window.privoraDesktop.prepareTurnUndo({ messageId })}
                      onUndoTurnChanges={(messageId) => window.privoraDesktop.undoTurnChanges({ messageId })}
                      showPlanActions={virtualItem.index === messages.length - 1}
                      onImplementPlan={implementPlan}
                      onSuggestPlanChanges={suggestPlanChanges}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
        composerStack={(
        <>
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
              title="Continue from the last saved checkpoint"
              onClick={() => {
                void window.privoraDesktop.continueRun(activeThread.id);
              }}
            >
              <RotateCw size={14} />
              <span>Resume</span>
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
          {snapshot.pendingUserInput && (
            <RequestUserInputPanel
              request={snapshot.pendingUserInput}
              onSubmit={(answers) => window.privoraDesktop.answerRequestUserInput({
                threadId: snapshot.pendingUserInput!.threadId,
                callId: snapshot.pendingUserInput!.callId,
                answers,
              })}
            />
          )}
          <Composer
            settings={snapshot.settings}
            disabled={!activeThread || !activeWorkspace}
            inputDisabledReason={snapshot.pendingUserInput ? "Answer the question to continue" : undefined}
            running={running}
            stopping={stopping}
            activeThreadId={activeThread?.id || null}
            promptHistory={promptHistory}
            contextUsage={snapshot.contextUsage}
            draft={composerDraft}
            onDraftConsumed={() => setComposerDraft(null)}
            onSubmit={startPrompt}
            onStop={() => {
              stopActiveTurn();
            }}
            onSettings={saveSettings}
          />
        </>
        )}
        settingsLayer={(
          <SettingsScreen
            settings={snapshot.settings}
            updateStatus={updateStatus}
            workspaceDisabled={!activeWorkspace}
            open={settingsOpen}
            onOpen={() => setSettingsOpen(true)}
            onClose={() => setSettingsOpen(false)}
            onSave={saveSettings}
          />
        )}
      />
      <button
        type="button"
        className="ide-resizer"
        aria-label="Resize workspace editor"
        title="Resize workspace editor"
        onPointerDown={startIdeResize}
        disabled={ideCollapsed}
      />
      <WorkspaceIdeShell
        workspace={activeWorkspace}
        reviewSession={reviewSession}
        onReviewClosed={() => setReviewSession(null)}
        onToggleCollapsed={() => setIdeCollapsed((value) => !value)}
      />
      {ideCollapsed && (
        <button
          type="button"
          className="ide-restore-button"
          onClick={() => setIdeCollapsed(false)}
          title="Show workspace"
          aria-label="Show workspace"
        >
          <PanelRightOpen size={16} />
        </button>
      )}
      </div>
    </div>
  );
}

function UpdateControl({ status }: { status: UpdateStatus | null }) {
  const [busy, setBusy] = useState(false);
  const state = status?.state || "idle";
  const visible = state !== "unsupported" && (state !== "idle" || Boolean(status?.message));
  const active = state === "checking" || state === "downloading" || state === "installing";
  const ready = state === "ready";
  const label = (() => {
    if (state === "checking") return "Checking";
    if (state === "downloading") return "Downloading";
    if (state === "ready") return "Restart to update";
    if (state === "installing") return "Installing";
    if (state === "error") return "Update failed";
    return "Check updates";
  })();

  if (!status?.supported && !status?.message) return null;

  const check = async () => {
    setBusy(true);
    try {
      await window.privoraDesktop.checkForUpdates();
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    setBusy(true);
    try {
      await window.privoraDesktop.installUpdate();
    } finally {
      setBusy(false);
    }
  };

  if (!visible && status?.supported) {
    return (
      <button type="button" className="update-icon-button" title="Check for updates" onClick={check} disabled={busy}>
        <Download size={16} />
      </button>
    );
  }

  return (
    <button
      type="button"
      className={clsx("update-pill", ready && "ready", state === "error" && "error")}
      title={status?.error || status?.message || label}
      onClick={ready ? install : check}
      disabled={busy || active}
    >
      {active ? <RotateCw size={15} className="spin" /> : <Download size={15} />}
      <span>{label}</span>
    </button>
  );
}

function EmptyThreadState({
  workspaceName,
  workspacePath,
  disabled,
  onPrompt,
}: {
  workspaceName: string | null;
  workspacePath: string | null;
  disabled: boolean;
  onPrompt: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const promptCards = [
    {
      icon: <FileSearch size={17} />,
      title: "Inspect",
      prompt: "Inspect this workspace and tell me the architecture, main entry points, and the safest first improvements.",
    },
    {
      icon: <Bug size={17} />,
      title: "Find risks",
      prompt: "Review this codebase for bugs, risky behavior, and missing tests. Prioritize findings by severity with file references.",
    },
    {
      icon: <Terminal size={17} />,
      title: "Run checks",
      prompt: "Find the project diagnostics, run the safest relevant checks, and summarize failures with exact next fixes.",
    },
    {
      icon: <GitBranch size={17} />,
      title: "Review changes",
      prompt: "Check the current git changes, explain what changed, and flag anything unsafe before commit.",
    },
  ];
  const morePromptGroups = [
    {
      title: "Build",
      cards: [
        {
          icon: <Wand2 size={16} />,
          title: "Improve UI",
          prompt: "Inspect the current UI and make one focused quality-of-life improvement with polished styling and verification.",
        },
        {
          icon: <Recycle size={16} />,
          title: "Refactor safely",
          prompt: "Find a small high-value refactor in this workspace, make it safely, and verify behavior did not change.",
        },
        {
          icon: <Layers size={16} />,
          title: "Map architecture",
          prompt: "Map the important modules, ownership boundaries, data flow, and highest-risk coupling in this workspace.",
        },
      ],
    },
    {
      title: "Quality",
      cards: [
        {
          icon: <PackageCheck size={16} />,
          title: "Add tests",
          prompt: "Find an important untested path, add focused tests, and run the relevant test command.",
        },
        {
          icon: <Bug size={16} />,
          title: "Fix flaky area",
          prompt: "Look for fragile or flaky code paths and fix the highest-confidence issue with minimal scope.",
        },
        {
          icon: <ListChecks size={16} />,
          title: "Smoke test",
          prompt: "Create and run a safe smoke test plan for the current workspace. Do not change unrelated files.",
        },
        {
          icon: <ShieldAlert size={16} />,
          title: "Security pass",
          prompt: "Review the workspace for security and data-loss risks. Fix only clear, local issues and report the rest.",
        },
      ],
    },
    {
      title: "Ship",
      cards: [
        {
          icon: <BookOpen size={16} />,
          title: "Update docs",
          prompt: "Review docs or README gaps for this workspace and make the smallest useful update.",
        },
        {
          icon: <GitBranch size={16} />,
          title: "Prepare commit",
          prompt: "Review git status and diffs, group changes into sensible commits, and suggest commit messages.",
        },
        {
          icon: <Terminal size={16} />,
          title: "Release check",
          prompt: "Run the safest release-readiness checks available in this workspace and summarize what blocks shipping.",
        },
      ],
    },
    {
      title: "Maintain",
      cards: [
        {
          icon: <FileSearch size={16} />,
          title: "Find TODOs",
          prompt: "Find TODO/FIXME/hack comments, group them by risk, and suggest the best next cleanup.",
        },
        {
          icon: <Recycle size={16} />,
          title: "Reduce noise",
          prompt: "Find noisy UI text, duplicated status output, or confusing labels and improve one focused area.",
        },
        {
          icon: <PackageCheck size={16} />,
          title: "Dependency check",
          prompt: "Inspect dependency and script setup for outdated or risky patterns. Report safe upgrades separately from risky ones.",
        },
      ],
    },
  ];

  return (
    <div className="empty-state">
      <div className="empty-state-header">
        <span className="empty-state-kicker">
          {workspaceName ? workspaceName : "No project selected"}
        </span>
        <h2>{workspaceName ? "What should Privora do first?" : "Open a project to start."}</h2>
        {workspacePath && <p>{workspacePath}</p>}
      </div>

      <div className="empty-prompt-grid">
        {promptCards.map((card) => (
          <button
            type="button"
            key={card.title}
            disabled={disabled}
            onClick={() => onPrompt(card.prompt)}
          >
            {card.icon}
            <span>{card.title}</span>
          </button>
        ))}
      </div>

      <div className="empty-more">
        <button
          type="button"
          className="empty-more-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <span>{expanded ? "Fewer starters" : "More starters"}</span>
          <ChevronDown size={14} />
        </button>
        {expanded && (
          <div className="empty-more-grid">
            {morePromptGroups.map((group) => (
              <section key={group.title}>
                <h3>{group.title}</h3>
                <div className="empty-more-list">
                  {group.cards.map((card) => (
                    <button
                      type="button"
                      key={card.title}
                      disabled={disabled}
                      onClick={() => onPrompt(card.prompt)}
                    >
                      {card.icon}
                      <span>{card.title}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RequestUserInputPanel({
  request,
  onSubmit,
}: {
  request: RequestUserInputRequestRecord;
  onSubmit: (answers: Record<string, { answers: string[] }>) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.questions.map((question) => [question.id, question.options[0]?.label || ""])),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const question = request.questions[Math.min(index, request.questions.length - 1)];
  const isFirst = index === 0;
  const isLast = index === request.questions.length - 1;

  useEffect(() => {
    setSelected(Object.fromEntries(request.questions.map((question) => [question.id, question.options[0]?.label || ""])));
    setNotes({});
    setIndex(0);
    setSubmitting(false);
  }, [request.callId, request.questions]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    const answers = Object.fromEntries(request.questions.map((question) => {
      const values = [selected[question.id]].filter(Boolean);
      const note = notes[question.id]?.trim();
      if (note) values.push(`user_note: ${note}`);
      return [question.id, { answers: values }];
    }));
    await onSubmit(answers);
  };

  if (!question) return null;

  return (
    <section className="request-user-input-panel" aria-label="Plan question">
      <div className="request-user-input-header">
        <div>
          <MessageSquareMore size={15} />
          <span>{request.questions.length === 1 ? "Question" : `Question ${index + 1}/${request.questions.length}`}</span>
        </div>
        {request.questions.length > 1 && (
          <div className="request-user-input-nav" aria-label="Question navigation">
            <button
              type="button"
              title="Previous question"
              disabled={isFirst}
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              title="Next question"
              disabled={isLast}
              onClick={() => setIndex((current) => Math.min(request.questions.length - 1, current + 1))}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
      <div className="request-user-input-question" key={question.id}>
        <small>{question.header}</small>
        <p>{question.question}</p>
        <div className="request-user-input-options">
          {question.options.map((option) => (
            <button
              type="button"
              key={option.label}
              className={selected[question.id] === option.label ? "active" : undefined}
              onClick={() => setSelected((current) => ({ ...current, [question.id]: option.label }))}
            >
              <span>{option.label}</span>
              <small>{option.description}</small>
            </button>
          ))}
        </div>
        {question.isOther && (
          <input
            value={notes[question.id] || ""}
            onChange={(event) => setNotes((current) => ({ ...current, [question.id]: event.target.value }))}
            placeholder="Optional note"
          />
        )}
      </div>
      <div className="request-user-input-actions">
        {request.questions.length > 1 && (
          <button
            type="button"
            className="secondary"
            disabled={isFirst}
            onClick={() => setIndex((current) => Math.max(0, current - 1))}
          >
            Back
          </button>
        )}
        {!isLast ? (
          <button type="button" onClick={() => setIndex((current) => Math.min(request.questions.length - 1, current + 1))}>
            Next
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={submitting}>
            Continue
          </button>
        )}
      </div>
    </section>
  );
}

const EMPTY_TOOLS: [] = [];
