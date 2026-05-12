import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, ExternalLink, RefreshCw, Terminal } from "lucide-react";
import type { WebDevRuntimeState } from "../lib/types";

export function WebDevPreview({
  runtime,
  onRestart,
}: {
  runtime: WebDevRuntimeState;
  onRestart: () => void;
}) {
  const isReady = runtime.status === "running" && runtime.previewUrl;
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const latestLine = runtime.errors.at(-1) || runtime.terminalLines.at(-1) || "Runtime output";
  const hasRuntimeSignal = runtime.errors.length > 0 || runtime.terminalLines.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--privora-bg)]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--privora-border)] bg-[var(--privora-surface)] px-3">
        <div className="min-w-0 text-xs font-medium text-[var(--privora-muted)]">
          {runtime.status === "unsupported"
            ? "WebContainer unavailable"
            : isReady
              ? runtime.previewUrl
              : runtime.status === "idle"
                ? "Preview idle"
                : `${runtime.status[0].toUpperCase()}${runtime.status.slice(1)}...`}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setIsConsoleOpen(value => !value)}
            className="flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1.5 text-[var(--privora-muted)] transition hover:bg-[var(--privora-bg)] hover:text-[var(--privora-text)]"
            title={isConsoleOpen ? "Hide console" : "Show console"}
          >
            <Terminal className="h-3.5 w-3.5" />
            {runtime.errors.length > 0 && (
              <span className="rounded-full bg-red-500/12 px-1.5 py-0.5 text-[10px] font-medium text-red-500">
                {runtime.errors.length}
              </span>
            )}
            {isConsoleOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => runtime.previewUrl && window.open(runtime.previewUrl, "_blank")}
            disabled={!runtime.previewUrl}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--privora-muted)] transition hover:bg-[var(--privora-bg)] hover:text-[var(--privora-text)] disabled:cursor-not-allowed disabled:opacity-35"
            title="Open preview in new tab"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--privora-muted)] transition hover:bg-[var(--privora-bg)] hover:text-[var(--privora-text)]"
            title="Restart preview"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {isReady ? (
          <iframe
            title="Web Dev Preview"
            src={runtime.previewUrl}
            className="h-full w-full border-0 bg-white"
            allow="cross-origin-isolated"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-[var(--privora-muted)]">
            {runtime.status === "unsupported" ? <AlertTriangle className="h-6 w-6" /> : <Terminal className="h-6 w-6" />}
            <p className="max-w-sm">
              {runtime.status === "unsupported"
                ? "WebContainer needs cross-origin isolation. Code editing still works; preview will run after the required headers are active."
                : "The preview will appear here after dependencies install and Vite starts."}
            </p>
          </div>
        )}
      </div>

      {isConsoleOpen ? (
        <div className="max-h-44 shrink-0 overflow-auto border-t border-[var(--privora-border)] bg-[var(--privora-surface)] p-3 font-mono text-[11px] leading-5 text-[var(--privora-muted)]">
          {runtime.errors.length > 0 && (
            <div className="mb-2 rounded-lg border border-red-500/25 bg-red-500/10 p-2 text-red-500">
              {runtime.errors[runtime.errors.length - 1]}
            </div>
          )}
          {runtime.terminalLines.length > 0 ? runtime.terminalLines.slice(-80).map((line, index) => (
            <div key={`${line}-${index}`} className="whitespace-pre-wrap">{line}</div>
          )) : (
            <div>Runtime output will appear here.</div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsConsoleOpen(true)}
          className="flex h-8 shrink-0 items-center gap-2 border-t border-[var(--privora-border)] bg-[var(--privora-surface)] px-3 text-left font-mono text-[11px] text-[var(--privora-muted)] transition hover:bg-[var(--privora-bg)] hover:text-[var(--privora-text)]"
          title="Show console"
        >
          <Terminal className="h-3.5 w-3.5 shrink-0" />
          <span className={`min-w-0 truncate ${runtime.errors.length > 0 ? "text-red-500" : ""}`}>
            {hasRuntimeSignal ? latestLine : "Hidden"}
          </span>
          <ChevronUp className="ml-auto h-3.5 w-3.5 shrink-0" />
        </button>
      )}
    </div>
  );
}
