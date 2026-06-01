import { describe, expect, it } from "vitest";
import { buildSidebarRows } from "../src/renderer/sidebarRows";
import { buildFilteredWorkspaceRows, buildWorkspaceTreeRows } from "../src/renderer/workspaceTreeRows";
import type { ThreadRecord, WorkspaceDirectoryEntry, WorkspaceDirectoryListing, WorkspaceRecord } from "../src/shared/types";

describe("sidebar virtual rows", () => {
  it("flattens expanded and collapsed projects", () => {
    const workspaces = [workspace("w1", "One"), workspace("w2", "Two")];
    const threads = [thread("t1", "w1", "Alpha"), thread("t2", "w1", "Beta"), thread("t3", "w2", "Gamma")];
    const rows = buildSidebarRows({
      threads,
      workspaces,
      collapsedGroups: new Set(["w2"]),
      query: "",
    });

    expect(rows.map((row) => row.key)).toEqual([
      "project:w1",
      "thread:t1",
      "thread:t2",
      "project:w2",
    ]);
  });

  it("preserves project grouping and empty rows when searching", () => {
    const rows = buildSidebarRows({
      threads: [thread("t1", "w1", "Fix login"), thread("t2", "w2", "Write docs")],
      workspaces: [workspace("w1", "App"), workspace("w2", "Docs")],
      collapsedGroups: new Set(),
      query: "fix",
    });

    expect(rows.map((row) => row.type)).toEqual(["project", "thread", "project", "empty-project"]);
    expect(rows[1]).toMatchObject({ type: "thread", workspaceId: "w1" });
    expect(rows[3]).toMatchObject({ type: "empty-project", workspaceId: "w2" });
  });
});

describe("workspace tree virtual rows", () => {
  it("flattens nested expanded folders", () => {
    const listings = {
      ".": listing(".", [directory("src"), file("README.md")]),
      src: listing("src", [file("src/index.ts")]),
    };
    const rows = buildWorkspaceTreeRows({
      listings,
      expanded: new Set([".", "src"]),
      loadingFolders: new Set(),
    });

    expect(rows.map((row) => row.key)).toEqual([
      "entry:src",
      "entry:src/index.ts",
      "entry:README.md",
    ]);
  });

  it("shows loading rows for expanded pending folders", () => {
    const rows = buildWorkspaceTreeRows({
      listings: { ".": listing(".", [directory("node_modules")]) },
      expanded: new Set([".", "node_modules"]),
      loadingFolders: new Set(["node_modules"]),
    });

    expect(rows).toMatchObject([
      { type: "entry", key: "entry:node_modules", depth: 0 },
      { type: "loading", key: "loading:node_modules", depth: 1 },
    ]);
  });

  it("filters only currently loaded entries", () => {
    const rows = buildFilteredWorkspaceRows([file("src/App.tsx"), directory("src/components")]);

    expect(rows.map((row) => row.key)).toEqual([
      "filtered:src/App.tsx",
      "filtered:src/components",
    ]);
  });

  it("returns an empty filtered row when no loaded entries match", () => {
    expect(buildFilteredWorkspaceRows([])).toEqual([
      { type: "empty", key: "empty:filtered", message: "No loaded files match." },
    ]);
  });
});

const workspace = (id: string, name: string): WorkspaceRecord => ({
  id,
  name,
  path: `/tmp/${name}`,
  lastOpenedAt: 1,
});

const thread = (id: string, workspaceId: string, title: string): ThreadRecord => ({
  id,
  workspaceId,
  title,
  createdAt: 1,
  updatedAt: 1,
  starred: false,
});

const listing = (path: string, entries: WorkspaceDirectoryEntry[]): WorkspaceDirectoryListing => ({ path, entries });

const directory = (path: string): WorkspaceDirectoryEntry => ({
  name: path.split("/").pop() || path,
  path,
  kind: "directory",
  sizeBytes: 0,
  modifiedAtMs: 1,
});

const file = (path: string): WorkspaceDirectoryEntry => ({
  name: path.split("/").pop() || path,
  path,
  kind: "file",
  sizeBytes: 10,
  modifiedAtMs: 1,
});
