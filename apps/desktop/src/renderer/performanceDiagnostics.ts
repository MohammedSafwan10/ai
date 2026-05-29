export const installRendererPerformanceDiagnostics = (enabled: boolean) => {
  if (!enabled) return;

  const log = (scope: string, payload: Record<string, unknown>) => {
    console.info(`[privora:${scope}]`, {
      at: new Date().toISOString(),
      ...payload,
    });
  };

  if ("PerformanceObserver" in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          log("renderer-long-task", {
            durationMs: Math.round(entry.duration),
            name: entry.name,
            startTime: Math.round(entry.startTime),
          });
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    } catch (error) {
      log("renderer-long-task-observer-failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let last = performance.now();
  const sampleFrame = () => {
    const current = performance.now();
    const delta = current - last;
    last = current;
    if (delta > 250) {
      log("renderer-frame-gap", { gapMs: Math.round(delta) });
    }
    window.requestAnimationFrame(sampleFrame);
  };
  window.requestAnimationFrame(sampleFrame);
};
