import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, RefreshCw, Search } from "lucide-react";
import { catalogLabels, catalogModelOptions, registerCatalogModels, type CatalogProvider, type ProviderCatalogState } from "../../shared/providerCatalog";

export function ProviderModelsSettings({ provider, connected }: { provider: CatalogProvider; connected: boolean }) {
  const [state, setState] = useState<ProviderCatalogState | null>(null);
  const [tab, setTab] = useState<"mine" | "browse">("mine");
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(40);
  const [details, setDetails] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0); const labelId = useId();
  const publish = (next: ProviderCatalogState) => {
    setState(next); setError(next.error || ""); registerCatalogModels(catalogModelOptions(next));
    window.dispatchEvent(new Event("privora:provider-models"));
  };
  useEffect(() => {
    const stamp = ++generation.current; setBusy(true);
    void (async () => {
      const saved = await window.privoraDesktop.listProviderModels({ provider, cachedOnly: true });
      if (generation.current !== stamp) return;
      setState(saved);
      if (connected) { const fresh = await window.privoraDesktop.listProviderModels({ provider }); if (generation.current === stamp) publish(fresh); }
    })().catch(() => { if (generation.current === stamp) setError("Could not load this provider’s models."); })
      .finally(() => { if (generation.current === stamp) setBusy(false); });
    return () => { generation.current++; };
  }, [provider, connected]);
  const action = async (work: () => Promise<ProviderCatalogState>) => {
    const stamp = generation.current; setBusy(true); setError("");
    try { const next = await work(); if (generation.current === stamp) publish(next); }
    catch { if (generation.current === stamp) setError("Could not update models. Refresh the catalog and try again."); }
    finally { if (generation.current === stamp) setBusy(false); }
  };
  const models = state ? catalogModelOptions(state) : [];
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = models.filter((m) => (tab === "mine" ? state?.enabledIds.includes(m.upstreamModelId!) : !m.unavailable) && terms.every((term) => `${m.label} ${m.upstreamModelId}`.toLowerCase().includes(term)));
  return <section className="or-models" aria-labelledby={labelId}>
    <header className="or-models-header"><div><h3 id={labelId}>Models</h3><p>Choose models for the composer and subagents.</p></div>
      <button type="button" disabled={busy || !connected} onClick={() => void action(() => window.privoraDesktop.listProviderModels({ provider, refresh: true }))}><RefreshCw size={14} />{busy ? "Refreshing…" : "Refresh"}</button>
    </header>
    <div className="or-models-toolbar"><div role="group" aria-label={`${catalogLabels[provider]} model lists`}>
      {(["mine", "browse"] as const).map((value) => <button type="button" key={value} aria-pressed={tab === value} className={tab === value ? "active" : undefined} onClick={() => { setTab(value); setLimit(40); }}>{value === "mine" ? `My models (${state?.enabledIds.length || 0})` : "Browse models"}</button>)}
    </div></div>
    <div className="or-search"><Search size={15}/><input aria-label={`Search ${catalogLabels[provider]} models`} placeholder="Search by model name or ID" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(40); }}/></div>
    <p className="or-freshness" role="status">{!connected ? "Save a key above to discover models." : state?.fetchedAt ? `${state.stale ? "Saved catalog · " : "Updated "}${new Date(state.fetchedAt).toLocaleString()}` : busy ? "Loading model catalog…" : "No catalog loaded yet."}</p>
    {error && <p className="or-error" role="status">{error}</p>}
    <div className="or-model-list">
      {rows.slice(0, limit).map((model) => {
        const rawId = model.upstreamModelId!, enabled = state!.enabledIds.includes(rawId);
        const change = (nextEnabled: boolean, capabilities?: { tools: boolean; images: boolean }) => void action(() => window.privoraDesktop.updateProviderModels({ provider, id: rawId, enabled: nextEnabled, capabilities }));
        return <div className="or-model-row" key={model.id}>
          <div className="or-model-main"><button type="button" className="or-model-info" aria-expanded={details === model.id} onClick={() => setDetails(details === model.id ? null : model.id)}><span><strong>{model.label}</strong><small>{model.unavailable ? "Unavailable" : !model.capabilitiesKnown ? "Some capabilities not reported" : model.supportsTools ? "Tools supported" : "Chat only"}</small></span><ChevronDown size={14}/></button>
            <div className="or-model-actions"><button type="button" disabled={busy || (!enabled && (state?.stale || model.unavailable))} onClick={() => change(!enabled)}>{enabled ? "Remove" : "Add"}</button></div>
          </div>
          {details === model.id && <div className="or-model-details"><code>{rawId}</code><p>{model.description}</p><dl>
            <div><dt>Context</dt><dd>{model.contextWindowTokens?.toLocaleString() || "Not reported"}</dd></div><div><dt>Max output</dt><dd>{model.maxOutputTokens?.toLocaleString() || "Not reported"}</dd></div>
            <div><dt>Reasoning controls</dt><dd>{model.supportsReasoning ? model.reasoningEfforts.join(", ") : "Not reported"}</dd></div>
            <div><dt>Metadata</dt><dd>{model.catalogSource === "provider+metadata" ? "Provider API + models.dev" : "Provider API"}</dd></div>
          </dl>
          {!model.capabilitiesKnown && <><p>The catalog does not confirm every capability. Enable these only if the provider documents support; unsupported options may fail.</p>
            <label className="provider-capability-option"><input type="checkbox" checked={model.supportsTools} disabled={busy || !enabled || state?.stale || model.unavailable} onChange={(e) => change(true, { tools: e.target.checked, images: model.supportsImageInput })}/>Use tools</label>
            <label className="provider-capability-option"><input type="checkbox" checked={model.supportsImageInput} disabled={busy || !enabled || state?.stale || model.unavailable} onChange={(e) => change(true, { tools: model.supportsTools, images: e.target.checked })}/>Accept images</label></>}
          </div>}
        </div>;
      })}
      {!rows.length && !busy && <p className="or-empty">{tab === "mine" ? state?.enabledIds.length ? "Saved selections will appear when this connection’s catalog is loaded." : "No models added. Browse models to choose what appears in your picker." : "No matching models."}</p>}
      {rows.length > limit && <button type="button" onClick={() => setLimit(limit + 40)}>Show more</button>}
    </div>
  </section>;
}
