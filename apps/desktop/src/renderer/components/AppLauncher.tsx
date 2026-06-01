import { Bot, ChevronDown, Code2, FolderOpen, Hammer, TerminalSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { WorkspaceOpenTargetInfo } from "../../shared/types";

export function AppLauncher({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<WorkspaceOpenTargetInfo[]>([]);
  const defaultTarget = useMemo(
    () => targets.find((target) => target.isDefault) || targets[0] || fallbackTarget,
    [targets],
  );

  useEffect(() => {
    let alive = true;
    const refreshTargets = () => window.privoraDesktop.listWorkspaceOpenTargets()
      .then((items) => {
        if (alive) setTargets(items);
      })
      .catch(() => {
        if (alive) setTargets([fallbackTarget]);
      });
    void refreshTargets();
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <div className="app-launcher">
      <button
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        title={`Open workspace in ${defaultTarget.label}`}
      >
        <TargetIcon target={defaultTarget} size={18} />
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="floating-menu launcher-menu">
          {targets.map((target) => {
            return (
              <button
                key={target.id}
                type="button"
                onClick={() => {
                  void window.privoraDesktop.openWorkspaceTarget(target.id);
                  setOpen(false);
                }}
              >
                <TargetIcon target={target} size={18} />
                <span>{target.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TargetIcon({ target, size }: { target: Pick<WorkspaceOpenTargetInfo, "icon" | "iconDataUrl">; size: number }) {
  if (target.iconDataUrl) {
    return <img className="native-app-icon" src={target.iconDataUrl} width={size} height={size} alt="" />;
  }
  const Icon = iconForTarget(target);
  return <Icon size={size} />;
}

export const iconForTarget = (target: Pick<WorkspaceOpenTargetInfo, "icon">) => {
  if (target.icon === "vscode") return Code2;
  if (target.icon === "terminal") return TerminalSquare;
  if (target.icon === "xcode") return Hammer;
  if (target.icon === "android_studio") return Bot;
  return FolderOpen;
};

const fallbackTarget: WorkspaceOpenTargetInfo = {
  id: "file_explorer",
  label: "Files",
  icon: "finder",
  platform: "darwin",
  isDefault: true,
};
