import { useEffect, useMemo, useRef, useState } from "react";
import { WebContainer, type WebContainerProcess } from "@webcontainer/api";
import { getPackageHash, normalizeWebDevPath, toWebContainerTree } from "../lib/files";
import type { WebDevFile, WebDevRuntimeState } from "../lib/types";

declare global {
  interface Window {
    __privoraWebContainerBootPromise?: Promise<WebContainer>;
  }
}

let configuredApiKey = false;

const configureApiKey = () => {
  if (configuredApiKey) return;
  const apiKey = ((import.meta as any).env?.VITE_WEBCONTAINER_API_KEY as string | undefined)?.trim();
  if (apiKey) (WebContainer as any).configureAPIKey?.(apiKey);
  configuredApiKey = true;
};

const canUseWebContainer = () =>
  typeof window !== "undefined" &&
  typeof SharedArrayBuffer !== "undefined" &&
  window.crossOriginIsolated;

const cleanTerminalLine = (value: string) =>
  value
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();

const bootWebContainer = async () => {
  configureApiKey();
  window.__privoraWebContainerBootPromise ||= WebContainer.boot({
    coep: "require-corp",
    forwardPreviewErrors: true,
  });
  return window.__privoraWebContainerBootPromise;
};

const hasRunnableViteProject = (files: WebDevFile[]) => {
  const packageFile = files.find(file => normalizeWebDevPath(file.path) === "package.json");
  if (!packageFile) return false;
  try {
    const packageJson = JSON.parse(packageFile.content);
    return Boolean(packageJson?.scripts?.dev);
  } catch {
    return false;
  }
};

const ensureRuntimeFiles = (files: WebDevFile[]): WebDevFile[] => {
  const normalizedPaths = new Set(files.map(file => normalizeWebDevPath(file.path)));
  if (normalizedPaths.has("vite.config.ts") || normalizedPaths.has("vite.config.js")) {
    return files;
  }

  const packageFile = files.find(file => normalizeWebDevPath(file.path) === "package.json");
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
  const activeFiles = useMemo(() => ensureRuntimeFiles(files.filter(file => file.status !== "deleted" && file.status !== "streaming")), [files]);
  const packageHash = useMemo(() => getPackageHash(activeFiles), [activeFiles]);

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

  const restart = async (reason = "restart") => {
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

    stopProcesses();
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
        const text = message?.message || message?.type || "Preview runtime error";
        setState(prev => ({ ...prev, errors: [...prev.errors.slice(-20), String(text)] }));
      });

      await webcontainer.mount(toWebContainerTree(activeFiles));
      syncedFilesRef.current = new Map(activeFiles.map(file => [normalizeWebDevPath(file.path), file.content]));
      mountedProjectRef.current = projectId;
      packageHashRef.current = packageHash;

      setState(prev => ({ ...prev, status: "installing" }));
      appendTerminal("Installing dependencies...");
      const install = await webcontainer.spawn("npm", ["install", "--prefer-offline", "--no-audit", "--no-fund"]);
      installProcessRef.current = install;
      readProcessOutput(install, appendTerminal);
      const installCode = await install.exit;
      installProcessRef.current = null;
      if (installCode !== 0) throw new Error(`npm install exited with code ${installCode}`);

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
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    const run = async () => {
      const result = await restart(mountedProjectRef.current === projectId ? "restart" : "mount");
      if (cancelled) result?.();
      else cleanup = result;
    };
    if (projectId && activeFiles.length > 0 && (mountedProjectRef.current !== projectId || packageHashRef.current !== packageHash)) {
      void run();
    }
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [projectId, packageHash]);

  useEffect(() => {
    if (!projectId || mountedProjectRef.current !== projectId || state.status === "installing" || state.status === "booting") return;
    const sync = async () => {
      if (!window.__privoraWebContainerBootPromise) return;
      const webcontainer = await window.__privoraWebContainerBootPromise;
      const next = new Map(activeFiles.map(file => [normalizeWebDevPath(file.path), file.content]));
      for (const [path, previousContent] of syncedFilesRef.current.entries()) {
        const fsPath = `/${path}`;
        if (!next.has(path)) {
          await webcontainer.fs.rm(fsPath, { force: true, recursive: true }).catch(() => undefined);
          appendTerminal(`Removed ${path}`);
        } else if (next.get(path) !== previousContent) {
          await webcontainer.fs.writeFile(fsPath, next.get(path) || "");
          appendTerminal(`Updated ${path}`);
        }
      }
      for (const [path, content] of next.entries()) {
        if (!syncedFilesRef.current.has(path)) {
          const folder = path.split("/").slice(0, -1).join("/");
          if (folder) await webcontainer.fs.mkdir(`/${folder}`, { recursive: true }).catch(() => undefined);
          await webcontainer.fs.writeFile(`/${path}`, content);
          appendTerminal(`Created ${path}`);
        }
      }
      syncedFilesRef.current = next;
    };
    const timeout = window.setTimeout(() => void sync(), 350);
    return () => window.clearTimeout(timeout);
  }, [projectId, activeFiles, state.status]);

  useEffect(() => () => stopProcesses(), []);

  return {
    runtime: state,
    restart: () => void restart("restart"),
  };
}
