import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { app, nativeImage, shell } from "electron";
import type { WorkspaceOpenTarget, WorkspaceOpenTargetInfo } from "../../shared/types";

interface MacAppInfo {
  appPath: string;
  name: string;
  bundleId?: string;
  category?: string;
  iconFile?: string;
  iconName?: string;
  documentTypes?: Array<{
    LSItemContentTypes?: string[];
    CFBundleTypeExtensions?: string[];
  }>;
}

export const listWorkspaceOpenTargets = async (): Promise<WorkspaceOpenTargetInfo[]> => {
  const platform = process.platform;
  if (platform === "darwin") return macTargets();
  if (platform === "win32") return windowsTargets();
  return linuxTargets();
};

export const openWorkspaceTarget = async (target: WorkspaceOpenTarget, workspacePath: string) => {
  if (target === "file_explorer") {
    await shell.openPath(workspacePath);
    return;
  }

  if (process.platform === "darwin") {
    await openMacTarget(target, workspacePath);
    return;
  }

  if (process.platform === "win32") {
    await openWindowsTarget(target, workspacePath);
    return;
  }

  openLinuxTarget(target, workspacePath);
};

const macTargets = async (): Promise<WorkspaceOpenTargetInfo[]> => {
  const targets: WorkspaceOpenTargetInfo[] = [
    await nativeTarget("file_explorer", "Finder", "finder", "/System/Library/CoreServices/Finder.app"),
    await nativeTarget("terminal", "Terminal", "terminal", "/System/Applications/Utilities/Terminal.app"),
  ];
  const apps = await discoverMacApps();
  for (const item of apps) {
    if (!shouldShowMacApp(item)) continue;
    targets.push(await nativeTarget(macAppId(item.appPath), item.name, inferredIcon(item), item.appPath, isVsCode(item)));
  }
  return ensureDefault(sortTargets(dedupeTargets(targets)));
};

const windowsTargets = async (): Promise<WorkspaceOpenTargetInfo[]> => {
  const targets: WorkspaceOpenTargetInfo[] = [
    target("file_explorer", "File Explorer", "finder"),
  ];
  if (await commandExists("code")) targets.push(target("vscode", "VS Code", "vscode", true));
  targets.push(target("terminal", await commandExists("wt") ? "Terminal" : "PowerShell", "terminal"));
  if (await exists(path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "git-bash.exe"))) {
    targets.push(target("git_bash", "Git Bash", "terminal"));
  }
  return ensureDefault(targets);
};

const linuxTargets = async (): Promise<WorkspaceOpenTargetInfo[]> => {
  const targets: WorkspaceOpenTargetInfo[] = [
    target("file_explorer", "Files", "finder"),
  ];
  if (await commandExists("code")) targets.push(target("vscode", "VS Code", "vscode", true));
  if (await commandExists("x-terminal-emulator")) targets.push(target("terminal", "Terminal", "terminal"));
  return ensureDefault(targets);
};

const openMacTarget = async (targetId: WorkspaceOpenTarget, workspacePath: string) => {
  if (targetId === "terminal") {
    spawnDetached("open", ["-a", "Terminal", workspacePath]);
    return;
  }
  if (!targetId.startsWith("mac-app:")) return;
  const appPath = decodeMacAppId(targetId);
  if (!appPath || !isAllowedMacAppPath(appPath) || !(await exists(appPath))) return;
  spawnDetached("open", ["-a", appPath, workspacePath]);
};

const openWindowsTarget = async (target: WorkspaceOpenTarget, workspacePath: string) => {
  if (target === "vscode") {
    spawnDetached("cmd.exe", ["/c", "start", "", "code", workspacePath]);
    return;
  }
  if (target === "terminal") {
    if (await commandExists("wt")) {
      spawnDetached("cmd.exe", ["/c", "start", "", "wt.exe", "-d", workspacePath]);
      return;
    }
    spawnDetached("powershell.exe", ["-NoExit", "-Command", "Set-Location", "-LiteralPath", workspacePath]);
    return;
  }
  if (target === "git_bash") {
    const gitBash = path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "git-bash.exe");
    spawnDetached("cmd.exe", ["/c", "start", "", gitBash, `--cd=${workspacePath}`]);
  }
};

const openLinuxTarget = (target: WorkspaceOpenTarget, workspacePath: string) => {
  if (target === "vscode") {
    spawnDetached("code", [workspacePath]);
    return;
  }
  if (target === "terminal") {
    spawnDetached("x-terminal-emulator", ["--working-directory", workspacePath]);
  }
};

const discoverMacApps = async () => {
  const roots = [
    "/Applications",
    "/System/Applications",
    path.join(homedir(), "Applications"),
  ];
  const appPaths = (await Promise.all(roots.map((root) => findMacApps(root, 2)))).flat();
  const apps = await Promise.all(appPaths.map(readMacAppInfo));
  return apps.filter((item): item is MacAppInfo => Boolean(item));
};

const findMacApps = async (root: string, depth: number): Promise<string[]> => {
  if (depth < 0 || !(await exists(root))) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const found: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.name.endsWith(".app")) {
      found.push(fullPath);
      continue;
    }
    found.push(...await findMacApps(fullPath, depth - 1));
  }
  return found;
};

const readMacAppInfo = async (appPath: string): Promise<MacAppInfo | null> => {
  const plistPath = path.join(appPath, "Contents", "Info.plist");
  if (!(await exists(plistPath))) return null;
  const parsed = await plutilJson(plistPath);
  if (!parsed) return null;
  const name = String(parsed.CFBundleDisplayName || parsed.CFBundleName || path.basename(appPath, ".app"));
  return {
    appPath,
    name,
    bundleId: typeof parsed.CFBundleIdentifier === "string" ? parsed.CFBundleIdentifier : undefined,
    category: typeof parsed.LSApplicationCategoryType === "string" ? parsed.LSApplicationCategoryType : undefined,
    iconFile: typeof parsed.CFBundleIconFile === "string" ? parsed.CFBundleIconFile : undefined,
    iconName: typeof parsed.CFBundleIconName === "string" ? parsed.CFBundleIconName : undefined,
    documentTypes: Array.isArray(parsed.CFBundleDocumentTypes) ? parsed.CFBundleDocumentTypes : [],
  };
};

const plutilJson = (plistPath: string) => new Promise<Record<string, any> | null>((resolve) => {
  const child = spawn("/usr/bin/plutil", ["-convert", "json", "-o", "-", plistPath], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.on("error", () => resolve(null));
  child.on("exit", (code) => {
    if (code !== 0) {
      resolve(null);
      return;
    }
    try {
      resolve(JSON.parse(output));
    } catch {
      resolve(null);
    }
  });
});

const shouldShowMacApp = (item: MacAppInfo) => {
  if (isVsCode(item)) return true;
  if (preferredMacAppNames.has(item.name.toLowerCase())) return true;
  if (item.category === "public.app-category.developer-tools") return true;
  return false;
};

const inferredIcon = (item: MacAppInfo): WorkspaceOpenTargetInfo["icon"] => {
  if (isVsCode(item)) return "vscode";
  if (item.bundleId?.includes("dt.Xcode")) return "xcode";
  if (item.name.toLowerCase().includes("android studio")) return "android_studio";
  if (item.name.toLowerCase().includes("terminal") || item.name.toLowerCase().includes("ghostty")) return "terminal";
  return "app";
};

const nativeTarget = async (
  id: WorkspaceOpenTarget,
  label: string,
  icon: WorkspaceOpenTargetInfo["icon"],
  appPath?: string,
  preferred = false,
): Promise<WorkspaceOpenTargetInfo> => ({
  id,
  label,
  icon,
  iconDataUrl: appPath ? await getNativeIcon(appPath) : undefined,
  preferred,
  platform: process.platform,
});

const getNativeIcon = async (appPath: string) => {
  const bundleIcon = await getMacBundleIcon(appPath);
  if (bundleIcon) return bundleIcon;
  try {
    const icon = await app.getFileIcon(appPath, { size: "normal" });
    return icon.isEmpty() ? undefined : icon.toDataURL();
  } catch {
    return undefined;
  }
};

const getMacBundleIcon = async (appPath: string) => {
  if (process.platform !== "darwin" || !appPath.endsWith(".app")) return null;
  const info = await readMacAppInfo(appPath);
  const candidates = await macIconCandidates(appPath, info);
  for (const candidate of candidates) {
    const converted = await convertIcnsToDataUrl(candidate);
    if (converted) return converted;
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return image.resize({ width: 32, height: 32 }).toDataURL();
  }
  return null;
};

const macIconCandidates = async (appPath: string, info: MacAppInfo | null) => {
  const resourcesPath = path.join(appPath, "Contents", "Resources");
  const names = [
    info?.iconFile,
    info?.iconName,
    info?.name ? `${info.name}.icns` : undefined,
    "AppIcon.icns",
    "app.icns",
    "icon.icns",
  ].filter((name): name is string => Boolean(name));
  const explicit = names.flatMap((name) => {
    const normalized = name.endsWith(".icns") ? name : `${name}.icns`;
    return [path.join(resourcesPath, normalized)];
  });
  const entries = await readdir(resourcesPath).catch(() => []);
  const discovered = entries
    .filter((entry) => entry.toLowerCase().endsWith(".icns"))
    .sort((left, right) => iconNameScore(right) - iconNameScore(left))
    .map((entry) => path.join(resourcesPath, entry));
  return [...new Set([...explicit, ...discovered])];
};

const iconNameScore = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("appicon")) return 4;
  if (lower.includes("icon")) return 3;
  if (lower.includes("app")) return 2;
  return 1;
};

const convertIcnsToDataUrl = async (icnsPath: string) => {
  if (!icnsPath.toLowerCase().endsWith(".icns") || !(await exists(icnsPath))) return null;
  const cacheDir = path.join(tmpdir(), "privora-app-icons");
  const cacheKey = createHash("sha1").update(icnsPath).digest("hex");
  const pngPath = path.join(cacheDir, `${cacheKey}.png`);
  await mkdir(cacheDir, { recursive: true }).catch(() => undefined);
  if (!(await exists(pngPath))) {
    const ok = await runQuiet("/usr/bin/sips", ["-s", "format", "png", icnsPath, "--out", pngPath]);
    if (!ok) return null;
  }
  const bytes = await readFile(pngPath).catch(() => null);
  return bytes ? `data:image/png;base64,${bytes.toString("base64")}` : null;
};

const runQuiet = (command: string, args: string[]) => new Promise<boolean>((resolve) => {
  const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
  child.on("error", () => resolve(false));
  child.on("exit", (code) => resolve(code === 0));
});

const macAppId = (appPath: string) => `mac-app:${encodeURIComponent(appPath)}`;
const decodeMacAppId = (id: string) => id.startsWith("mac-app:") ? decodeURIComponent(id.slice("mac-app:".length)) : null;
const isAllowedMacAppPath = (appPath: string) => [
  "/Applications/",
  "/System/Applications/",
  `${path.join(homedir(), "Applications")}/`,
].some((root) => appPath.startsWith(root)) && appPath.endsWith(".app");

const isVsCode = (item: MacAppInfo) =>
  item.bundleId === "com.microsoft.VSCode" || item.name.toLowerCase() === "visual studio code";

const preferredMacAppNames = new Set([
  "visual studio code",
  "code",
  "codex",
  "zed",
  "cursor",
  "windsurf",
  "xcode",
  "android studio",
  "ghostty",
  "iterm",
  "iterm2",
  "terminal",
  "kitty",
  "wezterm",
  "sublime text",
  "webstorm",
  "intellij idea",
  "pycharm",
]);

const targetPriority = (target: WorkspaceOpenTargetInfo) => {
  const label = target.label.toLowerCase();
  if (target.preferred || label === "visual studio code" || label === "vs code" || label === "code") return 0;
  if (target.id === "file_explorer") return 1;
  if (target.id === "terminal" || label.includes("terminal") || label.includes("ghostty") || label.includes("iterm")) return 2;
  if (label.includes("xcode") || label.includes("android studio")) return 3;
  return 4;
};

const sortTargets = (targets: WorkspaceOpenTargetInfo[]) => [...targets].sort((left, right) => {
  const priority = targetPriority(left) - targetPriority(right);
  if (priority !== 0) return priority;
  return left.label.localeCompare(right.label);
});

const target = (
  id: WorkspaceOpenTarget,
  label: string,
  icon: WorkspaceOpenTargetInfo["icon"],
  preferred = false,
): WorkspaceOpenTargetInfo => ({ id, label, icon, preferred, platform: process.platform });

const ensureDefault = (targets: WorkspaceOpenTargetInfo[]) => {
  const defaultIndex = targets.findIndex((item) => item.preferred) >= 0
    ? targets.findIndex((item) => item.preferred)
    : 0;
  return targets.map((item, index) => ({ ...item, isDefault: index === defaultIndex }));
};

const dedupeTargets = (targets: WorkspaceOpenTargetInfo[]) => {
  const seen = new Set<string>();
  return targets.filter((item) => {
    const key = item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const exists = async (targetPath: string) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const commandExists = (command: string) => new Promise<boolean>((resolve) => {
  const probe = process.platform === "win32" ? "where.exe" : "command";
  const args = process.platform === "win32" ? [command] : ["-v", command];
  const child = spawn(probe, args, { stdio: "ignore", shell: process.platform !== "win32", windowsHide: true });
  child.on("error", () => resolve(false));
  child.on("exit", (code) => resolve(code === 0));
});

const spawnDetached = (command: string, args: string[]) => {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
};
