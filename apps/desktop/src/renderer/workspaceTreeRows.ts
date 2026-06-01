import type { WorkspaceDirectoryEntry, WorkspaceDirectoryListing } from "../shared/types";

export type WorkspaceTreeVirtualRow =
  | { type: "entry"; key: string; entry: WorkspaceDirectoryEntry; depth: number }
  | { type: "filtered-entry"; key: string; entry: WorkspaceDirectoryEntry }
  | { type: "loading"; key: string; path: string; depth: number }
  | { type: "empty"; key: string; message: string };

export const buildWorkspaceTreeRows = ({
  rootPath = ".",
  listings,
  expanded,
  loadingFolders,
}: {
  rootPath?: string;
  listings: Record<string, WorkspaceDirectoryListing>;
  expanded: Set<string>;
  loadingFolders: Set<string>;
}): WorkspaceTreeVirtualRow[] => {
  const rows: WorkspaceTreeVirtualRow[] = [];
  appendDirectoryRows(rows, rootPath, 0, listings, expanded, loadingFolders);
  return rows;
};

export const buildFilteredWorkspaceRows = (entries: WorkspaceDirectoryEntry[]): WorkspaceTreeVirtualRow[] => {
  if (entries.length === 0) return [{ type: "empty", key: "empty:filtered", message: "No loaded files match." }];
  return entries.map((entry) => ({ type: "filtered-entry", key: `filtered:${entry.path}`, entry }));
};

const appendDirectoryRows = (
  rows: WorkspaceTreeVirtualRow[],
  path: string,
  depth: number,
  listings: Record<string, WorkspaceDirectoryListing>,
  expanded: Set<string>,
  loadingFolders: Set<string>,
) => {
  const listing = listings[path];
  if (!listing) {
    rows.push({ type: "loading", key: `loading:${path}`, path, depth });
    return;
  }
  listing.entries.forEach((entry) => {
    rows.push({ type: "entry", key: `entry:${entry.path}`, entry, depth });
    if (entry.kind !== "directory" || !expanded.has(entry.path)) return;
    if (loadingFolders.has(entry.path)) {
      rows.push({ type: "loading", key: `loading:${entry.path}`, path: entry.path, depth: depth + 1 });
      return;
    }
    appendDirectoryRows(rows, entry.path, depth + 1, listings, expanded, loadingFolders);
  });
};
