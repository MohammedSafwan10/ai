import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Bug, ClipboardCheck, Download, ExternalLink, FileText, Globe2, Loader2, Monitor, Plus, RefreshCw, RotateCw, ShieldAlert, Smartphone, Square, Tablet, TerminalSquare, X } from "lucide-react";
import clsx from "clsx";
import type { BrowserPanelStateRecord, BrowserViewportPreset, WorkspaceRecord } from "../../../shared/types";

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
  updatedAt: Date.now(),
});

export function BrowserPanel({ workspace, active, hidden }: BrowserPanelProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const stateFrameRef = useRef<number | null>(null);
  const pendingStateRef = useRef<BrowserPanelStateRecord | null>(null);
  const [state, setState] = useState<BrowserPanelStateRecord | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [inspectPanel, setInspectPanel] = useState<{ title: string; output: string } | null>(null);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const activeWorkspaceId = workspace?.id || null;
  const visible = Boolean(active && !hidden && activeWorkspaceId);
  const browserState = state || (activeWorkspaceId ? EMPTY_STATE(activeWorkspaceId) : null);

  useEffect(() => {
    if (!activeWorkspaceId) return;
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
    const unsubscribe = window.privoraDesktop.onEvent((event) => {
      if (event.type !== "browser_state_updated") return;
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

  const sendBounds = () => {
    if (!activeWorkspaceId || !visible || !viewportRef.current || !browserState) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const bounds = computeBrowserBounds(rect, browserState.viewportPreset);
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
  }, [visible, activeWorkspaceId, browserState?.viewportPreset]);

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
      setInspectPanel({ title: kind === "source" ? "DevBridge" : kind, output: result.output || "(empty)" });
    } catch (error) {
      setInspectPanel({ title: kind, output: error instanceof Error ? error.message : String(error) });
    }
  };

  const showEvidence = async () => {
    if (!activeWorkspaceId) return;
    try {
      const result = await window.privoraDesktop.browserEvidence(activeWorkspaceId);
      setInspectPanel({ title: "Current evidence", output: result.output || "(empty)" });
    } catch (error) {
      setInspectPanel({ title: "Current evidence", output: error instanceof Error ? error.message : String(error) });
    }
  };

  const allowNextDownload = async () => {
    if (!activeWorkspaceId) return;
    try {
      const result = await window.privoraDesktop.browserDownload({ workspaceId: activeWorkspaceId, action: "allow_next" });
      setInspectPanel({ title: "Downloads", output: result.output || "(empty)" });
      setDownloadsOpen(true);
    } catch (error) {
      setInspectPanel({ title: "Downloads", output: error instanceof Error ? error.message : String(error) });
    }
  };

  const analyzeForms = async () => {
    if (!activeWorkspaceId) return;
    try {
      const result = await window.privoraDesktop.browserFormAnalyze({ workspaceId: activeWorkspaceId });
      setInspectPanel({ title: "Forms", output: result.output || "(empty)" });
      setFormsOpen(true);
    } catch (error) {
      setInspectPanel({ title: "Forms", output: error instanceof Error ? error.message : String(error) });
    }
  };

  const openDevTools = async () => {
    if (!activeWorkspaceId) return;
    try {
      await window.privoraDesktop.openBrowserDevTools(activeWorkspaceId);
    } catch (error) {
      setInspectPanel({ title: "DevTools", output: error instanceof Error ? error.message : String(error) });
    }
  };

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
      </form>
      <div className="browser-preset-row" role="toolbar" aria-label="Browser viewport">
        <PresetButton preset="responsive" active={browserState.viewportPreset === "responsive"} onClick={setPreset} icon={<Monitor size={14} />} />
        <PresetButton preset="mobile" active={browserState.viewportPreset === "mobile"} onClick={setPreset} icon={<Smartphone size={14} />} />
        <PresetButton preset="tablet" active={browserState.viewportPreset === "tablet"} onClick={setPreset} icon={<Tablet size={14} />} />
        <span className={clsx("browser-agent-chip", browserState.agentActive && "active")}>
          {browserState.agentActive ? <TerminalSquare size={13} /> : <ShieldAlert size={13} />}
          {browserState.agentActive ? "Agent" : "Local-safe"}
        </span>
        <button type="button" title="Current evidence" aria-label="Current evidence" disabled={!browserState.url} onClick={showEvidence}>
          <FileText size={14} />
        </button>
        <button type="button" title="Forms" aria-label="Forms" disabled={!browserState.url} onClick={() => formsOpen ? setFormsOpen(false) : void analyzeForms()}>
          <ClipboardCheck size={14} />
        </button>
        <button type="button" title="Downloads" aria-label="Downloads" onClick={() => setDownloadsOpen((value) => !value)}>
          <Download size={14} />
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
      {(browserState.agentActive || browserState.failedRequestCount > 0 || browserState.consoleErrorCount > 0 || browserState.lastFinding) && (
        <div className="browser-status-strip" role="status">
          {browserState.agentActive && <button type="button" onClick={() => browserState.lastFinding && setInspectPanel({ title: "Last action", output: browserState.lastFinding })}>{browserState.lastAction || "Agent using browser"}</button>}
          {browserState.failedRequestCount > 0 && <button type="button" onClick={() => inspect("network")}>{browserState.failedRequestCount} failed request{browserState.failedRequestCount === 1 ? "" : "s"}</button>}
          {browserState.consoleErrorCount > 0 && <button type="button" onClick={() => inspect("console")}>{browserState.consoleErrorCount} console error{browserState.consoleErrorCount === 1 ? "" : "s"}</button>}
          {browserState.lastFinding && <button type="button" onClick={() => setInspectPanel({ title: "Last finding", output: browserState.lastFinding || "" })}>{browserState.lastFinding}</button>}
        </div>
      )}
      {inspectPanel && (
        <div className="browser-inspector-drawer">
          <header>
            <strong>{inspectPanel.title}</strong>
            <button type="button" title="Close" aria-label="Close" onClick={() => setInspectPanel(null)}>
              <X size={14} />
            </button>
          </header>
          <pre>{inspectPanel.output}</pre>
        </div>
      )}
      {downloadsOpen && (
        <div className="browser-inspector-drawer browser-downloads-drawer">
          <header>
            <strong>Downloads</strong>
            <div className="browser-drawer-actions">
              <button type="button" title="Allow next download" aria-label="Allow next download" onClick={allowNextDownload}>
                <Download size={13} />
              </button>
              <button type="button" title="Close" aria-label="Close" onClick={() => setDownloadsOpen(false)}>
                <X size={14} />
              </button>
            </div>
          </header>
          <div className="browser-download-list">
            {browserState.downloads.length === 0 ? (
              <span>No downloads yet.</span>
            ) : browserState.downloads.map((download) => (
              <div key={download.id} className={clsx("browser-download-row", download.state)}>
                <strong>{download.filename}</strong>
                <span>{download.state} · {formatBytes(download.receivedBytes)}{download.totalBytes ? ` / ${formatBytes(download.totalBytes)}` : ""}</span>
                {download.path && <button type="button" onClick={() => window.privoraDesktop.browserDownload({ workspaceId: activeWorkspaceId!, action: "reveal", downloadId: download.id })}>Reveal</button>}
              </div>
            ))}
          </div>
        </div>
      )}
      {formsOpen && (
        <div className="browser-inspector-drawer browser-forms-drawer">
          <header>
            <strong>Forms</strong>
            <div className="browser-drawer-actions">
              <button type="button" title="Refresh forms" aria-label="Refresh forms" onClick={analyzeForms}>
                <RefreshCw size={13} />
              </button>
              <button type="button" title="Close" aria-label="Close" onClick={() => setFormsOpen(false)}>
                <X size={14} />
              </button>
            </div>
          </header>
          <div className="browser-form-list">
            {browserState.forms.length === 0 ? (
              <span>No forms detected yet.</span>
            ) : browserState.forms.map((form) => (
              <div key={form.id} className={clsx("browser-form-card", form.risk)}>
                <div className="browser-form-card-head">
                  <strong>{form.label || form.submitLabel || form.id}</strong>
                  <span>{form.risk}</span>
                </div>
                <p>{form.method.toUpperCase()} {form.action || "(current page)"}</p>
                <div className="browser-form-meta">
                  <span>{form.controls.length} fields</span>
                  <span>{form.controls.filter((control) => control.required).length} required</span>
                  <span>{form.controls.filter((control) => control.sensitive).length} sensitive</span>
                  {typeof form.valid === "boolean" && <span>{form.valid ? "valid" : "invalid"}</span>}
                </div>
                {form.validationErrors?.length ? (
                  <div className="browser-form-errors">
                    {form.validationErrors.slice(0, 3).map((error) => <span key={error}>{error}</span>)}
                  </div>
                ) : null}
                <div className="browser-form-controls">
                  {form.controls.slice(0, 8).map((control) => (
                    <span key={control.id} className={clsx(control.sensitive && "sensitive", control.required && "required")}>
                      {control.label || control.name || control.id}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
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

const computeBrowserBounds = (rect: DOMRect, preset: BrowserViewportPreset) => {
  if (preset === "mobile") {
    const width = Math.min(390, Math.max(0, rect.width - 24));
    const height = Math.min(844, Math.max(0, rect.height - 24));
    return {
      x: rect.x + Math.max(0, (rect.width - width) / 2),
      y: rect.y + Math.max(0, (rect.height - height) / 2),
      width,
      height,
    };
  }
  if (preset === "tablet") {
    const width = Math.min(820, Math.max(0, rect.width - 24));
    const height = Math.min(1180, Math.max(0, rect.height - 24));
    return {
      x: rect.x + Math.max(0, (rect.width - width) / 2),
      y: rect.y + Math.max(0, (rect.height - height) / 2),
      width,
      height,
    };
  }
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
};

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
