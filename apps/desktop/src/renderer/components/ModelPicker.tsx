import { Check, Eye, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ModelOption, ModelProviderGroup, ProviderId, ReasoningEffort } from "../../shared/models";
import type { SettingsRecord } from "../../shared/types";

const providerNames: Record<ProviderId, string> = {
  openai: "OpenAI", anthropic: "Claude", gemini: "Gemini", deepseek: "DeepSeek",
  "opencode-go": "Go", openrouter: "OpenRouter", cliproxy: "CLIProxy",
};
export const modelProviderLabel = (model: ModelOption) => providerNames[model.provider];
const effortNames: Record<ReasoningEffort, string> = {
  none: "Off", minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max",
};
const compact = (value: string) => value.replace(/[^\p{L}\p{N}]/gu, "");
export function filterModelGroups(groups: ModelProviderGroup[], query: string): ModelProviderGroup[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return groups.map((group) => ({ ...group, models: group.models.filter((model) => {
    const text = `${model.label} ${model.id} ${model.upstreamModelId ?? ""} ${group.label} ${modelProviderLabel(model)}`.toLowerCase();
    return terms.every((term) => text.includes(term) || (compact(term).length > 0 && compact(text).includes(compact(term))));
  }) })).filter((group) => group.models.length > 0);
}

interface Props {
  groups: ModelProviderGroup[];
  settings: SettingsRecord;
  activeModel: ModelOption;
  subagentModel: ModelOption | null;
  hasThread: boolean;
  onSettings: (settings: Partial<SettingsRecord>) => void;
  onClose: () => void;
}

export function ModelPicker({ groups, settings, activeModel, subagentModel, hasThread, onSettings, onClose }: Props) {
  const [target, setTarget] = useState<"chat" | "subagent">("chat");
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const filtered = useMemo(() => filterModelGroups(groups, query), [groups, query]);
  const available = filtered.flatMap((group) => group.models).filter((model) => !model.unavailable);
  const selectedId = target === "chat" ? settings.model : settings.subagentModel;
  const focusedId = available.some((model) => model.id === highlight) ? highlight
    : available.find((model) => model.id === selectedId)?.id ?? available[0]?.id;
  const selected = target === "chat" ? activeModel : subagentModel ?? activeModel;
  const effort = target === "chat" ? settings.reasoningEffort : settings.subagentReasoningEffort;
  const optionId = (id: string) => `${uid}-${encodeURIComponent(id)}`;
  useEffect(() => { searchRef.current?.focus(); }, [target]);
  useEffect(() => {
    if (focusedId) document.getElementById(optionId(focusedId))?.scrollIntoView({ block: "nearest" });
  }, [focusedId, query, target]);

  const choose = (model: ModelOption) => {
    if (model.unavailable) return;
    if (target === "subagent") onSettings({ subagentModel: model.id,
      ...(settings.subagentReasoningEffort && !model.reasoningEfforts.includes(settings.subagentReasoningEffort) ? { subagentReasoningEffort: null } : {}) });
    else onSettings({ model: model.id, reasoningEffort: model.reasoningEfforts.includes(settings.reasoningEffort) ? settings.reasoningEffort : model.defaultReasoningEffort });
    onClose();
  };

  return <div className="floating-menu unified-model-picker" role="dialog" aria-label="Model settings"
    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="model-picker-tabs" role="tablist" aria-label="Configure models">
      {(["chat", "subagent"] as const).map((tab) => <button type="button" key={tab} role="tab" aria-selected={target === tab}
        id={`${uid}-${tab}-tab`} aria-controls={`${uid}-panel`} tabIndex={target === tab ? 0 : -1}
        onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          event.preventDefault(); setQuery(""); setHighlight(null);
          setTarget(event.key === "Home" ? "chat" : event.key === "End" ? "subagent" : tab === "chat" ? "subagent" : "chat");
        } }} onClick={() => { setTarget(tab); setQuery(""); setHighlight(null); }}>
        {tab === "chat" ? "Chat" : "Subagents"}
      </button>)}
    </div>
    <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${target}-tab`}>
      <div className="unified-model-search"><Search size={15} aria-hidden="true" /><input ref={searchRef} type="search"
        role="combobox" aria-label="Search models" aria-autocomplete="list" aria-expanded="true" aria-controls={`${uid}-list`}
        aria-activedescendant={focusedId ? optionId(focusedId) : undefined}
        placeholder="Search models or providers…" value={query} onChange={(event) => { setQuery(event.target.value); setHighlight(null); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) {
            event.preventDefault(); event.stopPropagation();
            if (!available.length) return;
            const index = available.findIndex((model) => model.id === focusedId);
            if (event.key === "Enter") { if (index >= 0) choose(available[index]); }
            else setHighlight(available[(index + (event.key === "ArrowDown" ? 1 : -1) + available.length) % available.length].id);
          }
        }} /></div>
      {target === "subagent" && <button type="button" className="model-inherit-row" onClick={() => { onSettings({ subagentModel: null }); onClose(); }}>
        <span>Same as chat<small>{activeModel.label} · {modelProviderLabel(activeModel)}</small></span>{!settings.subagentModel && <Check size={15} />}
      </button>}
      <div id={`${uid}-list`} className="unified-model-list" role="listbox" aria-label={target === "chat" ? "Chat models" : "Subagent models"}>
        {filtered.map((group) => <div key={group.id} role="group" aria-label={group.label}>
          <div className="unified-model-group" aria-hidden="true">{group.label}</div>
          {group.models.map((model) => <button type="button" role="option" key={model.id} id={optionId(model.id)}
            aria-selected={selectedId === model.id} aria-disabled={model.unavailable || undefined} disabled={model.unavailable}
            className={`unified-model-row${focusedId === model.id ? " highlighted" : ""}`} tabIndex={-1}
            title={`${model.upstreamModelId ?? model.id} · ${modelProviderLabel(model)} · ${model.supportsTools ? "Tools supported" : "Chat only"}${model.unavailable ? " · Unavailable; review Settings > Providers" : ""}`}
            onMouseMove={() => { if (!model.unavailable) setHighlight(model.id); }} onClick={() => choose(model)}>
            <span className="unified-model-name">{model.label}{model.unavailable && <small>Unavailable</small>}</span>
            <span className="unified-model-icons">{model.supportsImageInput && <Eye size={13} aria-label="Image input" />}
              <span className="model-selection-mark">{selectedId === model.id && <Check size={15} />}</span></span>
          </button>)}
        </div>)}
        {!filtered.length && <p className="model-picker-empty" role="status">{groups.length ? "No matching models." : "Add models in Settings > Providers."}</p>}
      </div>
      <div className="unified-model-footer">
        <div className="model-effort-control" role="group" aria-label={target === "chat" ? "Chat reasoning" : "Subagent reasoning"}>
          <span className="model-effort-label">Reasoning</span>
          <div className="model-effort-options">
            {target === "subagent" && <button type="button" aria-pressed={!effort} onClick={() => onSettings({ subagentReasoningEffort: null })}>Same as chat</button>}
            {!selected.reasoningEfforts.length && target === "chat" && <span className="model-effort-unavailable">Not available</span>}
            {selected.reasoningEfforts.map((value) => <button type="button" key={value} aria-pressed={effort === value}
              onClick={() => onSettings(target === "chat" ? { reasoningEffort: value } : { subagentReasoningEffort: value })}>
              {selected.reasoningControl === "toggle" && value !== "none" ? "On" : effortNames[value]}
            </button>)}
          </div>
        </div>
        {target === "subagent" && hasThread && <label className="model-scope-control"><input type="checkbox" checked={settings.subagentSettingsScope === "next_turn"}
          onChange={(event) => onSettings({ subagentSettingsScope: event.target.checked ? "next_turn" : "new" })} />Apply to existing agents’ next turns</label>}
        {target === "subagent" && <p>Current runs keep their model and reasoning.</p>}
      </div>
    </div>
  </div>;
}
