import {
  BarChart3,
  Check,
  ChevronRight,
  Code2,
  CreditCard,
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
import type { AiCreditSummaryRecord, SaveSettingsInput, SettingsRecord, UpdateStatus, WorkspaceOpenTargetInfo } from "../../shared/types";
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

type SettingsTab = "profile" | "general" | "providers" | "billing" | "workspace" | "shortcuts" | "about";

export function SettingsPanel({ settings, aiCredits, open, onOpen, onClose, onOpenTab }: SettingsPanelProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const connected = settings.privoraAccountConnected;
  const accountDisplay = getAccountDisplay(settings, aiCredits);
  const accountLabel = accountDisplay || (connected ? "Privora account connected" : "Sign in to Privora");
  const planLabel = aiCredits?.authenticated ? formatPlan(aiCredits) : connected ? "Free BYOK" : "Not signed in";

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

  const openTab = (tab: SettingsTab) => {
    setMenuOpen(false);
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
            <SettingsIcon size={15} />
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
          <button type="button" className="sidebar-account-menu-row" onClick={() => openTab("billing")}>
            <BarChart3 size={15} />
            <span>Usage remaining</span>
            <ChevronRight size={15} />
          </button>
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
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const accountDisplay = getAccountDisplay(settings, aiCredits);
  const profileTitle = settings.privoraAccountName || accountDisplay || (settings.privoraAccountConnected ? "Privora account" : "Privora user");
  const profileSubtitle = accountDisplay || (settings.privoraAccountConnected ? "Email sync pending. Refresh or sign in again if it does not appear." : "Connect Privora to show your account email.");

  const saveProviderSettings = async (input: SaveSettingsInput) => {
    setSaving(true);
    setStatus("idle");
    try {
      await onSave(input);
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1800);
      return true;
    } catch (error) {
      console.error(error);
      setStatus("error");
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
                    <p className="settings-error">Could not save API keys because OS-backed secret storage is unavailable.</p>
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
                  <ShortcutRow keys="Up / Down" label="Prompt history" />
                  <ShortcutRow keys="Ctrl+Alt+H" label="Search prompt history" />
                  <ShortcutRow keys="Ctrl+/" label="Open shortcuts" />
                  <ShortcutRow keys="Ctrl+R" label="Reload app" />
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
  if (tab === "shortcuts") return "Shortcuts";
  if (tab === "about") return "About";
  return "General";
};

const getAccountDisplay = (settings: SettingsRecord, credits?: AiCreditSummaryRecord) => {
  return credits?.email || settings.privoraAccountEmail || settings.privoraAccountName || "";
};

const profileInitials = (settings: SettingsRecord, credits?: AiCreditSummaryRecord) => {
  const source = settings.privoraAccountName || getAccountDisplay(settings, credits) || "Privora";
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
  if (!credits?.authenticated) return "Free BYOK";
  if (credits.plan === "plus") return "Plus";
  if (credits.plan === "pro") return "Pro";
  return "Free BYOK";
};

const formatCredits = (credits?: AiCreditSummaryRecord) => {
  if (!credits?.authenticated) return "BYOK only";
  return `${credits.monthlyCreditsRemaining.toLocaleString()} monthly + ${credits.topUpCreditsRemaining.toLocaleString()} top-up`;
};
