import clsx from "clsx";
import type { CSSProperties } from "react";
import type { ContextUsageRecord } from "../../shared/types";
import type { ModelOption } from "../../shared/models";

export function ContextMeter({
  usage,
  model,
  attachedContextCount,
}: {
  usage?: ContextUsageRecord;
  model: ModelOption;
  attachedContextCount: number;
}) {
  const currentUsage = usage?.modelId === model.id ? usage : undefined;
  const percent = currentUsage?.remainingPercent ?? 100;
  const usedTokens = currentUsage?.usedTokens ?? 0;
  const windowTokens = model.contextWindowTokens;
  const inputBudget = currentUsage?.inputBudgetTokens;
  const tone = percent < 20 ? "danger" : percent < 50 ? "warn" : "ok";
  const ringStyle = {
    "--context-percent": `${Math.max(0, Math.min(100, percent))}%`,
  } as CSSProperties;
  return (
    <div className={clsx("context-meter-wrap", currentUsage?.estimated && "is-estimated")}>
      <button
        type="button"
        className={clsx("context-meter", `tone-${tone}`)}
        style={ringStyle}
        aria-label={`Context ${percent}% left`}
      >
        <span className="context-meter-dot" aria-hidden="true" />
      </button>
      <div className="context-meter-popover" role="tooltip">
        <div className="context-meter-popover-title">
          <strong>{percent}% context left</strong>
          <span>{currentUsage?.estimated || !currentUsage ? "estimated" : "provider usage"}</span>
        </div>
        <dl>
          <div>
            <dt>Used</dt>
            <dd>{formatTokenCount(usedTokens)}{inputBudget ? ` / ${formatTokenCount(inputBudget)} usable` : ""}</dd>
          </div>
          <div>
            <dt>Model limits</dt>
            <dd>{model.inputLimitTokens
              ? `${formatTokenCount(model.inputLimitTokens)} input · ${formatTokenCount(model.maxOutputTokens || 0)} output`
              : `${formatTokenCount(windowTokens || 0)} context · ${formatTokenCount(model.maxOutputTokens || 0)} output`}</dd>
          </div>
          <div>
            <dt>Remaining</dt>
            <dd>{currentUsage?.remainingTokens === undefined ? "Not measured yet" : formatTokenCount(currentUsage.remainingTokens)}</dd>
          </div>
          <div>
            <dt>Last turn</dt>
            <dd>{formatTokenCount(currentUsage?.lastTokenUsage.inputTokens || 0)} in · {formatTokenCount(currentUsage?.lastTokenUsage.outputTokens || 0)} out</dd>
          </div>
          <div>
            <dt>Reasoning</dt>
            <dd>{formatTokenCount(currentUsage?.lastTokenUsage.reasoningOutputTokens || 0)}</dd>
          </div>
          <div>
            <dt>Reserved</dt>
            <dd>{formatTokenCount(currentUsage?.outputReserveTokens || model.defaultOutputTokens || 0)} output · {formatTokenCount(currentUsage?.safetyReserveTokens || 0)} safety</dd>
          </div>
          <div>
            <dt>Auto compact</dt>
            <dd>{currentUsage?.autoCompactAtTokens ? formatTokenCount(currentUsage.autoCompactAtTokens) : "After usage is measured"}</dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd>{currentUsage?.budgetMode === "large_context" ? "Large attachments" : "Standard"}</dd>
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
