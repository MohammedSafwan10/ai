import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Bot, PanelRightClose, Square } from "lucide-react";
import type { ActiveRunState, AppSnapshot, ChatMessageRecord, PrivoraEventEnvelope, PrivoraEventPayload, SubagentRecord, ThreadHistoryPage, ToolEventRecord } from "../../../shared/types";
import { ChatMessage } from "../../components/ChatMessage";
import { AgentAvatar } from "../../components/AgentAvatar";
import { agentDisplayTime, relativeAgentTime } from "./agentIdentity";
import { RequestUserInputPanel } from "../../components/RequestUserInputPanel";
import { isActiveTurnStatus } from "../../../shared/runStatus";
import "./subagents.css";
import { groupInlineMessages } from "./inlineMessages";
import { compactLiveOutput } from "../../state/liveOutput";

const name = (agent: SubagentRecord) => agent.agentNickname || agent.taskName;
const upsert = <T extends { id: string }>(items: T[], item: T) => {
  const next = items.filter((old) => old.id !== item.id);
  return [...next, item];
};
export type AgentTranscript = { page: ThreadHistoryPage; run: ActiveRunState | null; sequence: number; pendingInput?: import("../../../shared/types").RequestUserInputRequestRecord | null };
export function applyAgentEvent(current: AgentTranscript, threadId: string, event: PrivoraEventEnvelope) {
  if (event.sequence <= current.sequence) return current;
  const next = reduceAgentTranscript(current, threadId, event.payload);
  return next === current ? current : { ...next, sequence: event.sequence };
}
export function reduceAgentTranscript(current: AgentTranscript, threadId: string, event: PrivoraEventPayload): AgentTranscript {
  if (event.type === "user_input.requested" && event.request.threadId === threadId) return { ...current, pendingInput: event.request };
  if (event.type === "user_input.resolved" && event.threadId === threadId && current.pendingInput?.callId === event.callId) return { ...current, pendingInput: null };
  if (event.type === "message.upserted" && event.message.threadId === threadId) return { ...current, page: { ...current.page, messages: upsert(current.page.messages, event.message).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)) } };
  if (event.type === "tool.upserted" && event.tool.threadId === threadId) return { ...current, page: { ...current.page, toolEvents: upsert(current.page.toolEvents, event.tool) } };
  if (event.type === "turn.status_changed" && event.threadId === threadId) return { ...current, run: event.run };
  if ((event.type === "turn.completed" || event.type === "turn.failed" || event.type === "turn.stopped") && event.threadId === threadId) {
    const next = event.message ? reduceAgentTranscript(current, threadId, { type: "message.upserted", message: event.message }) : current;
    return { ...next, run: next.run?.assistantMessageId === event.turnId ? null : next.run, pendingInput: next.pendingInput?.assistantMessageId === event.turnId ? null : next.pendingInput };
  }
  if (event.type === "tool.output_delta") {
    const tool = current.page.toolEvents.find((item) => item.callId === event.callId);
    if (tool) return { ...current, page: { ...current.page, toolEvents: upsert(current.page.toolEvents, { ...tool, output: compactLiveOutput(`${tool.output || ""}${event.delta}`) }) } };
  }
  return current;
}

export function SubagentsPanel({ parentThreadId, snapshot, onClose, request, hidden = false }: { parentThreadId: string; snapshot: AppSnapshot; onClose: () => void; request?: { threadId: string; key: number } | null; hidden?: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<AgentTranscript | null>(null);
  const [error, setError] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { if (hidden) return; setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, [hidden]);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const agents = snapshot.subagents;
  const agent = agents.find((item) => item.threadId === selected);
  useEffect(() => { setSelected(null); }, [parentThreadId]);
  useEffect(() => { if (request && agents.some((item) => item.threadId === request.threadId)) setSelected(request.threadId); }, [request]);
  useEffect(() => {
    setTranscript(null); setError(""); stick.current = true;
    if (!selected || hidden) return;
    let disposed = false;
    let ready = false;
    const buffered: PrivoraEventEnvelope[] = [];
    const unsubscribe = window.privoraDesktop.onPrivoraEvent((event) => {
      if (disposed) return;
      const payload = event.payload;
      const relevant = payload.type === "message.upserted" ? payload.message.threadId === selected
        : payload.type === "tool.upserted" ? payload.tool.threadId === selected
        : payload.type === "user_input.requested" ? payload.request.threadId === selected
        : payload.type === "tool.output_delta" || ("threadId" in payload && payload.threadId === selected);
      if (!relevant) return;
      if (!ready) {
        // A stalled history request must not retain a growing stream of updates.
        if (buffered.length >= 128) {
          buffered.length = 0; disposed = true; unsubscribe();
          setError("Agent history could not keep up with live updates. Retry to reload saved history; running work is unaffected.");
          return;
        }
        buffered.push(event); return;
      }
      setTranscript((current) => current ? applyAgentEvent(current, selected, event) : current);
    });
    void window.privoraDesktop.getSubagentHistory({ parentThreadId, threadId: selected }).then((initial) => {
      if (disposed) return;
      setTranscript(buffered.reduce<AgentTranscript>((current, event) => applyAgentEvent(current, selected, event), initial));
      buffered.length = 0;
      ready = true;
    }).catch((reason: unknown) => { buffered.length = 0; unsubscribe(); if (!disposed) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { disposed = true; buffered.length = 0; unsubscribe(); };
  }, [parentThreadId, selected, reload, hidden]);
  useEffect(() => {
    if (stick.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [transcript]);
  const status = (item: SubagentRecord) => snapshot.activeRuns.find((run) => run.threadId === item.threadId)?.status || item.status;
  const live = (item: SubagentRecord) => isActiveTurnStatus(status(item)) || ["pending", "waiting"].includes(status(item));
  const groups = [
    { title: "Active", rows: agents.filter(live) },
    { title: "Finished", rows: agents.filter((item) => !live(item) && ["completed", "closed"].includes(item.status)) },
    { title: "Needs attention", rows: agents.filter((item) => !live(item) && !["completed", "closed"].includes(item.status)) },
  ];
  const inlineMessages = transcript ? groupInlineMessages(transcript.page.messages, transcript.page.toolEvents) : null;
  const approve = (callId: string, approved: boolean) => {
    if (!selected) return;
    void window.privoraDesktop.decideApproval({ threadId: selected, callId, approved, scope: "once" }).catch((reason: unknown) => setError(String(reason)));
  };
  const older = async () => {
    if (!selected || !transcript?.page.beforeCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const previous = await window.privoraDesktop.getSubagentHistory({ parentThreadId, threadId: selected, before: transcript.page.beforeCursor });
      setTranscript((current) => !current || current.page.threadId !== previous.page.threadId ? current : { ...current, page: { ...previous.page,
        messages: [...previous.page.messages, ...current.page.messages], toolEvents: [...new Map([...previous.page.toolEvents, ...current.page.toolEvents].map((tool) => [tool.id, tool])).values()] } });
    } catch (reason) { setError(String(reason)); }
    finally { setLoadingOlder(false); }
  };
  return <aside className="workspace-ide subagents-pane" aria-label="Subagents" style={hidden ? { display: "none" } : undefined}>
    <header className="workspace-ide-topbar">
      {selected ? <button className="workspace-icon-button" onClick={() => setSelected(null)} aria-label="Back to subagents"><ArrowLeft size={16} /></button> : <Bot size={16} />}
      {agent && <AgentAvatar id={agent.threadId} small />}<strong>{agent ? name(agent) : "Subagents"}</strong>
      <div className="workspace-ide-mode-spacer" />
      {transcript?.run && selected && <button className="workspace-icon-button" onClick={() => { void window.privoraDesktop.stopTurn(selected).catch((reason: unknown) => setError(String(reason))); }} aria-label="Stop this agent"><Square size={14} /></button>}
      <button className="workspace-icon-button" onClick={onClose} aria-label="Close subagents panel"><PanelRightClose size={16} /></button>
    </header>
    {agent && <div className="agent-panel-meta"><div><span className={`agent-state ${live(agent) ? "live" : agent.status}`}>{status(agent).replace(/_/g, " ")}</span> · {agent.model} · {agent.reasoningEffort}</div><div className="agent-panel-times">Created <time dateTime={new Date(agent.createdAt).toISOString()} title={new Date(agent.createdAt).toLocaleString()}>{relativeAgentTime(agent.createdAt, now)}</time> · {agentDisplayTime(agent).label} <time dateTime={new Date(agentDisplayTime(agent).timestamp).toISOString()} title={new Date(agentDisplayTime(agent).timestamp).toLocaleString()}>{relativeAgentTime(agentDisplayTime(agent).timestamp, now)}</time></div><details className="agent-panel-task" key={agent.threadId}><summary>View task</summary><p>{agent.prompt}</p></details></div>}
    <div className="agent-panel-scroll" ref={scroller} onScroll={() => { const el = scroller.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
      {error && <div role="alert">{error}<button onClick={() => setReload((value) => value + 1)}>Retry</button></div>}
      {!selected && groups.map((group) => <section key={group.title} className="agent-group"><h3>{group.title}<span>{group.rows.length}</span></h3>
        {!group.rows.length && <p>No {group.title.toLowerCase()} subagents</p>}
        {[...group.rows].sort((a, b) => agentDisplayTime(b).timestamp - agentDisplayTime(a).timestamp || a.id.localeCompare(b.id)).map((item) => <button className="agent-row" key={item.id} title={item.lastPreview || item.prompt} onClick={() => setSelected(item.threadId)}>
          <AgentAvatar id={item.threadId} /><span className="agent-row-body"><strong>{name(item)}</strong><span className="agent-row-subtitle"><span className={`agent-state ${live(item) ? "live" : item.status}`}>{status(item).replace(/_/g, " ")}</span>{item.agentRole && <span> · {item.agentRole}</span>}</span>{live(item) && <span className="agent-row-preview">{item.lastPreview || item.prompt}</span>}</span><time className="agent-row-time" dateTime={new Date(agentDisplayTime(item).timestamp).toISOString()} title={`${agentDisplayTime(item).label} ${new Date(agentDisplayTime(item).timestamp).toLocaleString()}`}>{relativeAgentTime(agentDisplayTime(item).timestamp, now)}</time>
        </button>)}
      </section>)}
      {selected && !transcript && !error && <p role="status">Loading agent chat…</p>}
      {transcript?.page.hasOlder && <button onClick={() => void older()} disabled={loadingOlder}>{loadingOlder ? "Loading…" : "Load earlier messages"}</button>}
      {transcript && inlineMessages?.roots.map((message: ChatMessageRecord) => <ChatMessage key={message.id}
        message={message} inlineSteers={inlineMessages.inlineByTurn.get(message.id)} coordinationDetails
        tools={transcript.page.toolEvents.filter((tool: ToolEventRecord) => tool.messageId === message.id)} subagents={agents} onOpenSubagent={setSelected}
        activeRunStatus={transcript.run?.assistantMessageId === message.id ? transcript.run.status : null}
        onApprove={approve} onApproveAll={(ids) => ids.forEach((id) => approve(id, true))}
        onOpenReview={() => {}} turnUndo={null} onPrepareTurnUndo={async () => null} onUndoTurnChanges={async () => null} readOnly />)}
      {transcript?.pendingInput && <RequestUserInputPanel request={transcript.pendingInput} onSubmit={(answers) => window.privoraDesktop.answerRequestUserInput({ threadId: transcript.pendingInput!.threadId, callId: transcript.pendingInput!.callId, answers })} />}
    </div>
  </aside>;
}
