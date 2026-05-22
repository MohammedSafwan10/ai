import { useEffect, useMemo, useRef, useState } from "react";
import { WebContainer, type WebContainerProcess } from "@webcontainer/api";
import { canonicalizeWebDevPath, getPackageHash, toWebContainerTree } from "../lib/files";
import type { WebDevFile, WebDevRuntimeState } from "../lib/types";

declare global {
  interface Window {
    __privoraWebContainerBootPromise?: Promise<WebContainer>;
    __privoraWebContainerCommandPackageHash?: string;
    __privoraWebContainerSyncedFiles?: Map<string, string>;
    __privoraWebContainerPreviewErrors?: string[];
  }
}

const RUNTIME_RESTART_PATHS = [
  "package.json",
  "vite.config.ts",
  "vite.config.js",
  "vite.config.mts",
  "vite.config.mjs",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "postcss.config.js",
  "postcss.config.cjs",
  "tailwind.config.js",
  "tailwind.config.ts",
];

let configuredApiKey = false;

const configureApiKey = () => {
  if (configuredApiKey) return;
  const apiKey = ((import.meta as any).env?.VITE_WEBCONTAINER_API_KEY as string | undefined)?.trim();
  if (apiKey) (WebContainer as any).configureAPIKey?.(apiKey);
  configuredApiKey = true;
};

export const canUseWebContainer = () =>
  typeof window !== "undefined" &&
  typeof SharedArrayBuffer !== "undefined" &&
  window.crossOriginIsolated;

const cleanTerminalLine = (value: string) =>
  value
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();

const previewRuntimeErrors = () => (window.__privoraWebContainerPreviewErrors || [])
  .map(cleanTerminalLine)
  .filter(Boolean)
  .slice(-12);

export const bootWebContainer = async () => {
  configureApiKey();
  window.__privoraWebContainerBootPromise ||= WebContainer.boot({
    coep: "require-corp",
    forwardPreviewErrors: true,
  });
  return window.__privoraWebContainerBootPromise;
};

export const canUseWebDevCommands = canUseWebContainer;

const hasRunnableViteProject = (files: WebDevFile[]) => {
  const packageFile = files.find(file => canonicalizeWebDevPath(file.path) === "package.json");
  if (!packageFile) return false;
  try {
    const packageJson = JSON.parse(packageFile.content);
    return Boolean(packageJson?.scripts?.dev);
  } catch {
    return false;
  }
};

const getRuntimeRestartSignature = (files: WebDevFile[]) => {
  const byPath = new Map(files.flatMap(file => {
    const path = canonicalizeWebDevPath(file.path);
    return path ? [[path, file.content] as const] : [];
  }));
  return RUNTIME_RESTART_PATHS
    .map(path => `${path}:${byPath.get(path) || ""}`)
    .join("\n---privora-runtime-config---\n");
};

const ensureRuntimeFiles = (files: WebDevFile[]): WebDevFile[] => {
  const normalizedPaths = new Set(files.map(file => canonicalizeWebDevPath(file.path)).filter(Boolean));
  if (normalizedPaths.has("vite.config.ts") || normalizedPaths.has("vite.config.js")) {
    return files;
  }

  const packageFile = files.find(file => canonicalizeWebDevPath(file.path) === "package.json");
  const isReactProject = packageFile?.content.includes('"react"') || files.some(file => file.path.endsWith(".tsx") || file.path.endsWith(".jsx"));
  if (!isReactProject) return files;

  return [
    ...files,
    {
      id: "__runtime_vite_config__",
      projectId: "__runtime__",
      path: "vite.config.ts",
      content: 'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n});\n',
      status: "ready" as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];
};

const readProcessOutput = (
  process: WebContainerProcess,
  onLine: (line: string) => void,
) => {
  const reader = process.output.getReader();
  const pump = async () => {
    let pending = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += value;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      lines
        .map(cleanTerminalLine)
        .filter(line => line.length > 1 && !/^[|/\\-]+$/.test(line))
        .forEach(onLine);
    }
    const finalLine = cleanTerminalLine(pending);
    if (finalLine.length > 1 && !/^[|/\\-]+$/.test(finalLine)) onLine(finalLine);
  };
  void pump();
};

const runProcessWithOutput = async (
  process: WebContainerProcess,
  onLine: (line: string) => void,
  signal: AbortSignal,
  timeoutMs: number,
) => {
  readProcessOutput(process, onLine);
  let timeout: number | undefined;
  const timeoutPromise = new Promise<number>((resolve) => {
    timeout = window.setTimeout(() => {
      process.kill();
      onLine(`Command timed out after ${Math.round(timeoutMs / 1000)}s.`);
      resolve(124);
    }, timeoutMs);
  });
  const abortPromise = new Promise<number>((resolve) => {
    if (signal.aborted) {
      process.kill();
      resolve(130);
      return;
    }
    signal.addEventListener("abort", () => {
      process.kill();
      resolve(130);
    }, { once: true });
  });
  const exitCode = await Promise.race([process.exit, timeoutPromise, abortPromise]);
  if (timeout) window.clearTimeout(timeout);
  return exitCode;
};

const mountFilesForCommand = async (files: WebDevFile[], onLine: (line: string) => void) => {
  const activeFiles = ensureRuntimeFiles(files.filter(file => file.status !== "deleted"));
  if (!hasRunnableViteProject(activeFiles)) {
    throw new Error("No runnable package.json with a dev script exists yet.");
  }
  const webcontainer = await bootWebContainer();
  if (window.__privoraWebContainerSyncedFiles) {
    onLine("Syncing project files...");
    window.__privoraWebContainerSyncedFiles = await syncWebContainerFiles({
      webcontainer,
      files: activeFiles,
      previous: window.__privoraWebContainerSyncedFiles,
      onLine,
    });
  } else {
    onLine("Mounting project files...");
    await webcontainer.mount(toWebContainerTree(activeFiles));
    window.__privoraWebContainerSyncedFiles = new Map(activeFiles.flatMap(file => {
      const path = canonicalizeWebDevPath(file.path);
      return path ? [[path, file.content] as const] : [];
    }));
  }
  return { webcontainer, activeFiles };
};

async function syncWebContainerFiles({
  webcontainer,
  files,
  previous,
  onLine,
}: {
  webcontainer: WebContainer;
  files: WebDevFile[];
  previous: Map<string, string>;
  onLine: (line: string) => void;
}) {
  const next = new Map(files.flatMap(file => {
    const path = canonicalizeWebDevPath(file.path);
    return path ? [[path, file.content] as const] : [];
  }));
  for (const [path, previousContent] of previous.entries()) {
    const fsPath = `/${path}`;
    if (!next.has(path)) {
      await webcontainer.fs.rm(fsPath, { force: true, recursive: true }).catch(() => undefined);
      onLine(`Removed ${path}`);
    } else if (next.get(path) !== previousContent) {
      const folder = path.split("/").slice(0, -1).join("/");
      if (folder) await webcontainer.fs.mkdir(`/${folder}`, { recursive: true }).catch(() => undefined);
      await webcontainer.fs.writeFile(fsPath, next.get(path) || "");
      onLine(`Updated ${path}`);
    }
  }
  for (const [path, content] of next.entries()) {
    if (!previous.has(path)) {
      const folder = path.split("/").slice(0, -1).join("/");
      if (folder) await webcontainer.fs.mkdir(`/${folder}`, { recursive: true }).catch(() => undefined);
      await webcontainer.fs.writeFile(`/${path}`, content);
      onLine(`Created ${path}`);
    }
  }
  return next;
}

const getPackageJson = (files: WebDevFile[]) => {
  const packageFile = files.find(file => canonicalizeWebDevPath(file.path) === "package.json");
  if (!packageFile) return null;
  try {
    return JSON.parse(packageFile.content) as { scripts?: Record<string, string> };
  } catch {
    return null;
  }
};

export const SAFE_WEBDEV_NPM_SCRIPTS = new Set(["build", "lint", "test", "typecheck", "preview"]);

export const getSafeWebDevScriptError = (files: WebDevFile[], script: string) => {
  const cleanScript = script.trim();
  if (!SAFE_WEBDEV_NPM_SCRIPTS.has(cleanScript)) {
    return `Only safe npm scripts are allowed here: ${[...SAFE_WEBDEV_NPM_SCRIPTS].join(", ")}.`;
  }
  const packageJson = getPackageJson(files);
  if (!packageJson?.scripts?.[cleanScript]) {
    return `package.json does not define an npm script named "${cleanScript}".`;
  }
  return null;
};

export interface WebDevCommandResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode?: number;
}

export const runWebDevNpmScript = async ({
  files,
  script,
  args = [],
  signal,
  onLine,
  timeoutMs = 120000,
}: {
  files: WebDevFile[];
  script: string;
  args?: string[];
  signal: AbortSignal;
  onLine: (line: string) => void;
  timeoutMs?: number;
}): Promise<WebDevCommandResult> => {
  if (!canUseWebContainer()) {
    return {
      success: false,
      error: "WebContainer commands need cross-origin isolation.",
      output: "WebContainer commands need cross-origin isolation.",
    };
  }
  const scriptError = getSafeWebDevScriptError(files, script);
  if (scriptError) return { success: false, error: scriptError, output: scriptError };

  const output: string[] = [];
  const append = (line: string) => {
    output.push(line);
    onLine(line);
    window.dispatchEvent(new CustomEvent("privora-webdev-command-output", { detail: { line } }));
  };

  try {
    const { webcontainer, activeFiles } = await mountFilesForCommand(files, append);
    const packageHash = getPackageHash(activeFiles);
    if (window.__privoraWebContainerCommandPackageHash !== packageHash) {
      append("Installing dependencies...");
      const install = await webcontainer.spawn("npm", ["install", "--prefer-offline", "--no-audit", "--no-fund"]);
      const installCode = await runProcessWithOutput(install, append, signal, timeoutMs);
      if (installCode !== 0) {
        return {
          success: false,
          error: `npm install exited with code ${installCode}`,
          output: output.join("\n"),
          exitCode: installCode,
        };
      }
      window.__privoraWebContainerCommandPackageHash = packageHash;
    }

    append(`Running npm run ${script}${args.length ? ` -- ${args.join(" ")}` : ""}...`);
    const process = await webcontainer.spawn("npm", ["run", script, ...(args.length ? ["--", ...args] : [])]);
    const exitCode = await runProcessWithOutput(process, append, signal, timeoutMs);
    const runtimeErrors = previewRuntimeErrors();
    if (runtimeErrors.length) {
      append("Recent preview runtime errors:");
      runtimeErrors.forEach(line => append(line));
    }
    return {
      success: exitCode === 0,
      output: output.join("\n"),
      error: exitCode === 0 ? undefined : `npm run ${script} exited with code ${exitCode}`,
      exitCode,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "WebContainer command failed.";
    append(message);
    return { success: false, error: message, output: output.join("\n") || message };
  }
};

export function useWebContainerRuntime(projectId: string | null, files: WebDevFile[]) {
  const [state, setState] = useState<WebDevRuntimeState>({
    status: "idle",
    terminalLines: [],
    errors: [],
  });
  const devProcessRef = useRef<WebContainerProcess | null>(null);
  const installProcessRef = useRef<WebContainerProcess | null>(null);
  const mountedProjectRef = useRef<string | null>(null);
  const syncedFilesRef = useRef<Map<string, string>>(new Map());
  const packageHashRef = useRef("");
  const installedPackageHashRef = useRef("");
  const restartSignatureRef = useRef("");
  const restartCleanupRef = useRef<(() => void) | undefined>(undefined);
  const previousProjectIdRef = useRef<string | null>(projectId);
  const activeFiles = useMemo(() => ensureRuntimeFiles(files.filter(file => file.status !== "deleted")), [files]);
  const packageHash = useMemo(() => getPackageHash(activeFiles), [activeFiles]);
  const restartSignature = useMemo(() => getRuntimeRestartSignature(activeFiles), [activeFiles]);

  const appendTerminal = (line: string) => {
    setState(prev => ({
      ...prev,
      terminalLines: [...prev.terminalLines.slice(-160), line],
    }));
  };

  const stopProcesses = () => {
    installProcessRef.current?.kill();
    devProcessRef.current?.kill();
    installProcessRef.current = null;
    devProcessRef.current = null;
  };

  const resetRuntimeForProject = () => {
    restartCleanupRef.current?.();
    restartCleanupRef.current = undefined;
    stopProcesses();
    mountedProjectRef.current = null;
    syncedFilesRef.current = new Map();
    packageHashRef.current = "";
    restartSignatureRef.current = "";
    window.__privoraWebContainerSyncedFiles = syncedFilesRef.current;
    window.__privoraWebContainerPreviewErrors = [];
    setState({
      status: "idle",
      previewUrl: undefined,
      errors: [],
      terminalLines: projectId
        ? ["Preview is waiting for this project's files."]
        : ["Preview is waiting for a Web Dev project."],
    });
  };

  const restart = async (reason = "restart", options: { forceInstall?: boolean } = {}) => {
    if (!projectId || activeFiles.length === 0) return;
    if (!hasRunnableViteProject(activeFiles)) {
      setState(prev => ({
        ...prev,
        status: "idle",
        previewUrl: undefined,
        errors: [],
        terminalLines: ["Preview is waiting for a package.json with a dev script."],
      }));
      return;
    }
    if (!canUseWebContainer()) {
      setState(prev => ({
        ...prev,
        status: "unsupported",
        errors: ["WebContainer needs a Chromium/Safari/Firefox browser with cross-origin isolation enabled."],
      }));
      return;
    }

    restartCleanupRef.current?.();
    restartCleanupRef.current = undefined;
    stopProcesses();
    window.__privoraWebContainerPreviewErrors = [];
    setState(prev => ({
      ...prev,
      status: "booting",
      previewUrl: undefined,
      errors: [],
      terminalLines: reason === "restart" ? prev.terminalLines : [],
    }));

    try {
      appendTerminal("Booting WebContainer runtime...");
      const webcontainer = await bootWebContainer();
      appendTerminal("Mounting project files...");
      const unsubscribeServer = webcontainer.on("server-ready", (_port, url) => {
        setState(prev => ({ ...prev, status: "running", previewUrl: url }));
        appendTerminal(`Preview ready: ${url}`);
      });
      const unsubscribePreview = webcontainer.on("preview-message", (message: any) => {
        const text = message?.message || message?.error?.message || message?.type || "Preview runtime error";
        window.__privoraWebContainerPreviewErrors = [
          ...(window.__privoraWebContainerPreviewErrors || []).slice(-20),
          String(text),
        ];
        setState(prev => ({ ...prev, errors: [...prev.errors.slice(-20), String(text)] }));
      });

      await webcontainer.mount(toWebContainerTree(activeFiles));
      syncedFilesRef.current = new Map(activeFiles.flatMap(file => {
        const path = canonicalizeWebDevPath(file.path);
        return path ? [[path, file.content] as const] : [];
      }));
      window.__privoraWebContainerSyncedFiles = syncedFilesRef.current;
      mountedProjectRef.current = projectId;
      packageHashRef.current = packageHash;
      restartSignatureRef.current = restartSignature;

      if (options.forceInstall || installedPackageHashRef.current !== packageHash) {
        setState(prev => ({ ...prev, status: "installing" }));
        appendTerminal("Installing dependencies...");
        const install = await webcontainer.spawn("npm", ["install", "--prefer-offline", "--no-audit", "--no-fund"]);
        installProcessRef.current = install;
        readProcessOutput(install, appendTerminal);
        const installCode = await install.exit;
        installProcessRef.current = null;
        if (installCode !== 0) throw new Error(`npm install exited with code ${installCode}`);
        installedPackageHashRef.current = packageHash;
        window.__privoraWebContainerCommandPackageHash = packageHash;
      } else {
        appendTerminal("Dependencies unchanged; restarting dev server.");
      }

      setState(prev => ({ ...prev, status: "starting" }));
      appendTerminal("Starting Vite dev server...");
      const dev = await webcontainer.spawn("npm", ["run", "dev", "--", "--host", "0.0.0.0"]);
      devProcessRef.current = dev;
      readProcessOutput(dev, appendTerminal);

      return () => {
        unsubscribeServer();
        unsubscribePreview();
      };
    } catch (error) {
      setState(prev => ({
        ...prev,
        status: "error",
        errors: [...prev.errors, error instanceof Error ? error.message : "WebContainer failed to start."],
      }));
    }
  };

  useEffect(() => {
    if (previousProjectIdRef.current !== projectId) {
      previousProjectIdRef.current = projectId;
      resetRuntimeForProject();
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const packageChanged = packageHashRef.current !== packageHash;
      const result = await restart(mountedProjectRef.current === projectId ? "restart" : "mount", {
        forceInstall: packageChanged,
      });
      if (cancelled) result?.();
      else restartCleanupRef.current = result;
    };
    if (projectId && activeFiles.length > 0 && (mountedProjectRef.current !== projectId || restartSignatureRef.current !== restartSignature)) {
      const timeout = window.setTimeout(() => void run(), mountedProjectRef.current === projectId ? 700 : 0);
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [projectId, packageHash, restartSignature]);

  useEffect(() => {
    if (!projectId || mountedProjectRef.current !== projectId || state.status === "installing" || state.status === "booting") return;
    const sync = async () => {
      if (!window.__privoraWebContainerBootPromise) return;
      const webcontainer = await window.__privoraWebContainerBootPromise;
      const next = await syncWebContainerFiles({
        webcontainer,
        files: activeFiles,
        previous: syncedFilesRef.current,
        onLine: appendTerminal,
      });
      syncedFilesRef.current = next;
      window.__privoraWebContainerSyncedFiles = next;
    };
    const timeout = window.setTimeout(() => void sync(), 350);
    return () => window.clearTimeout(timeout);
  }, [projectId, activeFiles, state.status]);

  useEffect(() => {
    const onCommandOutput = (event: Event) => {
      const line = (event as CustomEvent<{ line?: string }>).detail?.line;
      if (line) appendTerminal(line);
    };
    window.addEventListener("privora-webdev-command-output", onCommandOutput);
    return () => {
      window.removeEventListener("privora-webdev-command-output", onCommandOutput);
      restartCleanupRef.current?.();
      restartCleanupRef.current = undefined;
      stopProcesses();
    };
  }, []);

  return {
    runtime: state,
    restart: () => void restart("restart", { forceInstall: true }),
  };
}
