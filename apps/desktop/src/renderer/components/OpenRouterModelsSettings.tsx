import { useEffect, useRef, useState } from "react";
import { ChevronDown, RefreshCw, Search } from "lucide-react";
import {
  isExpiredOpenRouterModel,
  isFreeOpenRouterModel,
  openRouterPriceIncreased,
  type OpenRouterCatalogState,
  type OpenRouterModel,
} from "../../shared/openRouterModels";
import "../styles/openrouter-models.css";

export function openRouterPricingLabel(model?: OpenRouterModel): string {
  if (!model?.pricing) return "Price unknown";
  if (isFreeOpenRouterModel(model)) return "Free";
  const usd = (value: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(
      value * 1_000_000,
    );
  return `$${usd(model.pricing.prompt)} in / $${usd(model.pricing.completion)} out per 1M tokens`;
}
export function OpenRouterModelsSettings({
  keyStored,
}: {
  keyStored: boolean;
}) {
  const [state, setState] = useState<OpenRouterCatalogState | null>(null);
  const [tab, setTab] = useState<"mine" | "browse">("mine");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(40);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [manual, setManual] = useState(false);
  const [modelId, setModelId] = useState("");
  const [details, setDetails] = useState<string | null>(null);
  const generation = useRef(0);
  const publish = (value: OpenRouterCatalogState) => {
    setState(value);
    setError(value.error || "");
    window.dispatchEvent(new Event("privora:openrouter-models"));
  };
  useEffect(() => {
    const stamp = ++generation.current;
    setBusy(true);
    setError("");
    void (async () => {
      const cached = await window.privoraDesktop.listOpenRouterModels({
        cachedOnly: true,
      });
      if (generation.current !== stamp) return;
      setState(cached);
      if (keyStored) {
        const live = await window.privoraDesktop.listOpenRouterModels();
        if (generation.current === stamp) publish(live);
      }
    })()
      .catch(() => {
        if (generation.current === stamp)
          setError("Could not load saved model information.");
      })
      .finally(() => {
        if (generation.current === stamp) setBusy(false);
      });
    return () => {
      generation.current++;
    };
  }, [keyStored]);
  const action = async (run: () => Promise<OpenRouterCatalogState>) => {
    const stamp = generation.current;
    setBusy(true);
    setError("");
    try {
      const next = await run();
      if (generation.current === stamp) publish(next);
    } catch (e) {
      if (generation.current === stamp)
        setError(
          (e instanceof Error ? e.message : "Could not update models.").replace(
            /^Error invoking remote method '[^']+': Error:\s*/i,
            "",
          ),
        );
    } finally {
      if (generation.current === stamp) setBusy(false);
    }
  };
  const change = (id: string, enabled: boolean) =>
    action(() => window.privoraDesktop.updateOpenRouterModels({ id, enabled }));
  const selected = new Map(state?.selections.map((s) => [s.id, s]));
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const models = state?.models || [];
  const byId = new Map(models.map((m) => [m.id, m]));
  const ids =
    tab === "mine"
      ? state?.selections.map((s) => s.id) || []
      : models
          .filter(
            (m) =>
              !state?.unavailableIds?.includes(m.id) &&
              !isExpiredOpenRouterModel(m) &&
              (!state?.freeOnly || isFreeOpenRouterModel(m)),
          )
          .map((m) => m.id);
  const rows = ids
    .map((id) => ({ id, model: byId.get(id) }))
    .filter(({ id, model }) =>
      terms.every((term) =>
        `${id} ${model?.name || ""}`.toLowerCase().includes(term),
      ),
    );
  return (
    <section className="or-models" aria-labelledby="or-models-title">
      <header className="or-models-header">
        <div>
          <h3 id="or-models-title">OpenRouter models</h3>
          <p>Choose which models appear in the composer and subagent picker.</p>
        </div>
        <button
          type="button"
          disabled={!keyStored || busy}
          onClick={() =>
            void action(() =>
              window.privoraDesktop.listOpenRouterModels({ refresh: true }),
            )
          }
        >
          <RefreshCw size={14} />
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </header>
      <div className="or-models-toolbar">
        <div role="tablist" aria-label="OpenRouter model lists">
          {(["mine", "browse"] as const).map((value) => (
            <button
              type="button"
              key={value}
              role="tab"
              aria-selected={tab === value}
              tabIndex={tab === value ? 0 : -1}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  const next =
                    e.key === "Home"
                      ? "mine"
                      : e.key === "End"
                        ? "browse"
                        : value === "mine"
                          ? "browse"
                          : "mine";
                  setTab(next);
                  setLimit(40);
                  setDetails(null);
                  (
                    e.currentTarget.parentElement?.querySelectorAll("button")[
                      next === "mine" ? 0 : 1
                    ] as HTMLButtonElement | undefined
                  )?.focus();
                }
              }}
              onClick={() => {
                setTab(value);
                setLimit(40);
                setDetails(null);
              }}
            >
              {value === "mine"
                ? `My models${state ? ` (${state.selections.length})` : ""}`
                : "Browse models"}
            </button>
          ))}
        </div>
        <label className="or-free-only">
          <input
            type="checkbox"
            checked={state?.freeOnly || false}
            disabled={!state || busy}
            onChange={(e) =>
              void action(() =>
                window.privoraDesktop.updateOpenRouterModels({
                  freeOnly: e.target.checked,
                }),
              )
            }
          />
          Free models only
        </label>
      </div>
      <div className="or-search">
        <Search size={15} />
        <input
          aria-label="Search OpenRouter models"
          placeholder="Search by model name or ID"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(40);
          }}
        />
      </div>
      <p className="or-freshness">
        {!keyStored
          ? "Save your OpenRouter key above to discover models."
          : state?.fetchedAt
            ? `${state.stale ? "Saved catalog · " : "Updated "}${new Date(state.fetchedAt).toLocaleString()}`
            : busy
              ? "Loading model catalog…"
              : "No catalog loaded yet."}
      </p>
      {error && (
        <p className="or-error" role="status">
          {error}
        </p>
      )}
      <div
        className="or-model-list"
        role="tabpanel"
        aria-label={
          tab === "mine" ? "My OpenRouter models" : "Browse OpenRouter models"
        }
      >
        {rows.slice(0, limit).map(({ id, model }) => {
          const selection = selected.get(id);
          const unavailable =
            !model ||
            state?.unavailableIds?.includes(id) ||
            isExpiredOpenRouterModel(model);
          const increased =
            model && selection && openRouterPriceIncreased(model, selection);
          const blocked =
            model && state?.freeOnly && !isFreeOpenRouterModel(model);
          return (
            <div className="or-model-row" key={id}>
              <div className="or-model-main">
                <button
                  type="button"
                  className="or-model-info"
                  aria-expanded={details === id}
                  onClick={() => setDetails(details === id ? null : id)}
                >
                  <span>
                    <strong>{model?.name || id}</strong>
                    <small>
                      {unavailable
                        ? "Unavailable"
                        : openRouterPricingLabel(model)}
                      {!unavailable && increased
                        ? " · Review current price"
                        : blocked
                          ? " · Blocked by free-only setting"
                          : ""}
                    </small>
                  </span>
                  <ChevronDown size={14} />
                </button>
                <div className="or-model-actions">
                  {selection && increased && !unavailable && (
                    <button
                      type="button"
                      disabled={busy || blocked || state?.stale}
                      onClick={() => void change(id, true)}
                    >
                      Accept current price
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={
                      busy ||
                      (!selection &&
                        (unavailable ||
                          blocked ||
                          !model?.pricing ||
                          state?.stale))
                    }
                    onClick={() => void change(id, !selection)}
                  >
                    {selection ? "Remove" : "Add"}
                  </button>
                </div>
              </div>
              {details === id && (
                <div className="or-model-details">
                  <code>{id}</code>
                  {model && (
                    <>
                      <p>{model.description}</p>
                      <dl>
                        <div>
                          <dt>Context</dt>
                          <dd>
                            {model.contextLength?.toLocaleString() || "Unknown"}{" "}
                            tokens
                          </dd>
                        </div>
                        <div>
                          <dt>Max output</dt>
                          <dd>
                            {model.maxOutputTokens?.toLocaleString() ||
                              "Unknown"}{" "}
                            tokens
                          </dd>
                        </div>
                        <div>
                          <dt>Input</dt>
                          <dd>
                            {model.inputModalities.join(", ") || "Unknown"}
                          </dd>
                        </div>
                        <div>
                          <dt>Tools</dt>
                          <dd>
                            {model.supportedParameters.includes("tools")
                              ? "Supported"
                              : "Not listed · chat only"}
                          </dd>
                        </div>
                        <div>
                          <dt>Reasoning</dt>
                          <dd>
                            {model.supportedParameters.includes("reasoning")
                              ? "On / Off"
                              : model.supportedParameters.includes(
                                    "include_reasoning",
                                  )
                                ? "Output only � provider controlled"
                                : "Not listed"}
                          </dd>
                        </div>
                        {model.expirationDate && (
                          <div>
                            <dt>Retirement date</dt>
                            <dd>{model.expirationDate}</dd>
                          </div>
                        )}
                      </dl>
                      {model.pricing &&
                        Object.entries(model.pricing).some(
                          ([k, v]) =>
                            k !== "prompt" && k !== "completion" && v > 0,
                        ) && (
                          <p>
                            Additional rates:{" "}
                            {Object.entries(model.pricing)
                              .filter(
                                ([k, v]) =>
                                  k !== "prompt" && k !== "completion" && v > 0,
                              )
                              .map(
                                ([k, v]) =>
                                  `${k.replaceAll("_", " ")}: $${v} per API billing unit`,
                              )
                              .join(" · ")}
                          </p>
                        )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!rows.length && (
          <p className="or-empty">
            {tab === "mine"
              ? "No matching models. Browse the catalog to add one."
              : "No matching models in the current catalog."}
          </p>
        )}
        {rows.length > limit && (
          <button
            type="button"
            className="or-show-more"
            onClick={() => setLimit(limit + 40)}
          >
            Show more ({rows.length - limit} remaining)
          </button>
        )}
      </div>
      <button
        type="button"
        className="or-manual-toggle"
        aria-expanded={manual}
        onClick={() => setManual(!manual)}
      >
        Add by model ID
      </button>
      {manual && (
        <form
          className="or-manual"
          onSubmit={(e) => {
            e.preventDefault();
            const id = modelId.trim();
            if (!models.some((m) => m.id === id)) {
              setError(
                "This exact ID is not in your available chat catalog. Refresh models or check the ID.",
              );
              return;
            }
            setSearch(id);
            setTab("browse");
            setManual(false);
          }}
        >
          <input
            aria-label="Exact OpenRouter model ID"
            placeholder="author/model-name"
            value={modelId}
            maxLength={200}
            onChange={(e) => setModelId(e.target.value)}
          />
          <button type="submit" disabled={busy || !modelId.trim()}>
            Find model
          </button>
        </form>
      )}
    </section>
  );
}
