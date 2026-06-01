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

interface WindowsAppInfo {
  appPath: string;
  launchPath?: string;
  launchArgs?: string[];
  name: string;
  productKey?: string;
  shortcutPath?: string;
}

interface WindowsShortcutInfo {
  shortcutPath?: string;
  name?: string;
  targetPath?: string;
  arguments?: string;
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
  const explorerPath = windowsSystemPath("explorer.exe");
  const vscodePath = await findWindowsVsCodePath();
  const terminalPath = await findWindowsTerminalPath();
  const wslPath = await findWindowsWslPath();
  const powershellPath = windowsSystemPath(path.join("System32", "WindowsPowerShell", "v1.0", "powershell.exe"));
  const gitBashPath = await findWindowsGitBashPath();
  const targets: WorkspaceOpenTargetInfo[] = [
    await nativeTarget("file_explorer", "File Explorer", "finder", explorerPath),
  ];
  const apps = await discoverWindowsOpenableApps();
  for (const item of apps) {
    targets.push(await nativeTarget(windowsAppId(item), item.name, inferredWindowsIcon(item), item.appPath, isWindowsVsCode(item)));
  }
  if (vscodePath && !apps.some(isWindowsVsCode)) {
    targets.push(await nativeTarget("vscode", "VS Code", "vscode", vscodePath, true));
  }
  targets.push(await nativeTarget("terminal", terminalPath ? "Terminal" : "PowerShell", "terminal", terminalPath || powershellPath));
  if (gitBashPath && !apps.some((item) => item.appPath.toLowerCase() === gitBashPath.toLowerCase())) {
    targets.push(await nativeTarget("git_bash", "Git Bash", "terminal", gitBashPath));
  }
  if (wslPath) targets.push(await nativeTarget("wsl", "WSL", "terminal", wslPath));
  return ensureDefault(sortTargets(dedupeTargets(targets)));
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
  if (target.startsWith("win-app:")) {
    const productKey = decodeWindowsAppId(target);
    const apps = await discoverWindowsOpenableApps();
    const appInfo = apps.find((item) => productKey && windowsAppIdentity(item) === productKey);
    if (appInfo) await openWindowsApp(appInfo, workspacePath);
    return;
  }
  if (target === "vscode") {
    const vscodePath = await findWindowsVsCodePath();
    if (vscodePath) {
      spawnDetached(vscodePath, [workspacePath]);
      return;
    }
    spawnDetached("cmd.exe", ["/c", "start", "", "code", workspacePath]);
    return;
  }
  if (target === "terminal") {
    const terminalPath = await findWindowsTerminalPath();
    if (terminalPath) {
      openWindowsTerminal(workspacePath);
      return;
    }
    const powershellPath = windowsSystemPath(path.join("System32", "WindowsPowerShell", "v1.0", "powershell.exe"));
    spawnDetached(powershellPath, ["-NoExit", "-NoLogo", "-Command", "Set-Location -LiteralPath $args[0]", workspacePath]);
    return;
  }
  if (target === "git_bash") {
    const gitBash = await findWindowsGitBashPath();
    if (gitBash) spawnDetached(gitBash, [`--cd=${workspacePath}`], workspacePath);
    return;
  }
  if (target === "wsl") {
    const wslPath = await findWindowsWslPath();
    if (!wslPath) return;
    const terminalPath = await findWindowsTerminalPath();
    if (terminalPath) {
      openWindowsTerminal(workspacePath, [wslPath, "--cd", workspacePath]);
      return;
    }
    spawnDetached("cmd.exe", ["/c", "start", "", wslPath, "--cd", workspacePath]);
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

const openWindowsApp = async (appInfo: WindowsAppInfo, workspacePath: string) => {
  const launch = await windowsLaunchForApp(appInfo, workspacePath);
  spawnDetached(launch.command, launch.args, workspacePath);
};

const windowsLaunchForApp = async (appInfo: WindowsAppInfo, workspacePath: string) => {
  if (appInfo.launchPath) return { command: appInfo.launchPath, args: [...(appInfo.launchArgs || []), workspacePath] };
  const lower = `${appInfo.name} ${appInfo.appPath}`.toLowerCase();
  if (lower.includes("zed")) {
    const zedCli = await findZedCliPath(appInfo.appPath);
    if (zedCli) return { command: zedCli, args: [workspacePath] };
  }
  if (lower.includes("visual studio") || path.basename(appInfo.appPath).toLowerCase() === "devenv.exe") {
    const solutionPath = await findVisualStudioSolution(workspacePath);
    return { command: appInfo.appPath, args: [solutionPath || workspacePath] };
  }
  return { command: appInfo.appPath, args: [workspacePath] };
};

const openWindowsTerminal = (workspacePath: string, commandArgs: string[] = []) => {
  spawnDetached("cmd.exe", ["/c", "start", "", "wt.exe", "-d", workspacePath, ...commandArgs]);
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

const discoverWindowsApps = async (): Promise<WindowsAppInfo[]> => {
  const shortcuts = await readWindowsStartMenuShortcuts();
  const apps: WindowsAppInfo[] = [];
  for (const shortcut of shortcuts) {
    const appInfo = windowsAppFromShortcut(shortcut);
    if (!appInfo || !shouldShowWindowsApp(appInfo)) continue;
    apps.push(appInfo);
  }
  return dedupeWindowsApps(apps);
};

const discoverWindowsOpenableApps = async () =>
  dedupeWindowsApps([
    ...await discoverWindowsApps(),
    ...await discoverWindowsPathApps(),
    ...await discoverWindowsInstallApps(),
  ]).filter(shouldShowWindowsApp);

const discoverWindowsPathApps = async (): Promise<WindowsAppInfo[]> => {
  const apps: WindowsAppInfo[] = [];
  const commands = ["code", "zed", "antigravity", "cursor", "windsurf", "devenv", "studio64", "idea64", "webstorm64", "pycharm64", "rider64"];
  for (const command of commands) {
    const commandPath = await firstCommandPath(command);
    const appPath = commandPath ? await resolveWindowsLauncherPath(commandPath) : null;
    if (appPath) {
      apps.push({
        appPath,
        launchPath: commandPath || appPath,
        name: windowsAppNameFromPath(appPath),
        productKey: windowsProductKeyFromPath(appPath),
      });
    }
  }
  const visualStudioPath = await findWindowsVisualStudioPath();
  if (visualStudioPath) {
    apps.push({
      appPath: visualStudioPath,
      launchPath: visualStudioPath,
      name: windowsAppNameFromPath(visualStudioPath),
      productKey: windowsProductKeyFromPath(visualStudioPath),
    });
  }
  return apps;
};

const discoverWindowsInstallApps = async (): Promise<WindowsAppInfo[]> => {
  const roots = windowsInstallRoots();
  const apps: WindowsAppInfo[] = [];
  for (const root of roots) {
    if (!(await exists(root))) continue;
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const appRoot = path.join(root, entry.name);
      if (!shouldInspectWindowsInstallDir(appRoot)) continue;
      const exePath = await bestWindowsAppExe(appRoot, 5);
      if (exePath) {
        apps.push({
          appPath: exePath,
          launchPath: exePath,
          name: windowsAppNameFromPath(exePath),
          productKey: windowsProductKeyFromPath(exePath),
        });
      }
    }
  }
  return apps;
};

const readWindowsStartMenuShortcuts = () => new Promise<WindowsShortcutInfo[]>((resolve) => {
  const roots = windowsStartMenuRoots();
  if (!roots.length) {
    resolve([]);
    return;
  }
  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    windowsShortcutDiscoveryScript,
    ...roots,
  ], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.on("error", () => resolve([]));
  child.on("exit", (code) => {
    if (code !== 0 || !output.trim()) {
      resolve([]);
      return;
    }
    try {
      const parsed = JSON.parse(output);
      resolve(Array.isArray(parsed) ? parsed : [parsed]);
    } catch {
      resolve([]);
    }
  });
});

const windowsShortcutDiscoveryScript = `
$ErrorActionPreference = 'SilentlyContinue'
$shell = New-Object -ComObject WScript.Shell
$items = foreach ($root in $args) {
  if (Test-Path -LiteralPath $root) {
    Get-ChildItem -LiteralPath $root -Filter *.lnk -Recurse -File | ForEach-Object {
      $shortcut = $shell.CreateShortcut($_.FullName)
      [pscustomobject]@{
        shortcutPath = $_.FullName
        name = $_.BaseName
        targetPath = $shortcut.TargetPath
        arguments = $shortcut.Arguments
      }
    }
  }
}
$items | ConvertTo-Json -Compress -Depth 3
`;

const windowsStartMenuRoots = () => [
  process.env.APPDATA ? path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs") : null,
  process.env.ProgramData ? path.join(process.env.ProgramData, "Microsoft", "Windows", "Start Menu", "Programs") : null,
].filter((item): item is string => Boolean(item));

const windowsAppFromShortcut = (shortcut: WindowsShortcutInfo): WindowsAppInfo | null => {
  const appPath = typeof shortcut.targetPath === "string" ? shortcut.targetPath.trim() : "";
  const name = typeof shortcut.name === "string" ? shortcut.name.trim() : "";
  if (!appPath || !name || !appPath.toLowerCase().endsWith(".exe")) return null;
  const appName = normalizedWindowsAppName(name);
  return {
    appPath,
    launchPath: appPath,
    name: appName,
    productKey: windowsProductKeyFromText(`${appName} ${appPath}`),
    shortcutPath: shortcut.shortcutPath,
  };
};

const normalizedWindowsAppName = (name: string) => {
  const lower = name.toLowerCase();
  if (lower === "visual studio code") return "VS Code";
  return name.replace(/\s+\((?:64-bit|32-bit|x64|x86)\)$/i, "");
};

const shouldShowWindowsApp = (item: WindowsAppInfo) => {
  const haystack = `${item.name} ${path.basename(item.appPath)} ${item.appPath}`.toLowerCase();
  if (windowsExcludedAppPattern.test(haystack)) return false;
  return windowsWorkspaceAppPattern.test(haystack);
};

const windowsWorkspaceAppPattern =
  /\b(visual studio code|code\.exe|cursor|windsurf|zed|antigravity|visual studio\b|devenv\.exe|android studio|studio64\.exe|intellij|idea64\.exe|webstorm|pycharm|clion|rider|datagrip|goland|phpstorm|rubymine|fleet|sublime text|sublime_text\.exe|notepad\+\+|nvim|neovim|vim|emacs)\b/;

const windowsExcludedAppPattern =
  /\b(uninstall|installer|install additional tools|manuals?|docs?|documentation|release notes|utility|media encoder|git cmd|git gui|node\.js|python|idle)\b/;

const windowsInstallRoots = () => [
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs") : null,
  process.env.ProgramFiles || "C:\\Program Files",
  process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
].filter((item): item is string => Boolean(item));

const shouldInspectWindowsInstallDir = (appRoot: string) => {
  const lower = appRoot.toLowerCase();
  if (windowsInstallDirExcludedPattern.test(lower)) return false;
  return windowsInstallDirPattern.test(lower);
};

const windowsInstallDirPattern =
  /\b(code|cursor|windsurf|zed|antigravity|visual studio|android|jetbrains|intellij|webstorm|pycharm|clion|rider|datagrip|goland|phpstorm|rubymine|fleet|sublime|notepad\+\+|neovim|vim|emacs)\b/;

const windowsInstallDirExcludedPattern =
  /\b(common files|windows|windows nt|windows defender|internet explorer|microsoft office|microsoft sdk|reference assemblies|nodejs|python|adobe|google|bravesoftware|opera|epic games|steam|nvidia|blackmagic|borisfx|red giant|topaz|winrar|7-zip|vlc|videolan)\b/;

const bestWindowsAppExe = async (root: string, depth: number) => {
  const matches = await findWindowsExes(root, depth);
  return matches
    .filter((item) => !windowsExeExcludedPattern.test(item.toLowerCase()))
    .sort((left, right) => windowsExeScore(right, root) - windowsExeScore(left, root))[0] || null;
};

const windowsExeExcludedPattern =
  /\b(unins|uninstall|installer|setup|update|updater|helper|elevate|elevator|launcher|restarter|fsnotifier|profiler|language_server|webm_encoder|openconsole|winprocesslisthelper|crashpad|service|daemon|cli|cmd)\b/;

const windowsExeScore = (exePath: string, root: string) => {
  const lower = exePath.toLowerCase();
  const rootName = path.basename(root).toLowerCase().replace(/\s+/g, "");
  const exeName = path.basename(exePath, ".exe").toLowerCase().replace(/\s+/g, "");
  let score = 0;
  if (exeName === rootName) score += 8;
  if (lower.includes(`${path.sep}bin${path.sep}`)) score += 2;
  if (windowsWorkspaceAppPattern.test(lower)) score += 4;
  if (lower.includes("resources")) score -= 3;
  return score;
};

const windowsAppNameFromPath = (appPath: string) => {
  const lower = appPath.toLowerCase();
  if (lower.includes("microsoft vs code") || path.basename(appPath).toLowerCase() === "code.exe") return "VS Code";
  if (lower.includes("visual studio") || path.basename(appPath).toLowerCase() === "devenv.exe") return "Visual Studio";
  if (lower.includes("android studio") || path.basename(appPath).toLowerCase() === "studio64.exe") return "Android Studio";
  const exeName = path.basename(appPath, ".exe");
  return exeName.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

const resolveWindowsLauncherPath = async (launcherPath: string) => {
  if (path.extname(launcherPath).toLowerCase() === ".exe") return launcherPath;
  const exeName = `${path.basename(launcherPath, path.extname(launcherPath))}.exe`;
  const candidates = [
    path.resolve(path.dirname(launcherPath), "..", exeName),
    path.join(path.dirname(launcherPath), exeName),
  ];
  return findFirstExistingPath(candidates);
};

const inferredWindowsIcon = (item: WindowsAppInfo): WorkspaceOpenTargetInfo["icon"] => {
  const haystack = `${item.name} ${item.appPath}`.toLowerCase();
  if (isWindowsVsCode(item)) return "vscode";
  if (haystack.includes("android studio") || haystack.includes("studio64.exe")) return "android_studio";
  if (haystack.includes("terminal") || haystack.includes("git-bash")) return "terminal";
  return "app";
};

const dedupeWindowsApps = (apps: WindowsAppInfo[]) => {
  const byIdentity = new Map<string, WindowsAppInfo>();
  for (const item of apps) {
    const key = windowsAppIdentity(item);
    const current = byIdentity.get(key);
    if (!current || windowsAppCandidateScore(item) > windowsAppCandidateScore(current)) {
      byIdentity.set(key, item);
    }
  }
  return [...byIdentity.values()];
};

const windowsAppIdentity = (item: WindowsAppInfo) => {
  if (item.productKey) return item.productKey;
  const haystack = `${item.name} ${item.appPath}`.toLowerCase();
  const basename = path.basename(item.appPath).toLowerCase();
  if (isWindowsVsCode(item)) return "vscode";
  if (haystack.includes("visual studio") || basename === "devenv.exe") return "visual-studio";
  if (haystack.includes("android studio") || basename === "studio64.exe") return "android-studio";
  if (haystack.includes("antigravity")) return "antigravity";
  if (haystack.includes("windsurf")) return "windsurf";
  if (haystack.includes("cursor")) return "cursor";
  if (haystack.includes("zed")) return "zed";
  return item.appPath.toLowerCase();
};

const windowsProductKeyFromPath = (appPath: string) => windowsProductKeyFromText(`${windowsAppNameFromPath(appPath)} ${appPath}`);

const windowsProductKeyFromText = (value: string) => {
  const lower = value.toLowerCase();
  const basename = path.basename(lower);
  if (lower.includes("visual studio code") || basename === "code.exe") return "vscode";
  if (lower.includes("visual studio") || basename === "devenv.exe") return "visual-studio";
  if (lower.includes("android studio") || basename === "studio64.exe") return "android-studio";
  if (lower.includes("antigravity")) return "antigravity";
  if (lower.includes("windsurf")) return "windsurf";
  if (lower.includes("cursor")) return "cursor";
  if (lower.includes("zed")) return "zed";
  return lower;
};

const windowsAppCandidateScore = (item: WindowsAppInfo) => {
  const lower = item.appPath.toLowerCase();
  const launchLower = (item.launchPath || "").toLowerCase();
  const basename = path.basename(lower);
  let score = 0;
  if (item.shortcutPath) score += 3;
  if (item.launchPath) score += 4;
  if (lower.includes(`${path.sep}resources${path.sep}`)) score -= 8;
  if (windowsExeExcludedPattern.test(lower)) score -= 100;
  if (basename === "code.exe") score += 30;
  if (basename === "devenv.exe") score += 30;
  if (basename === "studio64.exe") score += 30;
  if (basename === "studio.exe") score += 25;
  if (basename === "antigravity.exe") score += 30;
  if (basename === "zed.exe") score += lower.includes(`${path.sep}bin${path.sep}`) ? 20 : 30;
  if (windowsAppIdentity(item) === "zed" && launchLower.includes(`${path.sep}bin${path.sep}`)) score += 12;
  if (basename === "cursor.exe" || basename === "windsurf.exe") score += 30;
  if (windowsWorkspaceAppPattern.test(lower)) score += 5;
  return score;
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

const findWindowsVsCodePath = async () => {
  const commandPath = await firstCommandPath("code");
  const launcherPath = commandPath ? await resolveWindowsLauncherPath(commandPath) : null;
  if (launcherPath) return launcherPath;
  const app = (await discoverWindowsInstallApps()).find(isWindowsVsCode);
  return app?.appPath || null;
};

const findWindowsTerminalPath = async () => {
  const commandPath = await firstCommandPath("wt");
  if (commandPath) return commandPath;
  const candidates = [
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WindowsApps", "wt.exe"),
    windowsSystemPath(path.join("System32", "wt.exe")),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
};

const findWindowsGitBashPath = async () => {
  const candidates = [
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "git-bash.exe"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Git", "git-bash.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "git-bash.exe"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return firstCommandPath("git-bash");
};

const findWindowsWslPath = async () => {
  const candidates = [
    windowsSystemPath(path.join("System32", "wsl.exe")),
    windowsSystemPath(path.join("Sysnative", "wsl.exe")),
    await firstCommandPath("wsl"),
  ].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
};

const findWindowsVisualStudioPath = async () => {
  const vswhere = path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft Visual Studio", "Installer", "vswhere.exe");
  if (await exists(vswhere)) {
    const productPath = await firstCommandOutput(vswhere, ["-latest", "-products", "*", "-property", "productPath"]);
    if (productPath && await exists(productPath)) return productPath;
  }
  const roots = [
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft Visual Studio"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft Visual Studio"),
  ];
  for (const root of roots) {
    const match = await findWindowsExe(root, "devenv.exe", 5);
    if (match) return match;
  }
  return firstCommandPath("devenv");
};

const findFirstExistingPath = async (candidates: Array<string | null>) => {
  for (const candidate of candidates) {
    if (candidate && await exists(candidate)) return candidate;
  }
  return null;
};

const findWindowsExe = async (root: string, exeName: string, depth: number): Promise<string | null> => {
  if (depth < 0 || !(await exists(root))) return null;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === exeName.toLowerCase()) return fullPath;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findWindowsExe(path.join(root, entry.name), exeName, depth - 1);
    if (found) return found;
  }
  return null;
};

const findZedCliPath = async (appPath: string) => {
  const candidates = [
    path.join(path.dirname(appPath), "bin", "Zed.exe"),
    path.join(path.dirname(appPath), "bin", "zed"),
    await firstCommandPath("zed"),
    await firstCommandPath("Zed"),
  ];
  return findFirstExistingPath(candidates);
};

const findVisualStudioSolution = async (workspacePath: string) => {
  const entries = await readdir(workspacePath, { withFileTypes: true }).catch(() => []);
  const solution = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sln"))
    .map((entry) => path.join(workspacePath, entry.name))
    .sort()[0];
  return solution || null;
};

const findWindowsExes = async (root: string, depth: number): Promise<string[]> => {
  if (depth < 0 || !(await exists(root))) return [];
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const found: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) {
      found.push(fullPath);
      continue;
    }
    if (entry.isDirectory()) {
      found.push(...await findWindowsExes(fullPath, depth - 1));
    }
  }
  return found;
};

const windowsSystemPath = (relativePath: string) => path.join(process.env.SystemRoot || "C:\\Windows", relativePath);

const firstCommandPath = (command: string) => new Promise<string | null>((resolve) => {
  const child = spawn("where.exe", [command], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
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
    const first = output.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    resolve(first || null);
  });
});

const firstCommandOutput = (command: string, args: string[]) => new Promise<string | null>((resolve) => {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
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
    const first = output.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    resolve(first || null);
  });
});

const windowsAppId = (item: WindowsAppInfo) => isWindowsVsCode(item) ? "vscode" : `win-app:${encodeURIComponent(windowsAppIdentity(item))}`;
const decodeWindowsAppId = (id: string) => id.startsWith("win-app:") ? decodeURIComponent(id.slice("win-app:".length)) : null;
const isWindowsVsCode = (item: WindowsAppInfo) => {
  const haystack = `${item.name} ${item.appPath}`.toLowerCase();
  return haystack.includes("visual studio code") || path.basename(item.appPath).toLowerCase() === "code.exe";
};

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
  if (label === "visual studio") return 1;
  if (label === "zed") return 2;
  if (label === "antigravity") return 3;
  if (label.includes("cursor") || label.includes("windsurf")) return 4;
  if (target.id === "file_explorer") return 5;
  if (target.id === "terminal" || label.includes("terminal") || label.includes("ghostty") || label.includes("iterm")) return 6;
  if (target.id === "git_bash" || label.includes("git bash")) return 7;
  if (target.id === "wsl" || label === "wsl") return 8;
  if (label.includes("xcode") || label.includes("android studio")) return 9;
  return 10;
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

const spawnDetached = (command: string, args: string[], cwd?: string) => {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
};
