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
  RefreshCw,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";
import type { SaveSettingsInput, SettingsRecord, StorageCleanupCategoryId, StorageUsageSnapshot, UpdateStatus, WorkspaceOpenTargetInfo } from "../../shared/types";
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
  onOpen: () => void;
  onClose: () => void;
  onSave: (settings: SaveSettingsInput) => Promise<void> | void;
  initialTab?: SettingsTab;
}

type SettingsTab = "general" | "providers" | "workspace" | "storage" | "shortcuts" | "about";
type ProviderId = "openrouter" | "go" | "gemini" | "deepseek" | "cliproxy";
const providers: { id: ProviderId; name: string; description: string }[] = [
  { id: "openrouter", name: "OpenRouter", description: "API key and model library" },
  { id: "go", name: "OpenCode Go", description: "Accounts and model access" },
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
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [openRouterKeyRevision, setOpenRouterKeyRevision] = useState(0);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [deepseekApiKey, setDeepseekApiKey] = useState("");
  const [goModelsStatus, setGoModelsStatus] = useState("");
  const [cliproxyBaseUrl, setCliproxyBaseUrl] = useState(settings.cliproxyBaseUrl);
  const [workspaceTargets, setWorkspaceTargets] = useState<WorkspaceOpenTargetInfo[]>([]);
  const [storageUsage, setStorageUsage] = useState<StorageUsageSnapshot | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageCleaning, setStorageCleaning] = useState<StorageCleanupCategoryId | "app_owned" | null>(null);
  const [storageMessage, setStorageMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [providerSaveError, setProviderSaveError] = useState("");

  const saveProviderSettings = async (input: SaveSettingsInput) => {
    setSaving(true);
    setStatus("idle");
    setProviderSaveError("");
    try {
      await onSave(input);
      if ("openRouterApiKey" in input) setOpenRouterKeyRevision((revision) => revision + 1);
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
      if (event.ctrlKey && event.key === "/") {
        event.preventDefault();
        setActiveTab("shortcuts");
        onOpen();
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
    void window.privoraDesktop.listWorkspaceOpenTargets()
      .then((targets) => {
        if (alive) setWorkspaceTargets(targets);
      })
      .catch(() => {
        if (alive) setWorkspaceTargets([]);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  const refreshStorageUsage = async () => {
    setStorageLoading(true);
    setStorageMessage("");
    try {
      setStorageUsage(await window.privoraDesktop.getStorageUsage());
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "Could not scan storage.");
    } finally {
      setStorageLoading(false);
    }
  };

  useEffect(() => {
    if (!open || activeTab !== "storage") return;
    void refreshStorageUsage();
  }, [activeTab, open]);

  const cleanupStorage = async (categoryIds: StorageCleanupCategoryId[], mode: StorageCleanupCategoryId | "app_owned") => {
    setStorageCleaning(mode);
    setStorageMessage("");
    try {
      const result = await window.privoraDesktop.cleanupStorage({ categoryIds });
      setStorageUsage(result.after);
      setStorageMessage(`Cleaned ${formatBytes(result.totalBytesFreed)} across ${result.categories.length} ${result.categories.length === 1 ? "category" : "categories"}.`);
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : "Cleanup failed.");
    } finally {
      setStorageCleaning(null);
    }
  };

  return (
    <div className="settings-screen">
      <section className="settings-screen-shell" aria-label="Settings">
            <aside className="settings-tabs">
              <strong>Settings</strong>
              <SettingsTabButton id="general" active={activeTab} icon={<Sun size={15} />} label="General" onSelect={setActiveTab} />
              <SettingsTabButton id="providers" active={activeTab} icon={<KeyRound size={15} />} label="Providers" onSelect={setActiveTab} />
              <SettingsTabButton id="workspace" active={activeTab} icon={<Code2 size={15} />} label="Workspace" onSelect={setActiveTab} />
              <SettingsTabButton id="storage" active={activeTab} icon={<Database size={15} />} label="Storage" onSelect={setActiveTab} />
              <SettingsTabButton id="shortcuts" active={activeTab} icon={<Keyboard size={15} />} label="Shortcuts" onSelect={setActiveTab} />
              <SettingsTabButton id="about" active={activeTab} icon={<Info size={15} />} label="About" onSelect={setActiveTab} />
            </aside>

            <div className="settings-content">
              <div className="settings-modal-header">
                <h2>{tabTitle(activeTab)}</h2>
                <button type="button" className="settings-close-button" aria-label="Close settings" title="Close settings" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>

              {activeTab === "general" && (
                <div className="settings-section settings-general">
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
                          onClick={() => onSave({ theme: option.id })}
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
                    onClick={() => onSave({ keepRunningInTray: !settings.keepRunningInTray })}
                  >
                    <span className="settings-preference-copy">
                      <strong>Run in background</strong>
                      <small>Closing the window hides it to the Windows tray.</small>
                    </span>
                    <span aria-hidden="true" className={clsx("settings-switch", settings.keepRunningInTray && "active")} />
                  </button>
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
                          : item.id === "go" ? `${settings.opencodeGoAccounts?.length || (settings.opencodeGoApiKeyStored ? 1 : 0)} saved`
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
                  {provider === "cliproxy" && <label>
                    CLIProxy base URL
                    <input value={cliproxyBaseUrl} onChange={(event) => setCliproxyBaseUrl(event.target.value)} />
                  </label>}
                  {provider === "gemini" && <label>
                    <span className="settings-secret-label">
                      Gemini API key
                      <small>{settings.geminiApiKeyStored ? "Saved securely" : "Not saved"}</small>
                    </span>
                    <div className="settings-secret-row">
                      <input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={settings.geminiApiKeyStored ? "New key replaces saved key" : "Paste Gemini key"}
                        value={geminiApiKey}
                        onChange={(event) => setGeminiApiKey(event.target.value)}
                      />
                      {settings.geminiApiKeyStored && (
                        <button
                          type="button"
                          className="secret-clear-button"
                          disabled={saving}
                          title="Clear saved Gemini key"
                          onClick={() => {
                            setGeminiApiKey("");
                            void saveProviderSettings({ geminiApiKey: "" });
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </label>}
                  {provider === "openrouter" && <label>
                    <span className="settings-secret-label">
                      OpenRouter API key
                      <small>{settings.openRouterApiKeyStored ? "Saved securely" : "Not saved"}</small>
                    </span>
                    <div className="settings-secret-row">
                      <input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={settings.openRouterApiKeyStored ? "New key replaces saved key" : "Paste OpenRouter key"}
                        value={openRouterApiKey}
                        onChange={(event) => setOpenRouterApiKey(event.target.value)}
                      />
                      {settings.openRouterApiKeyStored && (
                        <button
                          type="button"
                          className="secret-clear-button"
                          disabled={saving}
                          title="Clear saved OpenRouter key"
                          onClick={() => {
                            setOpenRouterApiKey("");
                            void saveProviderSettings({ openRouterApiKey: "" });
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </label>}
                  {provider === "deepseek" && <label>
                    <span className="settings-secret-label">
                      DeepSeek API key
                      <small>{settings.deepseekApiKeyStored ? "Saved securely" : "Not saved"}</small>
                    </span>
                    <div className="settings-secret-row">
                      <input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={settings.deepseekApiKeyStored ? "New key replaces saved key" : "Paste DeepSeek key (sk-...)"}
                        value={deepseekApiKey}
                        onChange={(event) => setDeepseekApiKey(event.target.value)}
                      />
                      {settings.deepseekApiKeyStored && (
                        <button
                          type="button"
                          className="secret-clear-button"
                          disabled={saving}
                          title="Clear saved DeepSeek key"
                          onClick={() => {
                            setDeepseekApiKey("");
                            void saveProviderSettings({ deepseekApiKey: "" });
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </label>}
                  {provider === "go" && <>
                  <GoAccountsSettings settings={settings} busy={saving} onSave={saveProviderSettings} />
                  {settings.opencodeGoApiKeyStored && (
                    <div className="settings-button-row">
                      <button
                        type="button"
                        className="settings-row-button"
                        disabled={saving}
                        onClick={async () => {
                          setGoModelsStatus("Refreshing Go model list...");
                          try {
                            const list = await window.privoraDesktop.listOpencodeGoModels({ refresh: true });
                            const updated = list.fetchedAt ? new Date(list.fetchedAt).toLocaleString() : "just now";
                            setGoModelsStatus(`${list.ids.length} Go models available (${list.source}, ${updated})${list.unsupported.length ? `. ${list.unsupported.length} need responses/messages route.` : ""}`);
                          } catch (error) {
                            setGoModelsStatus(error instanceof Error ? error.message : "Could not refresh Go models.");
                          }
                        }}
                      >
                        <RefreshCw size={15} />
                        <span>Refresh Go models</span>
                      </button>
                    </div>
                  )}
                  {goModelsStatus && <p className="settings-storage-message">{goModelsStatus}</p>}
                  </>}
                  {provider !== "go" && <button
                    className="settings-primary-button"
                    disabled={saving || (provider === "openrouter" && !openRouterApiKey.trim()) || (provider === "gemini" && !geminiApiKey.trim()) || (provider === "deepseek" && !deepseekApiKey.trim())}
                    onClick={async () => {
                      const saved = await saveProviderSettings(provider === "cliproxy" ? { cliproxyBaseUrl }
                        : provider === "gemini" ? { geminiApiKey }
                        : provider === "openrouter" ? { openRouterApiKey }
                        : { deepseekApiKey });
                      if (!saved) return;
                      if (provider === "gemini") setGeminiApiKey("");
                      if (provider === "openrouter") setOpenRouterApiKey("");
                      if (provider === "deepseek") setDeepseekApiKey("");
                    }}
                  >
                    {saving ? "Saving..." : status === "saved" ? (
                      <>
                        <Check size={15} />
                        Saved
                      </>
                    ) : provider === "cliproxy" ? "Save connection" : "Save API key"}
                  </button>}
                  {status === "error" && (
                    <p className="settings-error">{providerSaveError}</p>
                  )}
                  {provider === "openrouter" && <OpenRouterModelsSettings key={openRouterKeyRevision} keyStored={settings.openRouterApiKeyStored} />}
                  </>}
                </div>
              )}

              {activeTab === "workspace" && (
                <div className="settings-section settings-action-grid">
                  {workspaceTargets.map((target) => {
                    return (
                      <button
                        type="button"
                        key={target.id}
                        disabled={workspaceDisabled}
                        onClick={() => void window.privoraDesktop.openWorkspaceTarget(target.id)}
                      >
                        <TargetIcon target={target} size={16} />
                        <span>{target.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {activeTab === "shortcuts" && (
                <div className="settings-section settings-shortcuts">
                  <ShortcutRow keys="Enter" label="Send or queue follow-up" />
                  <ShortcutRow keys="Shift+Enter" label="New line" />
                  <ShortcutRow keys="Up / Down" label="Current chat prompts" />
                  <ShortcutRow keys="Ctrl+/" label="Open shortcuts" />
                  <ShortcutRow keys="Ctrl+R" label="Reload app" />
                </div>
              )}

              {activeTab === "storage" && (
                <div className="settings-section settings-storage">
                  <div className="settings-storage-summary">
                    <div>
                      <span>Total stored</span>
                      <strong>{storageUsage ? formatBytes(storageUsage.totalBytes) : storageLoading ? "Scanning..." : "Not scanned"}</strong>
                      {storageUsage?.scannedAt ? <small>Scanned {new Date(storageUsage.scannedAt).toLocaleTimeString()}</small> : null}
                    </div>
                    <div className="settings-button-row">
                      <button type="button" className="settings-row-button" disabled={storageLoading || Boolean(storageCleaning)} onClick={() => void refreshStorageUsage()}>
                        <RefreshCw size={15} />
                        <span>{storageLoading ? "Scanning" : "Refresh"}</span>
                      </button>
                      <button
                        type="button"
                        className="settings-row-button"
                        disabled={storageLoading || Boolean(storageCleaning) || !storageUsage?.categories.some((category) => category.safeToClean && category.bytes > 0)}
                        onClick={() => void cleanupStorage(["browser_artifacts", "browser_workflow_history", "browser_cache"], "app_owned")}
                      >
                        <Trash2 size={15} />
                        <span>{storageCleaning === "app_owned" ? "Cleaning" : "Clean app-owned browser storage"}</span>
                      </button>
                    </div>
                  </div>
                  <div className="settings-muted-panel">
                    Cleanup runs in chunks so large artifact folders do not freeze the app. Privora downloads are kept separate because they are user files in your Downloads folder.
                  </div>
                  <div className="settings-storage-grid">
                    {(storageUsage?.categories || []).map((category) => (
                      <div className={clsx("settings-storage-card", category.userFiles && "user-files")} key={category.id}>
                        <div className="settings-storage-card-head">
                          <div>
                            <strong>{category.label}</strong>
                            <span>{category.description}</span>
                          </div>
                          <b>{formatBytes(category.bytes)}</b>
                        </div>
                        <div className="settings-storage-meta">
                          <span>{category.files.toLocaleString()} files</span>
                          <span>{category.directories.toLocaleString()} folders</span>
                          {category.userFiles && <span>User files</span>}
                        </div>
                        {category.path && <code>{category.path}</code>}
                        {category.errors.length > 0 && (
                          <p className="settings-storage-error">{category.errors.slice(0, 2).join(" ")}</p>
                        )}
                        <button
                          type="button"
                          className="settings-row-button"
                          disabled={category.bytes <= 0 || storageLoading || Boolean(storageCleaning)}
                          onClick={() => void cleanupStorage([category.id], category.id)}
                        >
                          <Trash2 size={14} />
                          <span>{storageCleaning === category.id ? "Cleaning" : category.userFiles ? "Clean downloads" : "Clean"}</span>
                        </button>
                      </div>
                    ))}
                    {!storageLoading && !storageUsage && (
                      <div className="settings-muted-panel">Scan storage to see browser artifacts, workflow history, cache, and downloads.</div>
                    )}
                  </div>
                  {storageMessage && <p className="settings-storage-message">{storageMessage}</p>}
                </div>
              )}

              {activeTab === "about" && (
                <div className="settings-section settings-about">
                  <InfoRow label="Version" value={updateStatus?.currentVersion || "Unknown"} />
                  {updateStatus?.latestVersion && <InfoRow label="Latest" value={updateStatus.latestVersion} />}
                  <InfoRow label="Updates" value={formatUpdateState(updateStatus)} />
                  <InfoRow label="Channel" value={formatUpdateChannel(updateStatus)} />
                  {updateStatus?.releaseName && <InfoRow label="Ready update" value={updateStatus.releaseName} />}
                  {updateStatus?.releaseDate && <InfoRow label="Release date" value={updateStatus.releaseDate} />}
                  {(updateStatus?.releaseNotes || updateStatus?.latestReleaseNotes) && (
                    <InfoRow label="Release notes" value={updateStatus.releaseNotes || updateStatus.latestReleaseNotes || ""} />
                  )}
                  {updateStatus?.lastCheckedAt && (
                    <InfoRow label="Last checked" value={new Date(updateStatus.lastCheckedAt).toLocaleString()} />
                  )}
                </div>
              )}
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

function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="shortcut-row">
      <kbd>{keys}</kbd>
      <span>{label}</span>
    </div>
  );
}

function InfoRow({ label, value, code = false }: { label: string; value: string; code?: boolean }) {
  return (
    <div className="settings-info-row">
      <span>{label}</span>
      {code ? <code>{value}</code> : <strong>{value}</strong>}
    </div>
  );
}

const formatUpdateState = (status: UpdateStatus | null) => {
  if (!status) return "Loading";
  if (status.state === "ready") return "Ready to install";
  if (status.state === "checking") return "Checking";
  if (status.state === "downloading") return "Downloading";
  if (status.state === "installing") return "Installing";
  if (status.state === "error") return status.error || "Update failed";
  if (status.state === "unsupported") return status.message || "Unsupported";
  return status.message || "Up to date";
};
const formatUpdateChannel = (status: UpdateStatus | null) => {
  if (!status?.feedUrl) return "Not configured";
  if (status.feedUrl.includes("/win32/x64/stable")) return "Windows x64 stable";
  return "Custom update feed";
};

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

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
};
