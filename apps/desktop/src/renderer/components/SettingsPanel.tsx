import { Check, KeyRound, Moon, Sun, Trash2 } from "lucide-react";
import { useState } from "react";
import type { SaveSettingsInput, SettingsRecord } from "../../shared/types";

interface SettingsPanelProps {
  settings: SettingsRecord;
  onSave: (settings: SaveSettingsInput) => Promise<void> | void;
}

export function SettingsPanel({ settings, onSave }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
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
      window.setTimeout(() => setStatus("idle"), 1600);
      return true;
    } catch {
      setStatus("error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-panel">
      <button onClick={() => setOpen((value) => !value)}>
        <KeyRound size={15} />
        Providers
      </button>
      <button onClick={() => onSave({ theme: settings.theme === "dark" ? "light" : "dark" })}>
        {settings.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        Theme
      </button>
      {open && (
        <div className="settings-popover">
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
              setOpen(false);
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
    </div>
  );
}
