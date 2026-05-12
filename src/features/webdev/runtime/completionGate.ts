import type { WebDevBuildPlanRecord, WebDevFileRecord } from "../../../lib/db";
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

const activeFiles = (files: WebDevFileRecord[]) => files.filter(file => file.status !== "deleted");

const hasReactRouterDependency = (files: WebDevFileRecord[]) => {
  const packageFile = activeFiles(files).find(file => file.path === "package.json");
  if (!packageFile) return false;
  try {
    const parsed = JSON.parse(packageFile.content);
    return Boolean(parsed?.dependencies?.["react-router-dom"] || parsed?.devDependencies?.["react-router-dom"]);
  } catch {
    return packageFile.content.includes("react-router-dom");
  }
};

const hasRouterSetup = (files: WebDevFileRecord[]) =>
  activeFiles(files).some(file =>
    /\.(tsx|jsx|ts|js)$/.test(file.path) &&
    file.content.includes("react-router-dom") &&
    /\b(BrowserRouter|HashRouter|Routes|Route|createBrowserRouter|RouterProvider)\b/.test(file.content)
  );

const pageFiles = (files: WebDevFileRecord[]) =>
  activeFiles(files).filter(file => /^src\/pages\/.+\.(tsx|jsx)$/.test(file.path) && file.content.trim().split(/\r?\n/).length >= 3);

const hasRouteNavigation = (files: WebDevFileRecord[]) =>
  activeFiles(files).some(file =>
    /\.(tsx|jsx|ts|js)$/.test(file.path) &&
    (/\b(Link|NavLink|useNavigate)\b/.test(file.content) || /href=["']\/[^"']+["']/.test(file.content))
  );

const componentFiles = (files: WebDevFileRecord[]) =>
  activeFiles(files).filter(file => /^src\/components\/(?!ui\/).+\.(tsx|jsx)$/.test(file.path) && file.content.trim().split(/\r?\n/).length >= 5);

const uiPrimitiveFiles = (files: WebDevFileRecord[]) =>
  activeFiles(files).filter(file => /^src\/components\/ui\/.+\.(tsx|jsx)$/.test(file.path) && file.content.trim().split(/\r?\n/).length >= 5);

const hasCnUtility = (files: WebDevFileRecord[]) =>
  activeFiles(files).some(file =>
    file.path === "src/lib/utils.ts" &&
    /\bcn\s*\(/.test(file.content) &&
    (file.content.includes("clsx") || file.content.includes("ClassValue")) &&
    (file.content.includes("twMerge") || file.content.includes("tailwind-merge"))
  );

const hasPackageDependency = (files: WebDevFileRecord[], dependency: string) => {
  const packageFile = activeFiles(files).find(file => file.path === "package.json");
  if (!packageFile) return false;
  try {
    const parsed = JSON.parse(packageFile.content);
    return Boolean(parsed?.dependencies?.[dependency] || parsed?.devDependencies?.[dependency]);
  } catch {
    return packageFile.content.includes(`"${dependency}"`);
  }
};

const hasTailwindSetup = (files: WebDevFileRecord[]) =>
  hasPackageDependency(files, "tailwindcss") &&
  (
    hasPackageDependency(files, "@tailwindcss/vite") ||
    activeFiles(files).some(file => /^vite\.config\.(ts|js|mts|mjs)$/.test(file.path) && file.content.includes("@tailwindcss/vite"))
  ) &&
  activeFiles(files).some(file => file.path.endsWith(".css") && /@import\s+["']tailwindcss["']/.test(file.content));

const hasStylesheetOrTheme = (files: WebDevFileRecord[]) =>
  activeFiles(files).some(file =>
    file.path.endsWith(".css") &&
    (
      /@import\s+["']tailwindcss["']/.test(file.content) ||
      file.content.includes(":root") ||
      file.content.includes("@media") ||
      file.content.trim().split(/\r?\n/).length >= 20
    )
  );

const hasResponsiveDesign = (files: WebDevFileRecord[]) =>
  activeFiles(files).some(file =>
    /\.(tsx|jsx|css)$/.test(file.path) &&
    (
      /\b(sm|md|lg|xl|2xl):[A-Za-z0-9_-]/.test(file.content) ||
      file.content.includes("@media") ||
      file.content.includes("clamp(") ||
      file.content.includes("grid-template-columns") ||
      file.content.includes("minmax(")
    )
  );

const hasInteractionOrState = (files: WebDevFileRecord[]) =>
  activeFiles(files).some(file =>
    /\.(tsx|jsx|ts|js)$/.test(file.path) &&
    /\b(useState|useReducer|onClick|onSubmit|onChange|disabled|aria-|role=|loading|empty|error)\b/.test(file.content)
  );

const isNonTrivialPlannedBuild = (buildPlan?: WebDevBuildPlanRecord) =>
  Boolean(
    buildPlan &&
    (
      buildPlan.componentStrategy === "shadcn-local" ||
      buildPlan.routingRequired ||
      (buildPlan.primaryScreens?.length || 0) > 1 ||
      (buildPlan.pages?.length || 0) > 1 ||
      (buildPlan.qualityChecklist?.length || 0) > 0
    )
  );

export const evaluateWebDevFinish = ({
  files,
  startedEmpty,
  toolResults,
  buildPlan,
}: {
  files: WebDevFileRecord[];
  startedEmpty: boolean;
  toolResults: WebDevToolResultEntry[];
  buildPlan?: WebDevBuildPlanRecord;
}) => {
  const hadSuccessfulMutation = toolResults.some(result => MUTATING_TOOLS.has(result.name) && result.response.success);
  if (!hadSuccessfulMutation) return { accepted: true };

  const missing = startedEmpty
    ? [
        !hasFile(files, "package.json") ? "package.json" : "",
        !hasFile(files, "index.html") ? "index.html" : "",
        !hasFile(files, "src/main.tsx") ? "src/main.tsx" : "",
        !hasFile(files, "src/App.tsx") ? "src/App.tsx" : "",
        !hasMeaningfulSourceFile(files) ? "at least one meaningful src file" : "",
      ].filter(Boolean)
    : [];

  if (buildPlan?.routingRequired) {
    if (!hasReactRouterDependency(files)) missing.push("react-router-dom dependency in package.json");
    if (!hasRouterSetup(files)) missing.push("React Router setup with routes");
    if (pageFiles(files).length < 2) missing.push("at least two route page files under src/pages");
    if (!hasRouteNavigation(files)) missing.push("navigation between routes");
  }

  if (isNonTrivialPlannedBuild(buildPlan)) {
    if (componentFiles(files).length === 0) missing.push("focused product components under src/components");
    if (!hasStylesheetOrTheme(files)) missing.push("a real stylesheet or Tailwind theme");
    if (!hasResponsiveDesign(files)) missing.push("responsive layout behavior");
    if (!hasInteractionOrState(files)) missing.push("at least one meaningful interaction or UI state");
  }

  if (buildPlan?.componentStrategy === "shadcn-local") {
    if (!hasTailwindSetup(files)) missing.push("Tailwind v4 Vite setup");
    if (!hasCnUtility(files)) missing.push("src/lib/utils.ts cn utility");
    if (uiPrimitiveFiles(files).length === 0) missing.push("local shadcn-style primitives under src/components/ui");
  }

  if (missing.length === 0) return { accepted: true };

  return {
    accepted: false,
    reason: startedEmpty
      ? `The project started empty and is not runnable yet. Missing: ${missing.join(", ")}. Continue creating the required files, then finish.`
      : `The current build plan is not complete yet. Missing: ${missing.join(", ")}. Continue updating the app, then finish.`,
  };
};
