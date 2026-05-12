import type { WebDevFileRecord } from "../../../lib/db";
import type { WebDevToolResultEntry } from "./providerMessages";

const MUTATING_TOOLS = new Set([
  "webdev_write_file",
  "webdev_patch_file",
  "webdev_delete_path",
  "webdev_rename_path",
  "webdev_create_project",
]);

const hasFile = (files: WebDevFileRecord[], path: string) =>
  files.some(file => file.status !== "deleted" && file.path === path && file.content.trim().length > 0);

const hasMeaningfulSourceFile = (files: WebDevFileRecord[]) =>
  files.some(file =>
    file.status !== "deleted" &&
    file.path.startsWith("src/") &&
    [".tsx", ".ts", ".css"].some(extension => file.path.endsWith(extension)) &&
    file.content.trim().split(/\r?\n/).length >= 3
  );

export const evaluateWebDevFinish = ({
  files,
  startedEmpty,
  toolResults,
}: {
  files: WebDevFileRecord[];
  startedEmpty: boolean;
  toolResults: WebDevToolResultEntry[];
}) => {
  const hadSuccessfulMutation = toolResults.some(result => MUTATING_TOOLS.has(result.name) && result.response.success);
  if (!startedEmpty || !hadSuccessfulMutation) return { accepted: true };

  const missing = [
    !hasFile(files, "package.json") ? "package.json" : "",
    !hasFile(files, "index.html") ? "index.html" : "",
    !hasFile(files, "src/main.tsx") ? "src/main.tsx" : "",
    !hasFile(files, "src/App.tsx") ? "src/App.tsx" : "",
    !hasMeaningfulSourceFile(files) ? "at least one meaningful src file" : "",
  ].filter(Boolean);

  if (missing.length === 0) return { accepted: true };

  return {
    accepted: false,
    reason: `The project started empty and is not runnable yet. Missing: ${missing.join(", ")}. Continue creating the required files, then finish.`,
  };
};
