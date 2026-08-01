import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  CreditCard,
  Database,
  Info,
  KeyRound,
  Keyboard,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Settings as SettingsIcon,
  Sun,
  Trash2,
  User,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AiCreditSummaryRecord, SaveSettingsInput, SettingsRecord, StorageCleanupCategoryId, StorageUsageSnapshot, UpdateStatus, WorkspaceOpenTargetInfo } from "../../shared/types";
import { TargetIcon } from "./AppLauncher";

interface SettingsPanelProps {
  settings: SettingsRecord;
  aiCredits?: AiCreditSummaryRecord;
  updateStatus: UpdateStatus | null;
  workspaceDisabled: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSave: (settings: SaveSettingsInput) => Promise<void> | void;
  initialTab?: SettingsTab;
  onOpenTab?: (tab: SettingsTab) => void;
  className?: string;
}

type SettingsTab = "profile" | "general" | "providers" | "billing" | "workspace" | "storage" | "shortcuts" | "about";

export function SettingsPanel({ settings, aiCredits, open, onOpen, onClose, onOpenTab }: SettingsPanelProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [usageRefreshing, setUsageRefreshing] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const refreshedMenuOpenRef = useRef(false);
  const connected = settings.privoraAccountConnected;
  const accountDisplay = getAccountDisplay(settings, aiCredits);
  const accountLabel = accountDisplay || (connected ? "Privora account connected" : "Sign in to Privora");
  const planLabel = aiCredits?.authenticated ? formatPlan(aiCredits) : connected ? "Account connected" : "Not signed in";
  const creditRows = formatCreditMenuRows(aiCredits);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuOpen) setMenuOpen(false);
      else if (event.key === "Escape" && open) onClose();
      if (event.ctrlKey && event.key === "/") {
        event.preventDefault();
        onOpenTab?.("shortcuts");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, onClose, onOpenTab, open]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      refreshedMenuOpenRef.current = false;
      return;
    }
    if (!connected || refreshedMenuOpenRef.current) return;
    let canceled = false;
    refreshedMenuOpenRef.current = true;
    setUsageRefreshing(true);
    void window.privoraDesktop.refreshAiCredits().finally(() => {
      if (!canceled) setUsageRefreshing(false);
    });
    return () => {
      canceled = true;
    };
  }, [connected, menuOpen]);

  const openTab = (tab: SettingsTab) => {
    setMenuOpen(false);
    setUsageOpen(false);
    onOpenTab?.(tab);
  };

  const startSignIn = async () => {
    setMenuOpen(false);
    await window.privoraDesktop.startPrivoraBrowserAuth();
  };

  return (
    <div className={clsx("settings-panel", menuOpen && "menu-open")} ref={rootRef}>
      {menuOpen && (
        <div className="sidebar-account-menu" role="menu">
          <button
            type="button"
            className={clsx("sidebar-account-menu-row", connected && "muted")}
            disabled={connected}
            onClick={() => void startSignIn()}
          >
            <User size={15} />
            <span>{accountLabel}</span>
          </button>
          <button type="button" className="sidebar-account-menu-row muted" disabled>
            <CreditCard size={15} />
            <span>{planLabel}</span>
          </button>
          <div className="sidebar-account-separator" />
          <button type="button" className="sidebar-account-menu-row" onClick={() => openTab("profile")}>
            <User size={15} />
            <span>Profile</span>
          </button>
          <button type="button" className="sidebar-account-menu-row" onClick={() => openTab("general")}>
            <SettingsIcon size={15} />
            <span>Settings</span>
            <small>Ctrl+,</small>
          </button>
          <div className="sidebar-account-separator" />
          <button
            type="button"
            className={clsx("sidebar-account-menu-row", usageOpen && "active")}
            onClick={() => setUsageOpen((value) => !value)}
            aria-expanded={usageOpen}
          >
            <BarChart3 size={15} />
            <span>Usage remaining</span>
            {usageOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          {usageOpen && (
            <div className="sidebar-usage-submenu">
              {creditRows.map((row) => (
                <div className="sidebar-usage-row" key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
              {aiCredits?.message && (
                <p className="sidebar-usage-message">{aiCredits.message}</p>
              )}
              {!aiCredits?.authenticated && connected && (
                <p className="sidebar-usage-message">Refresh to sync your latest plan and AI credits.</p>
              )}
              <div className="sidebar-usage-actions">
                <button
                  type="button"
                  onClick={() => openTab("billing")}
                >
                  Billing
                </button>
                <button
                  type="button"
                  disabled={!connected || usageRefreshing}
                  onClick={async () => {
                    setUsageRefreshing(true);
                    try {
                      await window.privoraDesktop.refreshAiCredits();
                    } finally {
                      setUsageRefreshing(false);
                    }
                  }}
                >
                  {usageRefreshing ? "Refreshing" : "Refresh"}
                </button>
              </div>
            </div>
          )}
          {connected ? (
            <button
              type="button"
              className="sidebar-account-menu-row"
              onClick={async () => {
                setMenuOpen(false);
                await window.privoraDesktop.signOutPrivora();
              }}
            >
              <LogOut size={15} />
              <span>Log out</span>
            </button>
          ) : (
            <button type="button" className="sidebar-account-menu-row" onClick={() => void startSignIn()}>
              <LogIn size={15} />
              <span>Sign in</span>
            </button>
          )}
        </div>
      )}
      <button className="sidebar-settings-button" onClick={() => setMenuOpen((value) => !value)} title="Settings">
        <SettingsIcon size={16} />
        <span>Settings</span>
      </button>
    </div>
  );
}

export function SettingsScreen({ settings, aiCredits, updateStatus, workspaceDisabled, open, onOpen, onClose, onSave, initialTab = "general", className }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [cliproxyBaseUrl, setCliproxyBaseUrl] = useState(settings.cliproxyBaseUrl);
  const [billingRefreshing, setBillingRefreshing] = useState(false);
  const [billingMessage, setBillingMessage] = useState("");
  const [workspaceTargets, setWorkspaceTargets] = useState<WorkspaceOpenTargetInfo[]>([]);
  const [storageUsage, setStorageUsage] = useState<StorageUsageSnapshot | null>(null);
  const [storageLoading, setStorageLoading] = useState(false);
  const [storageCleaning, setStorageCleaning] = useState<StorageCleanupCategoryId | "app_owned" | null>(null);
  const [storageMessage, setStorageMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [providerSaveError, setProviderSaveError] = useState("");
  const accountDisplay = getAccountDisplay(settings, aiCredits);
  const profileTitle = (settings.privoraAccountConnected ? settings.privoraAccountName : "") || accountDisplay || (settings.privoraAccountConnected ? "Privora account" : "Privora user");
  const profileSubtitle = accountDisplay || (settings.privoraAccountConnected ? "Email sync pending. Refresh or sign in again if it does not appear." : "Connect Privora to show your account email.");

  const saveProviderSettings = async (input: SaveSettingsInput) => {
    setSaving(true);
    setStatus("idle");
    setProviderSaveError("");
    try {
      await onSave(input);
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
              <strong>{activeTab === "profile" ? "Profile" : "Settings"}</strong>
              <SettingsTabButton id="profile" active={activeTab} icon={<User size={15} />} label="Profile" onSelect={setActiveTab} />
              <SettingsTabButton id="general" active={activeTab} icon={<Sun size={15} />} label="General" onSelect={setActiveTab} />
              <SettingsTabButton id="providers" active={activeTab} icon={<KeyRound size={15} />} label="Providers" onSelect={setActiveTab} />
              <SettingsTabButton id="billing" active={activeTab} icon={<CreditCard size={15} />} label="Billing" onSelect={setActiveTab} />
              <SettingsTabButton id="workspace" active={activeTab} icon={<Code2 size={15} />} label="Workspace" onSelect={setActiveTab} />
              <SettingsTabButton id="storage" active={activeTab} icon={<Database size={15} />} label="Storage" onSelect={setActiveTab} />
              <SettingsTabButton id="shortcuts" active={activeTab} icon={<Keyboard size={15} />} label="Shortcuts" onSelect={setActiveTab} />
              <SettingsTabButton id="about" active={activeTab} icon={<Info size={15} />} label="About" onSelect={setActiveTab} />
            </aside>

            <div className="settings-content">
              <div className="settings-modal-header">
                <h2>{tabTitle(activeTab)}</h2>
                <button type="button" className="settings-close-button" title="Close settings" onClick={onClose}>
                  <X size={16} />
                </button>
              </div>

              {activeTab === "general" && (
                <div className="settings-section">
                  <div className="theme-control" aria-label="Theme">
                    {themeOptions.map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          type="button"
                          key={option.id}
                          className={clsx(settings.theme === option.id && "active")}
                          title={option.label}
                          onClick={() => onSave({ theme: option.id })}
                        >
                          <Icon size={16} />
                          <span>{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="settings-row-button settings-toggle-row"
                    onClick={() => onSave({ keepRunningInTray: !settings.keepRunningInTray })}
                  >
                    <span>
                      <strong>Keep Privora running in background</strong>
                      <small>Closing the window hides it to the Windows tray.</small>
                    </span>
                    <span className={settings.keepRunningInTray ? "settings-toggle-pill active" : "settings-toggle-pill"}>
                      {settings.keepRunningInTray ? "On" : "Off"}
                    </span>
                  </button>
                </div>
              )}

              {activeTab === "providers" && (
                <div className="settings-section">
                  <label>
                    CLIProxy base URL
                    <input value={cliproxyBaseUrl} onChange={(event) => setCliproxyBaseUrl(event.target.value)} />
                  </label>
                  <label>
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
                  </label>
                  <label>
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
                  </label>
                  <button
                    className="settings-primary-button"
                    disabled={saving}
                    onClick={async () => {
                      const saved = await saveProviderSettings({
                        cliproxyBaseUrl,
                        ...(geminiApiKey ? { geminiApiKey } : {}),
                        ...(openRouterApiKey ? { openRouterApiKey } : {}),
                      });
                      if (!saved) return;
                      setGeminiApiKey("");
                      setOpenRouterApiKey("");
                    }}
                  >
                    {saving ? "Saving..." : status === "saved" ? (
                      <>
                        <Check size={15} />
                        Saved
                      </>
                    ) : "Save provider settings"}
                  </button>
                  {status === "error" && (
                    <p className="settings-error">{providerSaveError}</p>
                  )}
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

              {activeTab === "profile" && (
                <div className="settings-section profile-page">
                  <div className="profile-avatar">{profileInitials(settings, aiCredits)}</div>
                  <h3>{profileTitle}</h3>
                  <p>{profileSubtitle}</p>
                  <div className="profile-stats">
                    <InfoRow label="Plan" value={formatPlan(aiCredits)} />
                    <InfoRow label="AI credits" value={formatCredits(aiCredits)} />
                    <InfoRow label="Hosted access" value={aiCredits?.hostedAccessDisabled ? "Disabled" : aiCredits?.authenticated ? "Enabled" : "Not connected"} />
                  </div>
                </div>
              )}

              {activeTab === "billing" && (
                <div className="settings-section settings-about">
                  <InfoRow label="Plan" value={formatPlan(aiCredits)} />
                  <InfoRow label="AI credits" value={formatCredits(aiCredits)} />
                  <InfoRow label="Renewal" value={aiCredits?.renewalDate || aiCredits?.resetDate || "Not scheduled"} />
                  <InfoRow label="Hosted access" value={aiCredits?.hostedAccessDisabled ? "Disabled" : aiCredits?.authenticated ? "Enabled" : "Not connected"} />
                  {(accountDisplay || settings.privoraAccountConnected) && (
                    <InfoRow label="Account" value={accountDisplay || "Connected. Email sync pending."} />
                  )}
                  {(billingMessage || aiCredits?.message) && <InfoRow label="Status" value={billingMessage || aiCredits?.message || ""} />}
                  {!settings.privoraAccountConnected && (
                    <div className="settings-muted-panel">
                      Sign in opens in your browser. Privora Desktop stores only the secure account connection result.
                    </div>
                  )}
                  <div className="settings-button-row">
                    {settings.privoraAccountConnected ? (
                      <button
                        type="button"
                        className="settings-row-button"
                        disabled={billingRefreshing}
                        onClick={async () => {
                          setBillingRefreshing(true);
                          try {
                            await window.privoraDesktop.signOutPrivora();
                          } finally {
                            setBillingRefreshing(false);
                          }
                        }}
                      >
                        <Trash2 size={15} />
                        <span>Sign out</span>
                      </button>
                    ) : (
                      <button
                        className="settings-primary-button"
                        disabled={billingRefreshing}
                        onClick={async () => {
                          setBillingRefreshing(true);
                          setBillingMessage("");
                          try {
                            const auth = await window.privoraDesktop.startPrivoraBrowserAuth();
                            setBillingMessage(`Browser sign-in opened. Link expires at ${new Date(auth.expiresAt).toLocaleTimeString()}.`);
                          } catch (error) {
                            setBillingMessage(error instanceof Error ? error.message : "Could not open browser sign-in.");
                          } finally {
                            setBillingRefreshing(false);
                          }
                        }}
                      >
                        {billingRefreshing ? "Opening..." : "Sign in with Privora"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="settings-row-button"
                      disabled={billingRefreshing || !settings.privoraAccountConnected}
                      onClick={async () => {
                        setBillingRefreshing(true);
                        try {
                          await window.privoraDesktop.refreshAiCredits();
                        } finally {
                          setBillingRefreshing(false);
                        }
                      }}
                    >
                      <RefreshCw size={15} />
                      <span>{billingRefreshing ? "Refreshing" : "Refresh"}</span>
                    </button>
                  </div>
                  {aiCredits?.recentUsage?.length ? (
                    <div className="settings-usage-list">
                      {aiCredits.recentUsage.slice(0, 5).map((event) => (
                        <div className="settings-info-row" key={event.id}>
                          <span>{new Date(event.createdAt).toLocaleString()}</span>
                          <strong>{event.creditsCharged.toLocaleString()} credits</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}
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
    <button type="button" className={clsx(active === id && "active")} onClick={() => onSelect(id)}>
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
  if (tab === "profile") return "Profile";
  if (tab === "providers") return "Providers";
  if (tab === "billing") return "Billing";
  if (tab === "workspace") return "Workspace";
  if (tab === "storage") return "Storage";
  if (tab === "shortcuts") return "Shortcuts";
  if (tab === "about") return "About";
  return "General";
};

const getAccountDisplay = (settings: SettingsRecord, credits?: AiCreditSummaryRecord) => {
  if (!settings.privoraAccountConnected) return "";
  return credits?.email || settings.privoraAccountEmail || settings.privoraAccountName || "";
};

const profileInitials = (settings: SettingsRecord, credits?: AiCreditSummaryRecord) => {
  const source = (settings.privoraAccountConnected ? settings.privoraAccountName : "") || getAccountDisplay(settings, credits) || "Privora";
  const parts = source
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || "P";
};

const themeOptions = [
  { id: "system" as const, label: "System", icon: Monitor },
  { id: "light" as const, label: "Light", icon: Sun },
  { id: "dark" as const, label: "Dark", icon: Moon },
];

const formatPlan = (credits?: AiCreditSummaryRecord) => {
  if (!credits?.authenticated) return "Free";
  if (credits.plan === "plus") return "Plus";
  if (credits.plan === "pro") return "Pro";
  return "Free";
};

const formatCredits = (credits?: AiCreditSummaryRecord) => {
  if (!credits?.authenticated) return "No hosted credits";
  return `${credits.monthlyCreditsRemaining.toLocaleString()} monthly + ${credits.topUpCreditsRemaining.toLocaleString()} top-up`;
};

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

const formatPercent = (used: number, total: number) => {
  if (total <= 0) return "0%";
  return `${Math.max(0, Math.min(100, Math.round((used / total) * 100)))}%`;
};

const formatCreditMenuRows = (credits?: AiCreditSummaryRecord) => {
  if (!credits?.authenticated) {
    return [
      { label: "Plan", value: "Free" },
      { label: "Monthly", value: "0 AI credits" },
    ];
  }

  const remaining = credits.monthlyCreditsRemaining + credits.topUpCreditsRemaining;
  return [
    { label: "Plan", value: formatPlan(credits) },
    { label: "Monthly", value: `${remaining.toLocaleString()} left` },
    { label: "Used", value: `${credits.monthlyCreditsUsed.toLocaleString()} (${formatPercent(credits.monthlyCreditsUsed, credits.monthlyCreditAllowance)})` },
    { label: "Daily cap", value: credits.dailyCreditCap > 0 ? `${credits.dailyCreditsUsed.toLocaleString()} / ${credits.dailyCreditCap.toLocaleString()}` : "BYOK only" },
    { label: "Reset", value: credits.resetDate || credits.renewalDate ? new Date(credits.resetDate || credits.renewalDate || "").toLocaleDateString() : "Not scheduled" },
  ];
};
