import { AboutSettings } from "./AboutSettings";
import { ShortcutSettings } from "./ShortcutSettings";
import { StorageSettings } from "./StorageSettings";
import { ProviderModelsSettings } from "./ProviderModelsSettings";
import type { CatalogProvider } from "../../shared/providerCatalog";
import {
  Check,
  ArrowLeft,
  ChevronRight,
  Code2,
  Database,
  Info,
  KeyRound,
  Keyboard,
  Monitor,
  Moon,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SaveSettingsInput, SettingsRecord, UpdateStatus, WorkspaceOpenTargetInfo } from "../../shared/types";
import { TargetIcon } from "./AppLauncher";
import { GoAccountsSettings } from "./GoAccountsSettings";
import { OpenRouterModelsSettings } from "./OpenRouterModelsSettings";

interface SettingsPanelProps {
  settings: SettingsRecord;
  open: boolean;
  onClose: () => void;
  onOpenTab?: (tab: SettingsTab) => void;
}

interface SettingsScreenProps {
  settings: SettingsRecord;
  updateStatus: UpdateStatus | null;
  workspaceDisabled: boolean;
  open: boolean;
  onOpen: (tab?: SettingsTab) => void;
  onClose: () => void;
  onSave: (settings: SaveSettingsInput) => Promise<void> | void;
  initialTab?: SettingsTab;
}

type SettingsTab = "general" | "providers" | "workspace" | "storage" | "shortcuts" | "about";
type ProviderId = CatalogProvider | "openrouter";
const providers: { id: ProviderId; name: string; description: string }[] = [
  { id: "openai", name: "OpenAI", description: "API key · GPT and Codex API models" },
  { id: "anthropic", name: "Claude", description: "Anthropic API key and models" },
  { id: "openrouter", name: "OpenRouter", description: "API key and model library" },
  { id: "opencode-go", name: "OpenCode Go", description: "Accounts and model access" },
  { id: "gemini", name: "Gemini", description: "Direct Google API access" },
  { id: "deepseek", name: "DeepSeek", description: "Direct DeepSeek API access" },
  { id: "cliproxy", name: "CLIProxy", description: "Local proxy connection" },
];

export function SettingsPanel({ onOpenTab, onClose }: SettingsPanelProps) {
  return <button className="sidebar-settings-button" onClick={() => onOpenTab ? onOpenTab("general") : onClose()} title="Settings"><SettingsIcon size={16} /><span>Settings</span></button>;
}

export function SettingsScreen({ settings, updateStatus, workspaceDisabled, open, onOpen, onClose, onSave, initialTab = "general" }: SettingsScreenProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [provider, setProvider] = useState<ProviderId | null>(null);
  const [openRouterKeyRevision, setOpenRouterKeyRevision] = useState(0);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [cliproxyBaseUrl, setCliproxyBaseUrl] = useState(settings.cliproxyBaseUrl);
  const contentRef = useRef<HTMLDivElement>(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceTargetsLoading, setWorkspaceTargetsLoading] = useState(true);
  const workspaceOpeningRef = useRef(false);
  const [workspaceOpening, setWorkspaceOpening] = useState<string | null>(null);
  const [workspaceTargets, setWorkspaceTargets] = useState<WorkspaceOpenTargetInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [providerSaveError, setProviderSaveError] = useState("");

  const saveProviderSettings = async (input: SaveSettingsInput) => {
    setSaving(true);
    setStatus("idle");
    setProviderSaveError("");
    try {
      await onSave(input);
      setOpenRouterKeyRevision((revision) => revision + 1);
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1800);
      return true;
    } catch (error) {
      console.error(error);
      setStatus("error");
      const message = error instanceof Error ? error.message : String(error || "");
      setProviderSaveError(message.replace(/^Error invoking remote method '[^']+': Error:\s*/i, "") || "Could not save provider settings.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) onClose();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === "/") {
        event.preventDefault();
        setActiveTab("shortcuts");
        onOpen("shortcuts");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onOpen, open]);

  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [initialTab, open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setWorkspaceTargetsLoading(true); setWorkspaceError("");
    void window.privoraDesktop.listWorkspaceOpenTargets()
      .then((targets) => {
        if (alive) setWorkspaceTargets(targets);
      })
      .catch(() => {
        if (alive) { setWorkspaceTargets([]); setWorkspaceError("Could not load available applications."); }
      }).finally(() => { if (alive) setWorkspaceTargetsLoading(false); });
    return () => {
      alive = false;
    };
  }, [open]);


  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [activeTab, provider]);

  return (
    <div className="settings-screen">
      <section className="settings-screen-shell" aria-label="Settings">
            <nav className="settings-tabs" aria-label="Settings sections">
              <strong>Settings</strong>
              <SettingsTabButton id="general" active={activeTab} icon={<Sun size={15} />} label="General" onSelect={setActiveTab} />
              <SettingsTabButton id="providers" active={activeTab} icon={<KeyRound size={15} />} label="Providers" onSelect={setActiveTab} />
              <SettingsTabButton id="workspace" active={activeTab} icon={<Code2 size={15} />} label="Workspace" onSelect={setActiveTab} />
              <SettingsTabButton id="storage" active={activeTab} icon={<Database size={15} />} label="Storage" onSelect={setActiveTab} />
              <SettingsTabButton id="shortcuts" active={activeTab} icon={<Keyboard size={15} />} label="Shortcuts" onSelect={setActiveTab} />
              <SettingsTabButton id="about" active={activeTab} icon={<Info size={15} />} label="About" onSelect={setActiveTab} />
            </nav>

            <div className="settings-content" ref={contentRef}>
              <div className="settings-modal-header">
                <h2>{tabTitle(activeTab)}</h2>
                <button type="button" className="settings-close-button" aria-label="Close settings" title="Close settings" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>

              {activeTab === "general" && (
                <div className="settings-section settings-general">
                  <p className="settings-description">Appearance and background behavior.</p>
                  <div className="settings-preference-row">
                    <div className="settings-preference-copy">
                      <strong>Appearance</strong>
                      <small>Use your device theme or choose your own.</small>
                    </div>
                  <div className="theme-control" role="group" aria-label="Appearance">
                    {themeOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          type="button"
                          key={option.id}
                          className={clsx(settings.theme === option.id && "active")}
                          title={option.label}
                          aria-pressed={settings.theme === option.id}
                          disabled={saving}
                          onClick={() => void saveProviderSettings({ theme: option.id })}
                        >
                          <Icon size={16} />
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  </div>
                  <button
                    type="button"
                    className="settings-preference-row settings-toggle-row"
                    role="switch"
                    aria-checked={settings.keepRunningInTray}
                    aria-label="Run in background"
                    disabled={saving}
                    onClick={() => void saveProviderSettings({ keepRunningInTray: !settings.keepRunningInTray })}
                  >
                    <span className="settings-preference-copy">
                      <strong>Run in background</strong>
                      <small>Closing the window hides it to the Windows tray.</small>
                    </span>
                    <span aria-hidden="true" className={clsx("settings-switch", settings.keepRunningInTray && "active")} />
                  </button>
                  {providerSaveError && <p className="settings-inline-error" role="alert">{providerSaveError}</p>}
                </div>
              )}

              {activeTab === "providers" && (
                <div className="settings-section settings-providers">
                  {!provider ? <>
                    <p className="settings-description">Manage each provider’s connection, accounts, and models.</p>
                    <div className="settings-provider-list">
                      {providers.map((item) => {
                        const detail = item.id === "openrouter" ? settings.openRouterApiKeyStored ? "Key saved" : "Not configured"
                          : item.id === "gemini" ? settings.geminiApiKeyStored ? "Key saved" : "Not configured"
                          : item.id === "deepseek" ? settings.deepseekApiKeyStored ? "Key saved" : "Not configured"
                          : item.id === "openai" ? settings.openaiApiKeyStored ? "Key saved" : "Not configured"
                          : item.id === "anthropic" ? settings.anthropicApiKeyStored ? "Key saved" : "Not configured"
                          : item.id === "opencode-go" ? `${settings.opencodeGoAccounts?.length || (settings.opencodeGoApiKeyStored ? 1 : 0)} saved`
                          : "Local endpoint";
                        return <button type="button" key={item.id} onClick={() => { setProvider(item.id); setStatus("idle"); setProviderSaveError(""); }}>
                          <span className="settings-preference-copy"><strong>{item.name}</strong><small>{item.description}</small></span>
                          <span className="settings-provider-status">{detail}<ChevronRight size={15} /></span>
                        </button>;
                      })}
                    </div>
                  </> : <>
                  <div className="settings-provider-heading">
                    <button type="button" className="settings-row-button" disabled={saving} onClick={() => { setProvider(null); setStatus("idle"); setProviderSaveError(""); }}><ArrowLeft size={14} /> All providers</button>
                    <h3>{providers.find((item) => item.id === provider)?.name}</h3>
                  </div>
                  {provider === "cliproxy" ? <label>Base URL<input value={cliproxyBaseUrl} onChange={(event) => setCliproxyBaseUrl(event.target.value)} /></label>
                    : provider !== "opencode-go" ? <label><span className="settings-secret-label">API key<small>{providerKeyStored(provider, settings) ? "Saved securely" : "Not saved"}</small></span>
                      <div className="settings-secret-row"><input type="password" autoComplete="off" spellCheck={false} value={apiKeys[provider] || ""} placeholder={providerKeyStored(provider, settings) ? "New key replaces saved key" : "Paste API key"} onChange={(event) => setApiKeys({ ...apiKeys, [provider]: event.target.value })}/>
                        {providerKeyStored(provider, settings) && <button type="button" className="secret-clear-button" disabled={saving} aria-label="Clear saved API key" title="Clear saved API key" onClick={() => { setApiKeys({ ...apiKeys, [provider]: "" }); void saveProviderSettings({ [providerKeyField(provider)]: "" }); }}><Trash2 size={14}/></button>}
                      </div>
                      {(provider === "openai" || provider === "anthropic") && <small>Uses API billing. ChatGPT and Claude subscriptions do not fund API-key requests.</small>}
                    </label> : <GoAccountsSettings settings={settings} busy={saving} onSave={saveProviderSettings}/>}
                  {provider !== "opencode-go" && <button type="button" className="settings-primary-button" disabled={saving || (provider !== "cliproxy" && !apiKeys[provider]?.trim())} onClick={async () => {
                    const saved = await saveProviderSettings(provider === "cliproxy" ? { cliproxyBaseUrl } : { [providerKeyField(provider)]: apiKeys[provider] });
                    if (saved) setApiKeys((keys) => ({ ...keys, [provider]: "" }));
                  }}>{saving ? "Saving…" : status === "saved" ? <><Check size={15}/>Saved</> : provider === "cliproxy" ? "Save connection" : "Save API key"}</button>}
                  {status === "error" && <p className="settings-error" role="status">{providerSaveError}</p>}
                  {provider === "openrouter" ? <OpenRouterModelsSettings key={openRouterKeyRevision} keyStored={settings.openRouterApiKeyStored}/>
                    : <ProviderModelsSettings key={`${provider}:${openRouterKeyRevision}:${settings.activeOpencodeGoAccountId}`} provider={provider} connected={provider === "cliproxy" || providerKeyStored(provider, settings)}/>}

                  </>}
                </div>
              )}

              {activeTab === "workspace" && <div className="settings-section settings-workspace">
                <p className="settings-description">Open the current project in another application.</p>
                {workspaceDisabled && <p className="settings-description">Select a project to use these actions.</p>}
                <section className="settings-detail-group" aria-label="Available applications"><h3>Applications</h3>
                  {workspaceTargets.map((target) => <div className="settings-workspace-row" key={target.id}>
                    <TargetIcon target={target} size={20} /><div><strong>{target.label}</strong>{target.isDefault && <small>Default application</small>}</div>
                    <button type="button" className="settings-row-button settings-outlined-button" disabled={workspaceDisabled || Boolean(workspaceOpening)} onClick={async () => {
                      if (workspaceOpeningRef.current) return;
                      workspaceOpeningRef.current = true;
                      setWorkspaceOpening(target.id); setWorkspaceError("");
                      try { await window.privoraDesktop.openWorkspaceTarget(target.id); }
                      catch { setWorkspaceError(`Could not open ${target.label}.`); }
                      finally { workspaceOpeningRef.current = false; setWorkspaceOpening(null); }
                    }}>{workspaceOpening === target.id ? "Opening…" : "Open"}</button>
                  </div>)}
                  {workspaceTargetsLoading && <p className="settings-description" role="status">Finding applications…</p>}
                  {!workspaceTargetsLoading && !workspaceTargets.length && !workspaceError && <p className="settings-description">No supported applications were found.</p>}
                </section>
                {workspaceError && <p className="settings-inline-error" role="alert">{workspaceError}</p>}
              </div>}

              {activeTab === "shortcuts" && <ShortcutSettings />}

              {activeTab === "storage" && <StorageSettings />}

              {activeTab === "about" && <AboutSettings updateStatus={updateStatus} />}
            </div>
      </section>
    </div>
  );
}

function SettingsTabButton({
  id,
  active,
  icon,
  label,
  onSelect,
}: {
  id: SettingsTab;
  active: SettingsTab;
  icon: ReactNode;
  label: string;
  onSelect: (tab: SettingsTab) => void;
}) {
  return (
    <button type="button" className={clsx(active === id && "active")} aria-current={active === id ? "page" : undefined} onClick={() => onSelect(id)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

const tabTitle = (tab: SettingsTab) => {
  if (tab === "providers") return "Providers";
  if (tab === "workspace") return "Workspace";
  if (tab === "storage") return "Storage";
  if (tab === "shortcuts") return "Shortcuts";
  if (tab === "about") return "About";
  return "General";
};

const themeOptions = [
  { id: "system" as const, label: "System", icon: Monitor },
  { id: "light" as const, label: "Light", icon: Sun },
  { id: "dark" as const, label: "Dark", icon: Moon },
];

function providerKeyField(provider: ProviderId): "openaiApiKey" | "anthropicApiKey" | "openRouterApiKey" | "geminiApiKey" | "deepseekApiKey" {
  return provider === "openai" ? "openaiApiKey" : provider === "anthropic" ? "anthropicApiKey" : provider === "openrouter" ? "openRouterApiKey" : provider === "gemini" ? "geminiApiKey" : "deepseekApiKey";
}
function providerKeyStored(provider: ProviderId, settings: SettingsRecord): boolean {
  if (provider === "opencode-go") return settings.opencodeGoApiKeyStored;
  if (provider === "cliproxy") return true;
  return Boolean(settings[`${providerKeyField(provider)}Stored`]);
}
