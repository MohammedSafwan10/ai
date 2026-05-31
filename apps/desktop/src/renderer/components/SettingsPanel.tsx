import { Check, Code2, FolderOpen, GitBranch, KeyRound, Keyboard, Monitor, Moon, Settings, Sun, TerminalSquare, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { useEffect, useState, type ReactNode } from "react";
import type { SaveSettingsInput, SettingsRecord, WorkspaceOpenTarget } from "../../shared/types";

interface SettingsPanelProps {
  settings: SettingsRecord;
  workspaceDisabled: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSave: (settings: SaveSettingsInput) => Promise<void> | void;
}

type SettingsTab = "general" | "providers" | "workspace" | "shortcuts";

const workspaceTargets: Array<{ id: WorkspaceOpenTarget; label: string; icon: typeof Code2 }> = [
  { id: "vscode", label: "VS Code", icon: Code2 },
  { id: "file_explorer", label: "File Explorer", icon: FolderOpen },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "git_bash", label: "Git Bash", icon: GitBranch },
];

export function SettingsPanel({ open, onOpen, onClose }: SettingsPanelProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) onClose();
      if (event.ctrlKey && event.key === "/") {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onOpen, open]);

  return (
    <div className="settings-panel">
      <button className="sidebar-settings-button" onClick={onOpen} title="Settings">
        <Settings size={16} />
        <span>Settings</span>
      </button>
    </div>
  );
}

export function SettingsScreen({ settings, workspaceDisabled, open, onOpen, onClose, onSave }: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [cliproxyBaseUrl, setCliproxyBaseUrl] = useState(settings.cliproxyBaseUrl);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

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

  return (
    <div className="settings-screen">
      <section className="settings-screen-shell" aria-label="Settings">
            <aside className="settings-tabs">
              <strong>Settings</strong>
              <SettingsTabButton id="general" active={activeTab} icon={<Sun size={15} />} label="General" onSelect={setActiveTab} />
              <SettingsTabButton id="providers" active={activeTab} icon={<KeyRound size={15} />} label="Providers" onSelect={setActiveTab} />
              <SettingsTabButton id="workspace" active={activeTab} icon={<Code2 size={15} />} label="Workspace" onSelect={setActiveTab} />
              <SettingsTabButton id="shortcuts" active={activeTab} icon={<Keyboard size={15} />} label="Shortcuts" onSelect={setActiveTab} />
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
                    const Icon = target.icon;
                    return (
                      <button
                        type="button"
                        key={target.id}
                        disabled={workspaceDisabled}
                        onClick={() => void window.privoraDesktop.openWorkspaceTarget(target.id)}
                      >
                        <Icon size={16} />
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

const tabTitle = (tab: SettingsTab) => {
  if (tab === "providers") return "Providers";
  if (tab === "workspace") return "Workspace";
  if (tab === "shortcuts") return "Shortcuts";
  return "General";
};

const themeOptions = [
  { id: "system" as const, label: "System", icon: Monitor },
  { id: "light" as const, label: "Light", icon: Sun },
  { id: "dark" as const, label: "Dark", icon: Moon },
];
