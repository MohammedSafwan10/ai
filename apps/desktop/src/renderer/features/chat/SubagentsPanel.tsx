import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowLeft, Bot, PanelRightClose, Square } from "lucide-react";
import type { ActiveRunState, AppSnapshot, ChatMessageRecord, PrivoraEventEnvelope, PrivoraEventPayload, SubagentRecord, ThreadHistoryPage, ToolEventRecord } from "../../../shared/types";
import { ChatMessage } from "../../components/ChatMessage";
import { AgentAvatar } from "../../components/AgentAvatar";
import { agentDisplayTime, agentListTime, relativeAgentTime, sortAgentRows } from "./agentIdentity";
import { RequestUserInputPanel } from "../../components/RequestUserInputPanel";
import { isActiveTurnStatus } from "../../../shared/runStatus";
import "./subagents.css";
import { groupInlineMessages } from "./inlineMessages";
import { getDesktopSync, withDeadline } from "../../state/desktopSync";
import { compactLiveOutput } from "../../state/liveOutput";
import { retainRecentHistory } from "../../state/historyRetention";
import { mergeUniqueByFreshness } from "../../state/useDesktopState";
import { adjustForHiddenRow, useReadingAnchor } from "./scrollAnchoring";

const name = (agent: SubagentRecord) => agent.agentNickname || agent.taskName;
const upsert = <T extends { id: string }>(items: T[], item: T) => {
  const next = items.filter((old) => old.id !== item.id);
  return [...next, item];
};
export type AgentTranscript = { runtimeId?: string; page: ThreadHistoryPage; run: ActiveRunState | null; sequence: number; pendingInput?: import("../../../shared/types").RequestUserInputRequestRecord | null };
const withTranscriptRun = (current: AgentTranscript, run: ActiveRunState | null): AgentTranscript => {
  const previous = current.run;
  if (previous === run || (previous && run && Object.keys({ ...previous, ...run }).every((key) => previous[key as keyof ActiveRunState] === run[key as keyof ActiveRunState]))) return current;
  return { ...current, run };
};
export function applyAgentEvent(current: AgentTranscript, threadId: string, event: PrivoraEventEnvelope) {
  if (event.sequence <= current.sequence) return current;
  const next = reduceAgentTranscript(current, threadId, event.payload);
  return next === current ? current : { ...next, sequence: event.sequence };
}
export function reduceAgentTranscript(current: AgentTranscript, threadId: string, event: PrivoraEventPayload): AgentTranscript {
  if (event.type === "snapshot.updated") {
    const run = event.snapshot.activeRuns.find((item) => item.threadId === threadId) || null;
    const agent = event.snapshot.subagents.find((item) => item.threadId === threadId);
    if (run) return withTranscriptRun(current, isActiveTurnStatus(run.status) ? run : null);
    // Snapshots omit some recovered approval runs. Absence alone is not a stop.
    if (agent && ["stopped", "completed", "closed", "failed"].includes(agent.status) && agent.updatedAt >= (current.run?.updatedAt || 0)) return withTranscriptRun(current, null);
    return current;
  }
  if (event.type === "user_input.requested" && event.request.threadId === threadId) return { ...current, pendingInput: event.request };
  if (event.type === "user_input.resolved" && event.threadId === threadId && current.pendingInput?.callId === event.callId) return { ...current, pendingInput: null };
  if (event.type === "message.upserted" && event.message.threadId === threadId) return { ...current,
    run: current.run?.assistantMessageId === event.message.id && !isActiveTurnStatus(event.message.status) ? null : current.run,
    page: { ...current.page, messages: upsert(current.page.messages, event.message).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)) } };
  if (event.type === "tool.upserted" && event.tool.threadId === threadId) return { ...current, page: { ...current.page, toolEvents: upsert(current.page.toolEvents, event.tool) } };
  if (event.type === "turn.status_changed" && event.threadId === threadId) return { ...current, run: event.run };
  if ((event.type === "turn.completed" || event.type === "turn.failed" || event.type === "turn.stopped") && event.threadId === threadId) {
    const next = event.message ? reduceAgentTranscript(current, threadId, { type: "message.upserted", message: event.message }) : current;
    return { ...next, run: next.run?.assistantMessageId === event.turnId ? null : next.run, pendingInput: next.pendingInput?.assistantMessageId === event.turnId ? null : next.pendingInput };
  }
  if (event.type === "tool.output_delta") {
    const tool = current.page.toolEvents.find((item) => item.callId === event.callId);
    if (tool) return { ...current, page: { ...current.page, toolEvents: upsert(current.page.toolEvents, { ...tool, output: compactLiveOutput(`${tool.output || ""}${event.delta}`), updatedAt: Date.now() }) } };
  }
  return current;
}

export function SubagentsPanel({ parentThreadId, snapshot, onClose, request, hidden = false }: { parentThreadId: string; snapshot: AppSnapshot; onClose: () => void; request?: { threadId: string; key: number } | null; hidden?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<AgentTranscript | null>(null);
  const [error, setError] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [stoppingThreads, setStoppingThreads] = useState<Set<string>>(() => new Set());
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [showJump, setShowJump] = useState(false);
  const [listOffset, setListOffset] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const historyGeneration = useRef(0);
  const recoveryGeneration = useRef(0);
  useEffect(() => { if (hidden) return; setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, [hidden]);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const agents = snapshot.subagents;
  const agent = agents.find((item) => item.threadId === selected);
  const activityAt = transcript?.page.threadId === selected ? transcript.page.toolEvents.reduce((latest, tool) => Math.max(latest, tool.updatedAt),
    transcript.page.messages.reduce((latest, message) => Math.max(latest, message.updatedAt), transcript.run?.updatedAt || 0)) : 0;
  const displayTime = agent ? agentDisplayTime(agent, activityAt) : null;
  useEffect(() => { setSelected(null); }, [parentThreadId]);
  useEffect(() => { if (request && agents.some((item) => item.threadId === request.threadId)) setSelected(request.threadId); }, [request]);
  useEffect(() => {
    const generation = ++historyGeneration.current;
    setTranscript(null); setError(""); setLoadingOlder(false); setShowJump(false); stick.current = true;
    if (!selected || hidden) return;
    let disposed = false;
    let ready = false;
    const buffered: PrivoraEventEnvelope[] = [];
    let requestVersion = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const load = (runtimeId?: string) => {
      clearTimeout(retryTimer);
      recoveryGeneration.current++; setLoadingOlder(false);
      const version = ++requestVersion;
      ready = false; buffered.length = 0;
      void withDeadline(window.privoraDesktop.getSubagentHistory({ parentThreadId, threadId: selected })).then((initial) => {
        if (disposed || version !== requestVersion || generation !== historyGeneration.current) return;
        if (runtimeId && initial.runtimeId !== runtimeId) { void getDesktopSync().recover(); return; }
        setError(""); attempts = 0;
        const replay = buffered.splice(0);
        setTranscript((current) => {
          // Keep explicitly loaded older pages, but replace the live tail and runtime state.
          const older = current?.page.threadId === selected && initial.page.hasOlder
            ? current.page.messages.filter((message) => message.createdAt < (initial.page.messages[0]?.createdAt || 0)) : [];
          const olderIds = new Set(older.map((message) => message.id));
          const base = older.length && current ? { ...initial, page: { ...current.page, messages: [...older, ...initial.page.messages], toolEvents: [...current.page.toolEvents.filter((tool) => olderIds.has(tool.messageId)), ...initial.page.toolEvents], turnUndos: [...current.page.turnUndos.filter((undo) => olderIds.has(undo.messageId)), ...initial.page.turnUndos] } } : initial;
          const next = replay.reduce<AgentTranscript>((value, event) => applyAgentEvent(value, selected, event), base);
          return stick.current ? retainAgentTranscript(next) : next;
        });
        ready = true;
      }).catch((reason: unknown) => {
        if (disposed || version !== requestVersion) return;
        setError(reason instanceof Error ? reason.message : String(reason));
        if (attempts < 3) retryTimer = setTimeout(() => load(runtimeId), 1000 * 2 ** attempts++);
      });
    };
    const unsubscribe = getDesktopSync().subscribe((update) => {
      if (disposed) return;
      if (update.type === "status") {
        if (update.status !== "connected") { ready = false; requestVersion++; recoveryGeneration.current++; setLoadingOlder(false); buffered.length = 0; clearTimeout(retryTimer); }
        return;
      }
      if (update.type === "snapshot") { load(update.value.runtimeId); return; }
      const event = update.event;
      const payload = event.payload;
      const relevant = payload.type === "snapshot.updated" || (payload.type === "message.upserted" ? payload.message.threadId === selected
        : payload.type === "tool.upserted" ? payload.tool.threadId === selected
        : payload.type === "user_input.requested" ? payload.request.threadId === selected
        : payload.type === "tool.output_delta" || ("threadId" in payload && payload.threadId === selected));
      if (!relevant) return;
      if (!ready) {
        // A stalled history request must not retain a growing stream of updates.
        if (buffered.length >= 128) {
          buffered.length = 0; requestVersion++; void getDesktopSync().recover();
          return;
        }
        buffered.push(event); return;
      }
      setTranscript((current) => {
        if (!current) return current;
        const updated = applyAgentEvent(current, selected, event);
        return stick.current ? retainAgentTranscript(updated) : updated;
      });
    });
    load();
    return () => { disposed = true; clearTimeout(retryTimer); buffered.length = 0; unsubscribe(); };
  }, [parentThreadId, selected, reload, hidden]);
  const status = (item: SubagentRecord) => snapshot.activeRuns.find((run) => run.threadId === item.threadId)?.status || item.status;
  const live = (item: SubagentRecord) => isActiveTurnStatus(status(item)) || ["pending", "waiting"].includes(status(item));
  const groups = [
    { title: "Active", active: true, rows: agents.filter(live) },
    { title: "Finished", active: false, rows: agents.filter((item) => !live(item) && ["completed", "closed"].includes(item.status)) },
    { title: "Needs attention", active: false, rows: agents.filter((item) => !live(item) && !["completed", "closed"].includes(item.status)) },
  ];
  const inlineMessages = useMemo(() => transcript ? groupInlineMessages(transcript.page.messages, transcript.page.toolEvents) : null, [transcript?.page.messages, transcript?.page.toolEvents]);
  const messages = inlineMessages?.roots || [];
  const readingAnchor = useReadingAnchor(scroller, messages[0]?.id);
  const toolsByMessage = useMemo(() => {
    const grouped = new Map<string, ToolEventRecord[]>();
    for (const tool of transcript?.page.toolEvents || []) {
      const items = grouped.get(tool.messageId) || []; items.push(tool); grouped.set(tool.messageId, items);
    }
    return grouped;
  }, [transcript?.page.toolEvents]);
  const virtualizer = useVirtualizer({
    count: messages.length, getScrollElement: () => scroller.current,
    estimateSize: () => 190, overscan: 6, getItemKey: (index) => messages[index]?.id || index,
    anchorTo: "end", followOnAppend: false, scrollEndThreshold: stick.current ? 80 : -1, scrollMargin: listOffset,
    enabled: !hidden && Boolean(transcript),
  });
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = adjustForHiddenRow;
  useLayoutEffect(() => {
    setListOffset(list.current?.offsetTop || 0);
  }, [selected, transcript?.page.hasOlder, loadingOlder, error, hidden]);
  const totalSize = virtualizer.getTotalSize();
  useLayoutEffect(() => {
    if (hidden || !messages.length) return;
    const frame = requestAnimationFrame(() => {
      const element = scroller.current;
      if (!element) return;
      if (stick.current) {
        virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
        element.scrollTop = element.scrollHeight;
      }
      const distance = Math.max(0, element.scrollHeight - element.scrollTop - element.clientHeight);
      setShowJump(distance > 96);
      if (distance <= 1) stick.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [transcript, messages.length, totalSize, hidden]);
  const approve = (callId: string, approved: boolean) => {
    if (!selected) return;
    void window.privoraDesktop.decideApproval({ threadId: selected, callId, approved, scope: "once" }).catch((reason: unknown) => setError(String(reason)));
  };
  const stopSelectedAgent = async () => {
    if (!selected || stoppingThreads.has(selected)) return;
    const threadId = selected;
    setStoppingThreads((current) => new Set(current).add(threadId));
    try { await window.privoraDesktop.stopTurn(threadId); }
    catch (reason) { setError(String(reason)); }
    finally { setStoppingThreads((current) => { const next = new Set(current); next.delete(threadId); return next; }); }
  };
  const older = async () => {
    if (!selected || !transcript?.page.beforeCursor || loadingOlder) return;
    const generation = historyGeneration.current;
    const recovery = recoveryGeneration.current;
    stick.current = false;
    readingAnchor.capture();
    setLoadingOlder(true);
    try {
      const previous = await window.privoraDesktop.getSubagentHistory({ parentThreadId, threadId: selected, before: transcript.page.beforeCursor });
      if (generation !== historyGeneration.current || recovery !== recoveryGeneration.current) return;
      if (transcript.runtimeId && previous.runtimeId !== transcript.runtimeId) { void getDesktopSync().recover(); return; }
      setTranscript((current) => !current || generation !== historyGeneration.current || recovery !== recoveryGeneration.current || current.page.threadId !== previous.page.threadId ? current : { ...current, page: { ...current.page, ...previous.page,
        messages: mergeUniqueByFreshness(previous.page.messages, current.page.messages), toolEvents: mergeUniqueByFreshness(previous.page.toolEvents, current.page.toolEvents), turnUndos: [] } });
    } catch (reason) { if (generation === historyGeneration.current && recovery === recoveryGeneration.current) setError(String(reason)); }
    finally { if (generation === historyGeneration.current && recovery === recoveryGeneration.current) setLoadingOlder(false); }
  };
  return <aside className="workspace-ide subagents-pane" aria-label="Subagents" style={hidden ? { display: "none" } : undefined}>
    <header className="workspace-ide-topbar">
      {selected ? <button className="workspace-icon-button" onClick={() => setSelected(null)} aria-label="Back to subagents"><ArrowLeft size={16} /></button> : <Bot size={16} />}
      {agent && <AgentAvatar id={agent.threadId} small />}<strong>{agent ? name(agent) : "Subagents"}</strong>
      <div className="workspace-ide-mode-spacer" />
      {transcript?.run && isActiveTurnStatus(transcript.run.status) && transcript.run.status !== "draining" && selected && <button type="button" className="send-button agent-stop-button" onClick={() => void stopSelectedAgent()} disabled={stoppingThreads.has(selected)} title={stoppingThreads.has(selected) ? "Stopping" : "Stop"} aria-label={stoppingThreads.has(selected) ? "Stopping this agent" : "Stop this agent"} aria-busy={stoppingThreads.has(selected)}><Square size={12} fill="currentColor" /></button>}
      <button className="workspace-icon-button" onClick={onClose} aria-label="Close subagents panel"><PanelRightClose size={16} /></button>
    </header>
    {agent && displayTime && <div className="agent-panel-meta"><div><span className={`agent-state ${live(agent) ? "live" : agent.status}`}>{status(agent).replace(/_/g, " ")}</span> · {agent.model} · {agent.reasoningEffort}</div><div className="agent-panel-times">Created <time dateTime={new Date(agent.createdAt).toISOString()} title={new Date(agent.createdAt).toLocaleString()}>{relativeAgentTime(agent.createdAt, now)}</time> · {displayTime.label} <time dateTime={new Date(displayTime.timestamp).toISOString()} title={new Date(displayTime.timestamp).toLocaleString()}>{relativeAgentTime(displayTime.timestamp, now)}</time></div><details className="agent-panel-task" key={agent.threadId}><summary>View task</summary><p>{agent.prompt}</p></details></div>}
    <div className="agent-panel-scroll" ref={scroller} onPointerDown={() => readingAnchor.release()} onWheel={(event) => { readingAnchor.release(); if (event.deltaY < 0) { stick.current = false; virtualizer.setOptions({ ...virtualizer.options, scrollEndThreshold: -1 }); } }} onScroll={() => {
      const el = scroller.current;
      if (!el || !transcript) return;
      const wasFollowing = stick.current;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stick.current = distance <= 1;
      virtualizer.setOptions({ ...virtualizer.options, scrollEndThreshold: stick.current ? 80 : -1 });
      setShowJump(distance > 96);
      if (!wasFollowing && stick.current) setTranscript((current) => current ? retainAgentTranscript(current) : current);
    }}>
      {error && <div className={selected ? "agent-transcript-notice" : undefined} role="alert">{error}<button onClick={() => setReload((value) => value + 1)}>Retry</button></div>}
      {!selected && groups.map((group) => <section key={group.title} className="agent-group"><h3>{group.title}<span>{group.rows.length}</span></h3>
        {!group.rows.length && <p>No {group.title.toLowerCase()} subagents</p>}
        {sortAgentRows(group.rows, group.active).map((item) => {
          const time = agentListTime(item, group.active);
          return <button className="agent-row" key={item.id} title={name(item)} onClick={() => setSelected(item.threadId)}>
          <AgentAvatar id={item.threadId} /><span className="agent-row-body"><strong>{name(item)}</strong><span className="agent-row-subtitle"><span className={`agent-state ${live(item) ? "live" : item.status}`}>{status(item).replace(/_/g, " ")}</span>{item.agentRole && <span> · {item.agentRole}</span>}</span></span><time className="agent-row-time" dateTime={new Date(time.timestamp).toISOString()} title={`${time.label} ${new Date(time.timestamp).toLocaleString()}`}>{relativeAgentTime(time.timestamp, now)}</time>
        </button>;
        })}
      </section>)}
      {selected && !transcript && !error && <p className="agent-transcript-notice" role="status">Loading agent chat…</p>}
      {transcript?.page.hasOlder && <button className="history-load-control" onClick={() => void older()} disabled={loadingOlder}>{loadingOlder ? "Loading…" : "Load earlier messages"}</button>}
      {transcript && <div ref={list} className="agent-virtual-spacer" style={{ height: totalSize }}>
      {virtualizer.getVirtualItems().map((item) => {
        const message: ChatMessageRecord = messages[item.index];
        if (!message) return null;
        return <div key={message.id} className="agent-virtual-row" data-message-id={message.id} data-index={item.index} ref={virtualizer.measureElement} style={{ transform: `translateY(${item.start - listOffset}px)` }}><ChatMessage
        message={message} inlineSteers={inlineMessages?.inlineByTurn.get(message.id)} coordinationDetails
        tools={toolsByMessage.get(message.id) || []} subagents={agents} onOpenSubagent={setSelected}
        activeRunStatus={transcript.run?.assistantMessageId === message.id ? transcript.run.status : null}
        activeRunReason={transcript.run?.assistantMessageId === message.id ? transcript.run.reason : null}
        onApprove={approve} onApproveAll={(ids) => ids.forEach((id) => approve(id, true))}
        onOpenReview={() => {}} turnUndo={null} onPrepareTurnUndo={async () => null} onUndoTurnChanges={async () => null} readOnly /></div>;
      })}</div>}
      {transcript?.pendingInput && <RequestUserInputPanel request={transcript.pendingInput} onSubmit={(answers) => window.privoraDesktop.answerRequestUserInput({ threadId: transcript.pendingInput!.threadId, callId: transcript.pendingInput!.callId, answers })} />}
    </div>
    {selected && showJump && <button type="button" className="agent-jump-latest" aria-label="Jump to latest agent message" onClick={() => {
      readingAnchor.release();
      stick.current = true; setShowJump(false);
      setTranscript((current) => current ? retainAgentTranscript(current) : current);
      virtualizer.scrollToIndex(Math.max(0, messages.length - 1), { align: "end" });
    }}><ArrowDown size={15} /> Latest</button>}
  </aside>;
}

export function retainAgentTranscript(transcript: AgentTranscript): AgentTranscript {
  const page = retainRecentHistory(transcript.page, [transcript.run?.assistantMessageId || "", transcript.pendingInput?.assistantMessageId || ""]);
  return page === transcript.page ? transcript : { ...transcript, page };
}
