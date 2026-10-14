import { Globe2, PanelRightClose } from "lucide-react";
import type { WorkspaceRecord } from "../../../shared/types";
import { BrowserPanel } from "../browser/BrowserPanel";

export function SecurityBrowserPane({ workspace, hidden, onClose }: { workspace: WorkspaceRecord | null; hidden: boolean; onClose: () => void }) {
  return (
    <aside className="workspace-ide" aria-label="Security browser">
      <header className="workspace-ide-topbar">
        <div className="workspace-mode-tabs"><button type="button" className="active" aria-label="Browser panel"><Globe2 size={15} /><span>Browser</span></button></div>
        <div className="workspace-ide-mode-spacer" />
        <div className="workspace-ide-actions"><button type="button" className="workspace-icon-button" title="Hide browser" aria-label="Hide browser" onClick={onClose}><PanelRightClose size={16} /></button></div>
      </header>
      <BrowserPanel workspace={workspace} active={!hidden} hidden={hidden} />
    </aside>
  );
}
