import type { DesktopStore } from "../../db/store";
import type { AgentHarnessApi } from "./contracts";

export class HarnessProjectionService {
  constructor(
    private store: DesktopStore,
    private harness: Pick<AgentHarnessApi, "getActiveRun" | "listActiveRuns" | "getTerminalState">,
    private getActiveIds: () => { activeThreadId: string | null; activeWorkspaceId: string | null },
  ) {}

  snapshot() {
    const { activeThreadId, activeWorkspaceId } = this.getActiveIds();
    const snapshot = this.store.snapshot(activeThreadId, activeWorkspaceId);
    snapshot.activeRun = activeThreadId ? this.harness.getActiveRun(activeThreadId) : null;
    snapshot.activeRuns = this.harness.listActiveRuns();
    snapshot.terminal = this.harness.getTerminalState();
    return snapshot;
  }
}

