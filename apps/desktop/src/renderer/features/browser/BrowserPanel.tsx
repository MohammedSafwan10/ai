import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Bug, Database, Download, ExternalLink, Globe2, Loader2, Monitor, MoreHorizontal, Play, Plus, RefreshCw, RotateCw, Save, Shield, Smartphone, Square, Tablet, X } from "lucide-react";
import clsx from "clsx";
import type { BrowserPanelStateRecord, BrowserToolsMenuAction, BrowserViewportPreset, WorkspaceRecord } from "../../../shared/types";

interface BrowserPanelProps {
  workspace: WorkspaceRecord | null;
  active: boolean;
  hidden: boolean;
}

const EMPTY_STATE = (workspaceId: string): BrowserPanelStateRecord => ({
  workspaceId,
  url: "",
  title: "Privora Browser",
  loading: false,
  canGoBack: false,
  canGoForward: false,
  visible: false,
  agentActive: false,
  consoleErrorCount: 0,
  failedRequestCount: 0,
  viewport: { width: 900, height: 680 },
  viewportPreset: "responsive",
  tabs: [],
  activeTabId: "",
  downloads: [],
  forms: [],
  shields: {
    mode: "standard",
    effectiveMode: "off",
    origin: "",
    blockedCount: 0,
    recentBlocked: [],
    engineReady: false,
    updatedAt: Date.now(),
  },
  workflow: {
    status: "idle",
    stepCount: 0,
    assertionCount: 0,
    workflows: [],
    recentEvidence: [],
    updatedAt: Date.now(),
  },
  updatedAt: Date.now(),
});

export function BrowserPanel({ workspace, active, hidden }: BrowserPanelProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const stateFrameRef = useRef<number | null>(null);
  const pendingStateRef = useRef<BrowserPanelStateRecord | null>(null);
  const browserStateRef = useRef<BrowserPanelStateRecord | null>(null);
  const lastBoundsRef = useRef<{ workspaceId: string; x: number; y: number; width: number; height: number } | null>(null);
  const toolsMenuActionRef = useRef<(action: BrowserToolsMenuAction) => void>(() => undefined);
  const [state, setState] = useState<BrowserPanelStateRecord | null>(null);
  const [zoomFactor, setZoomFactor] = useState(() => currentWindowZoomFactor());
  const [urlInput, setUrlInput] = useState("");
  const activeWorkspaceId = workspace?.id || null;
  const visible = Boolean(active && !hidden && activeWorkspaceId);
  const browserState = state || (activeWorkspaceId ? EMPTY_STATE(activeWorkspaceId) : null);
  browserStateRef.current = browserState;

  useEffect(() => {
    const unsubscribe = window.privoraDesktop.onZoomChanged((percent) => {
      setZoomFactor(normalizeZoomFactor(percent / 100));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    lastBoundsRef.current = null;
    let mounted = true;
    void window.privoraDesktop.getBrowserState(activeWorkspaceId)
      .then((next) => {
        if (!mounted || !next) return;
        setState(next);
        setUrlInput(next.url || "");
      })
      .catch((error) => console.error(error));
    return () => {
      mounted = false;
    };
  }, [activeWorkspaceId]);

  useEffect(() => {
    const flushState = () => {
      stateFrameRef.current = null;
      const next = pendingStateRef.current;
      pendingStateRef.current = null;
      if (!next) return;
      setState(next);
      if (document.activeElement?.getAttribute("data-browser-url-input") !== "true") {
        setUrlInput(next.url || "");
      }
    };
    const unsubscribe = window.privoraDesktop.onPrivoraEvent(({ payload: event }) => {
      if (event.type !== "browser.state_updated") return;
      if (activeWorkspaceId && event.state.workspaceId !== activeWorkspaceId) return;
      pendingStateRef.current = event.state;
      if (stateFrameRef.current === null) stateFrameRef.current = requestAnimationFrame(flushState);
    });
    return () => {
      unsubscribe();
      if (stateFrameRef.current !== null) cancelAnimationFrame(stateFrameRef.current);
      stateFrameRef.current = null;
      pendingStateRef.current = null;
    };
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    void window.privoraDesktop.setBrowserVisible(activeWorkspaceId, visible);
  }, [activeWorkspaceId, visible]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    return () => {
      void window.privoraDesktop.setBrowserVisible(activeWorkspaceId, false).catch((error) => console.error(error));
    };
  }, [activeWorkspaceId]);

  const sendBounds = () => {
    if (!activeWorkspaceId || !visible || !viewportRef.current || !browserState) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const bounds = computeBrowserBounds(rect, browserState.viewportPreset, zoomFactor);
    const last = lastBoundsRef.current;
    if (
      last &&
      last.workspaceId === activeWorkspaceId &&
      last.x === Math.round(bounds.x) &&
      last.y === Math.round(bounds.y) &&
      last.width === Math.round(bounds.width) &&
      last.height === Math.round(bounds.height)
    ) {
      return;
    }
    lastBoundsRef.current = {
      workspaceId: activeWorkspaceId,
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    };
    void window.privoraDesktop.setBrowserBounds({
      workspaceId: activeWorkspaceId,
      ...bounds,
    });
  };

  useLayoutEffect(() => {
    if (!visible) return;
    const schedule = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        sendBounds();
      });
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    if (viewportRef.current) observer.observe(viewportRef.current);
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [visible, activeWorkspaceId, browserState?.viewportPreset, zoomFactor]);

  const openUrl = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeWorkspaceId || !urlInput.trim()) return;
    try {
      const next = await window.privoraDesktop.openBrowserUrl({ workspaceId: activeWorkspaceId, url: urlInput.trim() });
      setState(next);
      setUrlInput(next.url || "");
      sendBounds();
    } catch (error) {
      setState((current) => current ? {
        ...current,
        loading: false,
        lastFinding: error instanceof Error ? error.message : String(error),
        updatedAt: Date.now(),
      } : current);
    }
  };

  const tabAction = async (action: "new" | "switch" | "close", tabId?: string) => {
    if (!activeWorkspaceId) return;
    const next = await window.privoraDesktop.browserTab({ workspaceId: activeWorkspaceId, action, tabId });
    setState(next);
    setUrlInput(next.url || "");
    requestAnimationFrame(sendBounds);
  };

  const navigate = async (direction: "back" | "forward" | "reload" | "stop") => {
    if (!activeWorkspaceId) return;
    const next = await window.privoraDesktop.navigateBrowser({ workspaceId: activeWorkspaceId, direction });
    setState(next);
  };

  const setPreset = async (preset: BrowserViewportPreset) => {
    if (!activeWorkspaceId) return;
    const next = await window.privoraDesktop.setBrowserViewport({ workspaceId: activeWorkspaceId, preset });
    setState(next);
    requestAnimationFrame(sendBounds);
  };

  const inspect = async (kind: "console" | "network" | "source") => {
    if (!activeWorkspaceId) return;
    try {
      const result = await window.privoraDesktop.inspectBrowser({ workspaceId: activeWorkspaceId, kind });
      await showOverlay(kind === "source" ? "DevBridge" : kind, result.output || "(empty)");
    } catch (error) {
      await showOverlay(kind, error instanceof Error ? error.message : String(error));
    }
  };

  const showEvidence = async () => {
    if (!activeWorkspaceId) return;
    try {
      const result = await window.privoraDesktop.browserEvidence(activeWorkspaceId);
      await showOverlay("Current evidence", result.output || "(empty)");
    } catch (error) {
      await showOverlay("Current evidence", error instanceof Error ? error.message : String(error));
    }
  };

  const allowNextDownload = async () => {
    if (!activeWorkspaceId) return;
    try {
      const result = await window.privoraDesktop.browserDownload({ workspaceId: activeWorkspaceId, action: "allow_next" });
      await showOverlay("Downloads", result.output || "(empty)", { width: 420, height: 260 });
    } catch (error) {
      await showOverlay("Downloads", error instanceof Error ? error.message : String(error), { width: 420, height: 260 });
    }
  };

  const toggleShieldsSite = async () => {
    if (!activeWorkspaceId) return;
    try {
      const nextEnabled = browserStateRef.current?.shields.effectiveMode !== "standard";
      const result = await window.privoraDesktop.browserShields({ workspaceId: activeWorkspaceId, action: "toggle_site", enabled: nextEnabled });
      await showOverlay("Privora Shields", result.output || "(empty)", { width: 420, height: 260 });
    } catch (error) {
      await showOverlay("Privora Shields", error instanceof Error ? error.message : String(error), { width: 420, height: 260 });
    }
  };

  const listShieldsBlocked = async () => {
    if (!activeWorkspaceId) return;
    try {
      const result = await window.privoraDesktop.browserShields({ workspaceId: activeWorkspaceId, action: "list_blocked" });
      await showOverlay("Privora Shields", result.output || "(empty)", { width: 560, height: 420 });
    } catch (error) {
      await showOverlay("Privora Shields", error instanceof Error ? error.message : String(error), { width: 560, height: 420 });
    }
  };

  const analyzeForms = async () => {
    if (!activeWorkspaceId) return;
    try {
      const result = await window.privoraDesktop.browserFormAnalyze({ workspaceId: activeWorkspaceId });
      await showOverlay("Forms", result.output || "(empty)", { width: 560, height: 520 });
    } catch (error) {
      await showOverlay("Forms", error instanceof Error ? error.message : String(error), { width: 560, height: 520 });
    }
  };

  const toggleRecording = async () => {
    const currentState = browserStateRef.current;
    if (!activeWorkspaceId || !currentState) return;
    try {
      const action = currentState.workflow.status === "recording" ? "stop_recording" : "start_recording";
      const result = await window.privoraDesktop.browserWorkflow({
        workspaceId: activeWorkspaceId,
        action,
        name: action === "start_recording" ? `Workflow ${new Date().toLocaleTimeString()}` : undefined,
      });
      await showOverlay("Workflow", result.output || "(empty)", { width: 520, height: 360 });
    } catch (error) {
      await showOverlay("Workflow", error instanceof Error ? error.message : String(error), { width: 520, height: 360 });
    }
  };

  const replayWorkflow = async () => {
    const currentState = browserStateRef.current;
    if (!activeWorkspaceId || !currentState) return;
    try {
      const result = await window.privoraDesktop.browserWorkflow({
        workspaceId: activeWorkspaceId,
        action: "replay",
        workflowId: currentState.workflow.activeWorkflowId || currentState.workflow.workflows[0]?.id,
      });
      await showOverlay("Workflow replay", result.output || "(empty)", { width: 560, height: 420 });
    } catch (error) {
      await showOverlay("Workflow replay", error instanceof Error ? error.message : String(error), { width: 560, height: 420 });
    }
  };

  const saveEvidence = async () => {
    if (!activeWorkspaceId) return;
    try {
      const result = await window.privoraDesktop.browserEvidenceVault({
        workspaceId: activeWorkspaceId,
        action: "save_current",
        includeScreenshot: true,
      });
      await showOverlay("Saved evidence", result.output || "(empty)", { width: 560, height: 360 });
    } catch (error) {
      await showOverlay("Saved evidence", error instanceof Error ? error.message : String(error), { width: 560, height: 360 });
    }
  };

  const openDevTools = async () => {
    if (!activeWorkspaceId) return;
    try {
      await window.privoraDesktop.openBrowserDevTools(activeWorkspaceId);
    } catch (error) {
      await showOverlay("DevTools", error instanceof Error ? error.message : String(error), { width: 480, height: 260 });
    }
  };

  const showOverlay = (title: string, body: string, size: { width?: number; height?: number } = {}) =>
    window.privoraDesktop.showBrowserOverlay({ title, body, ...size });

  const showWorkflowVault = () => {
    const currentState = browserStateRef.current;
    if (!currentState) return;
    const lines = [
      "Workflows",
      currentState.workflow.workflows.length
        ? currentState.workflow.workflows.map((workflow) => `${workflow.name}\n  ${workflow.stepCount} steps, ${workflow.assertionCount} assertions${workflow.lastRunStatus ? `, last run ${workflow.lastRunStatus}` : ""}`).join("\n\n")
        : "No workflows recorded yet.",
      "",
      "Evidence vault",
      currentState.workflow.recentEvidence.length
        ? currentState.workflow.recentEvidence.map((evidence) => `${evidence.title || evidence.url || "Evidence"}\n  ${new Date(evidence.createdAt).toLocaleString()}\n  ${evidence.artifactPaths.length} artifact(s)`).join("\n\n")
        : "No saved evidence yet.",
      "",
      currentState.workflow.lastRun
        ? `Last run\n  ${currentState.workflow.lastRun.status}\n  ${currentState.workflow.lastRun.stepResults.length} steps, ${currentState.workflow.lastRun.assertionResults.length} assertions${currentState.workflow.lastRun.diagnosis?.finding ? `\n  ${currentState.workflow.lastRun.diagnosis.finding}` : ""}`
        : "",
    ].filter((line) => line !== "").join("\n");
    void showOverlay("Workflow vault", lines, { width: 560, height: 560 });
  };

  const showToolsMenu = async () => {
    const currentState = browserStateRef.current;
    if (!activeWorkspaceId || !currentState) return;
    await window.privoraDesktop.showBrowserToolsMenu({
      workspaceId: activeWorkspaceId,
      hasUrl: Boolean(currentState.url),
      hasWorkflows: currentState.workflow.workflows.length > 0,
      recording: currentState.workflow.status === "recording",
      shieldsEnabled: currentState.shields.effectiveMode === "standard",
    });
  };

  const runToolsMenuAction = (action: BrowserToolsMenuAction) => {
    if (action === "current_evidence") void showEvidence();
    if (action === "forms") void analyzeForms();
    if (action === "record_workflow") void toggleRecording();
    if (action === "replay_workflow") void replayWorkflow();
    if (action === "save_evidence") void saveEvidence();
    if (action === "workflow_vault") showWorkflowVault();
    if (action === "toggle_shields_site") void toggleShieldsSite();
    if (action === "list_shields_blocked") void listShieldsBlocked();
  };
  toolsMenuActionRef.current = runToolsMenuAction;

  useEffect(() => {
    if (!activeWorkspaceId) return;
    const unsubscribe = window.privoraDesktop.onPrivoraEvent(({ payload: event }) => {
      if (event.type !== "browser.tools_menu_action" || event.workspaceId !== activeWorkspaceId) return;
      toolsMenuActionRef.current(event.action);
    });
    return unsubscribe;
  }, [activeWorkspaceId]);

  if (!workspace || !browserState) {
    return (
      <div className="browser-panel-empty">
        <Globe2 size={34} />
        <strong>Open a workspace</strong>
        <span>Privora Browser is scoped per project.</span>
      </div>
    );
  }

  return (
    <section className="browser-panel" aria-label="Privora Browser">
      <div className="browser-tab-strip" role="tablist" aria-label="Browser tabs">
        {(browserState.tabs.length ? browserState.tabs : [{ id: browserState.activeTabId || "tab", title: "New tab", url: "", loading: false, canGoBack: false, canGoForward: false, createdAt: Date.now(), updatedAt: Date.now() }]).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === browserState.activeTabId}
            className={clsx("browser-tab-pill", tab.id === browserState.activeTabId && "active")}
            onClick={() => tab.id !== browserState.activeTabId && tabAction("switch", tab.id)}
            title={tab.url || tab.title}
          >
            {tab.loading ? <Loader2 size={12} className="spin" /> : <Globe2 size={12} />}
            <span>{tab.title || tab.url || "New tab"}</span>
            {browserState.tabs.length > 1 && (
              <span
                role="button"
                tabIndex={0}
                className="browser-tab-close"
                aria-label="Close tab"
                onClick={(event) => {
                  event.stopPropagation();
                  void tabAction("close", tab.id);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.stopPropagation();
                  void tabAction("close", tab.id);
                }}
              >
                <X size={11} />
              </span>
            )}
          </button>
        ))}
        <button type="button" className="browser-tab-new" title="New tab" aria-label="New tab" disabled={browserState.tabs.length >= 6} onClick={() => tabAction("new")}>
          <Plus size={14} />
        </button>
      </div>
      <form className="browser-toolbar" onSubmit={openUrl}>
        <div className="browser-nav">
          <button type="button" title="Back" aria-label="Back" disabled={!browserState.canGoBack} onClick={() => navigate("back")}>
            <ArrowLeft size={15} />
          </button>
          <button type="button" title="Forward" aria-label="Forward" disabled={!browserState.canGoForward} onClick={() => navigate("forward")}>
            <ArrowRight size={15} />
          </button>
          <button type="button" title={browserState.loading ? "Stop" : "Reload"} aria-label={browserState.loading ? "Stop" : "Reload"} onClick={() => navigate(browserState.loading ? "stop" : "reload")}>
            {browserState.loading ? <Square size={13} /> : <RefreshCw size={14} />}
          </button>
        </div>
        <label className="browser-address">
          {browserState.loading ? <Loader2 size={15} className="spin" /> : <Globe2 size={15} />}
          <input
            data-browser-url-input="true"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            placeholder="localhost:5173"
          />
        </label>
        <button type="submit" className="browser-go-button" title="Open URL" aria-label="Open URL">
          <RotateCw size={14} />
        </button>
        <button type="button" title="Open externally" aria-label="Open externally" disabled={!browserState.url} onClick={() => browserState.url && window.privoraDesktop.openExternalUrl(browserState.url)}>
          <ExternalLink size={14} />
        </button>
        <button type="button" title="Open DevTools" aria-label="Open DevTools" disabled={!browserState.url} onClick={openDevTools}>
          <Bug size={14} />
        </button>
        {browserState.url && (
          <button
            type="button"
            title={`Privora Shields: ${browserState.shields.effectiveMode}${browserState.shields.blockedCount ? `, ${browserState.shields.blockedCount} blocked` : ""}`}
            aria-label="Privora Shields"
            className={clsx("browser-shields-button", browserState.shields.effectiveMode === "standard" && "active")}
            onClick={listShieldsBlocked}
          >
            <Shield size={14} />
            {browserState.shields.blockedCount > 0 && <span>{browserState.shields.blockedCount}</span>}
          </button>
        )}
      </form>
      <div className="browser-preset-row" role="toolbar" aria-label="Browser viewport">
        <PresetButton preset="responsive" active={browserState.viewportPreset === "responsive"} onClick={setPreset} icon={<Monitor size={14} />} />
        <PresetButton preset="mobile" active={browserState.viewportPreset === "mobile"} onClick={setPreset} icon={<Smartphone size={14} />} />
        <PresetButton preset="tablet" active={browserState.viewportPreset === "tablet"} onClick={setPreset} icon={<Tablet size={14} />} />
        <span className="browser-preset-spacer" />
        <button type="button" className="browser-tools-more" title="Browser tools" aria-label="Browser tools" onClick={showToolsMenu}>
          <MoreHorizontal size={16} />
        </button>
      </div>
      <div className="browser-viewport-shell">
        <div className={clsx("browser-native-slot", browserState.viewportPreset)} ref={viewportRef}>
          {!browserState.url && (
            <div className="browser-panel-empty inline">
              <Globe2 size={30} />
              <strong>Privora Browser</strong>
              <span>Open a localhost app to inspect, trace, and verify UI behavior.</span>
            </div>
          )}
        </div>
      </div>
      {(browserState.agentActive || browserState.failedRequestCount > 0 || browserState.consoleErrorCount > 0 || browserState.shields.blockedCount > 0 || browserState.lastFinding) && (
        <div className="browser-status-strip" role="status">
          {browserState.agentActive && <button type="button" onClick={() => browserState.lastFinding && void showOverlay("Last action", browserState.lastFinding)}>{browserState.lastAction || "Agent using browser"}</button>}
          {browserState.failedRequestCount > 0 && <button type="button" onClick={() => inspect("network")}>{browserState.failedRequestCount} failed request{browserState.failedRequestCount === 1 ? "" : "s"}</button>}
          {browserState.consoleErrorCount > 0 && <button type="button" onClick={() => inspect("console")}>{browserState.consoleErrorCount} console error{browserState.consoleErrorCount === 1 ? "" : "s"}</button>}
          {browserState.shields.blockedCount > 0 && <button type="button" onClick={listShieldsBlocked}>{browserState.shields.blockedCount} blocked by Shields</button>}
          {browserState.lastFinding && <button type="button" onClick={() => void showOverlay("Last finding", browserState.lastFinding || "")}>{browserState.lastFinding}</button>}
        </div>
      )}
    </section>
  );
}

function PresetButton({
  preset,
  active,
  icon,
  onClick,
}: {
  preset: BrowserViewportPreset;
  active: boolean;
  icon: ReactNode;
  onClick: (preset: BrowserViewportPreset) => void;
}) {
  return (
    <button type="button" className={clsx(active && "active")} title={preset} aria-label={preset} onClick={() => onClick(preset)}>
      {icon}
    </button>
  );
}

const computeBrowserBounds = (rect: DOMRect, preset: BrowserViewportPreset, zoomFactor = 1) => {
  const scale = normalizeZoomFactor(zoomFactor);
  const toDip = (value: number) => Math.round(value * scale);
  if (preset === "mobile") {
    const width = Math.min(390, Math.max(0, rect.width - 24));
    const height = Math.min(844, Math.max(0, rect.height - 24));
    return {
      x: toDip(rect.x + Math.max(0, (rect.width - width) / 2)),
      y: toDip(rect.y + Math.max(0, (rect.height - height) / 2)),
      width: toDip(width),
      height: toDip(height),
    };
  }
  if (preset === "tablet") {
    const width = Math.min(820, Math.max(0, rect.width - 24));
    const height = Math.min(1180, Math.max(0, rect.height - 24));
    return {
      x: toDip(rect.x + Math.max(0, (rect.width - width) / 2)),
      y: toDip(rect.y + Math.max(0, (rect.height - height) / 2)),
      width: toDip(width),
      height: toDip(height),
    };
  }
  return {
    x: toDip(rect.x),
    y: toDip(rect.y),
    width: toDip(rect.width),
    height: toDip(rect.height),
  };
};

const normalizeZoomFactor = (value: number) => Number.isFinite(value) && value > 0 ? value : 1;

const currentWindowZoomFactor = () => normalizeZoomFactor(window.visualViewport?.scale || 1);

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
};
