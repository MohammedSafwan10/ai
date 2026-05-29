import type { BrowserWindow } from "electron";

export const isPrivoraDebugEnabled = () =>
  process.env.PRIVORA_DEBUG === "1" || process.env.PRIVORA_DEBUG === "true";

export const debugLog = (scope: string, payload: Record<string, unknown>) => {
  if (!isPrivoraDebugEnabled()) return;
  const timestamp = new Date().toISOString();
  console.log(`[privora:${scope}] ${timestamp} ${JSON.stringify(payload)}`);
};

export const installRendererDiagnostics = (window: BrowserWindow, name = "main_window") => {
  if (!isPrivoraDebugEnabled()) return;

  let sampler: NodeJS.Timeout | null = null;
  const stopSampler = () => {
    if (!sampler) return;
    clearInterval(sampler);
    sampler = null;
  };

  const sampleStack = async () => {
    if (window.isDestroyed()) {
      stopSampler();
      return;
    }
    try {
      const frame = window.webContents.mainFrame as unknown as {
        collectJavaScriptCallStack?: () => Promise<unknown> | unknown;
      };
      const stack = frame.collectJavaScriptCallStack
        ? await frame.collectJavaScriptCallStack()
        : "collectJavaScriptCallStack unavailable";
      debugLog("renderer-unresponsive-stack", { name, stack });
    } catch (error) {
      debugLog("renderer-unresponsive-stack-failed", {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  window.on("unresponsive", () => {
    debugLog("renderer-unresponsive", { name });
    stopSampler();
    void sampleStack();
    sampler = setInterval(() => void sampleStack(), 1000);
    sampler.unref?.();
  });

  window.on("responsive", () => {
    debugLog("renderer-responsive", { name });
    stopSampler();
  });

  window.on("closed", stopSampler);
  window.webContents.on("render-process-gone", (_event, details) => {
    debugLog("renderer-gone", { name, reason: details.reason, exitCode: details.exitCode });
    stopSampler();
  });
};
