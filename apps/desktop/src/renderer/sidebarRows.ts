import type { ThreadRecord, WorkspaceRecord } from "../shared/types";

export type SidebarVirtualRow =
  | { type: "project"; key: string; workspace: WorkspaceRecord; threadCount: number }
  | { type: "thread"; key: string; workspaceId: string; thread: ThreadRecord }
  | { type: "empty-project"; key: string; workspaceId: string };

export const buildSidebarRows = ({
  threads,
  workspaces,
  collapsedGroups,
  query,
}: {
  threads: ThreadRecord[];
  workspaces: WorkspaceRecord[];
  collapsedGroups: Set<string>;
  query: string;
}): SidebarVirtualRow[] => {
  const needle = query.trim().toLowerCase();
  const visibleThreads = needle
    ? threads.filter((thread) => thread.title.toLowerCase().includes(needle))
    : threads;
  const threadsByWorkspace = new Map<string, ThreadRecord[]>();
  visibleThreads.forEach((thread) => {
    if (!thread.workspaceId) return;
    const group = threadsByWorkspace.get(thread.workspaceId) || [];
    group.push(thread);
    threadsByWorkspace.set(thread.workspaceId, group);
  });

  return workspaces.flatMap((workspace) => {
    const workspaceThreads = threadsByWorkspace.get(workspace.id) || [];
    const rows: SidebarVirtualRow[] = [{
      type: "project",
      key: `project:${workspace.id}`,
      workspace,
      threadCount: workspaceThreads.length,
    }];
    if (collapsedGroups.has(workspace.id)) return rows;
    if (workspaceThreads.length === 0) {
      rows.push({ type: "empty-project", key: `empty:${workspace.id}`, workspaceId: workspace.id });
      return rows;
    }
    workspaceThreads.forEach((thread) => {
      rows.push({ type: "thread", key: `thread:${thread.id}`, workspaceId: workspace.id, thread });
    });
    return rows;
  });
};
