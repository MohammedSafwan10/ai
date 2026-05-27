import { ChevronDown, Code2, FolderOpen, GitBranch, TerminalSquare } from "lucide-react";
import { useState } from "react";
import type { WorkspaceOpenTarget } from "../../shared/types";

const targets: Array<{ id: WorkspaceOpenTarget; label: string; icon: typeof Code2 }> = [
  { id: "vscode", label: "VS Code", icon: Code2 },
  { id: "file_explorer", label: "File Explorer", icon: FolderOpen },
  { id: "terminal", label: "Terminal", icon: TerminalSquare },
  { id: "git_bash", label: "Git Bash", icon: GitBranch },
];

export function AppLauncher({ disabled }: { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="app-launcher">
      <button disabled={disabled} onClick={() => setOpen((value) => !value)} title="Open workspace in another app">
        <Code2 size={16} />
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="floating-menu launcher-menu">
          {targets.map((target) => {
            const Icon = target.icon;
            return (
              <button
                key={target.id}
                type="button"
                onClick={() => {
                  void window.privoraDesktop.openWorkspaceTarget(target.id);
                  setOpen(false);
                }}
              >
                <Icon size={15} />
                <span>{target.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
