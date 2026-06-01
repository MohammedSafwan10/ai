import clsx from "clsx";
import type { CSSProperties } from "react";
import type { ContextUsageRecord } from "../../shared/types";

export function ContextMeter({
  usage,
  modelContextWindow,
  attachedContextCount,
}: {
  usage?: ContextUsageRecord;
  modelContextWindow?: number;
  attachedContextCount: number;
}) {
  const percent = usage?.remainingPercent ?? 100;
  const usedTokens = usage?.usedTokens ?? 0;
  const windowTokens = usage?.contextWindowTokens ?? modelContextWindow;
  const tone = percent < 20 ? "danger" : percent < 50 ? "warn" : "ok";
  const ringStyle = {
    "--context-percent": `${Math.max(0, Math.min(100, percent))}%`,
  } as CSSProperties;
  return (
    <div className={clsx("context-meter-wrap", usage?.estimated && "is-estimated")}>
      <button
        type="button"
        className={clsx("context-meter", `tone-${tone}`)}
        style={ringStyle}
        aria-label={`Context ${percent}% left`}
      >
        <span>{percent}</span>
      </button>
      <div className="context-meter-popover" role="tooltip">
        <div className="context-meter-popover-title">
          <strong>{percent}% context left</strong>
          <span>{usage?.estimated ? "estimated" : "exact"}</span>
        </div>
        <dl>
          <div>
            <dt>Used</dt>
            <dd>{formatTokenCount(usedTokens)}{windowTokens ? ` / ${formatTokenCount(windowTokens)}` : ""}</dd>
          </div>
          <div>
            <dt>Last turn</dt>
            <dd>{formatTokenCount(usage?.lastTokenUsage.inputTokens || 0)} in · {formatTokenCount(usage?.lastTokenUsage.outputTokens || 0)} out</dd>
          </div>
          <div>
            <dt>Reasoning</dt>
            <dd>{formatTokenCount(usage?.lastTokenUsage.reasoningOutputTokens || 0)}</dd>
          </div>
          <div>
            <dt>Reserve</dt>
            <dd>{formatTokenCount(usage?.outputReserveTokens || 0)}</dd>
          </div>
          <div>
            <dt>Auto compact</dt>
            <dd>{usage?.autoCompactAtTokens ? formatTokenCount(usage.autoCompactAtTokens) : "provider default"}</dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd>{usage?.budgetMode === "large_context" ? "Large context" : "Normal"}</dd>
          </div>
          <div>
            <dt>Attached</dt>
            <dd>{attachedContextCount}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

const formatTokenCount = (tokens: number) => {
  if (!tokens) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens >= 10_000_000 ? 0 : 1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(tokens >= 100_000 ? 0 : 1)}k`;
  return tokens.toLocaleString();
};
