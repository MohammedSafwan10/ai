import type { WebContents } from "electron";

export interface BrowserCursorPoint {
  x: number;
  y: number;
}

export interface BrowserCursorBox extends BrowserCursorPoint {
  width: number;
  height: number;
}

export interface BrowserCursorOverlayInput {
  point?: BrowserCursorPoint;
  box?: BrowserCursorBox;
  label: string;
  pulse?: boolean;
}

export const showBrowserCursorOverlay = async (
  contents: WebContents,
  input: BrowserCursorOverlayInput,
) => {
  if (contents.isDestroyed() || !contents.getURL()) return;
  await contents.executeJavaScript(
    `(${CURSOR_OVERLAY_SCRIPT})(${JSON.stringify(input)})`,
    true,
  ).catch(() => undefined);
};

export const hideBrowserCursorOverlay = async (contents: WebContents) => {
  if (contents.isDestroyed() || !contents.getURL()) return;
  await contents.executeJavaScript(
    `(() => {
      const api = window.__privoraBrowserCursorOverlay;
      if (api && typeof api.hide === "function") api.hide();
    })()`,
    true,
  ).catch(() => undefined);
};

const CURSOR_OVERLAY_SCRIPT = String.raw`
(input) => {
  const rootId = "__privora_browser_cursor_overlay__";
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const viewport = () => ({ width: window.innerWidth || 1, height: window.innerHeight || 1 });
  const safePoint = (point) => {
    const size = viewport();
    return {
      x: clamp(point && point.x, 0, size.width),
      y: clamp(point && point.y, 0, size.height),
    };
  };
  const ensure = () => {
    let root = document.getElementById(rootId);
    if (!root) {
      root = document.createElement("div");
      root.id = rootId;
      root.setAttribute("aria-hidden", "true");
      root.innerHTML = [
        "<div data-target></div>",
        "<div data-cursor><span data-ring></span></div>",
        "<div data-label></div>",
      ].join("");
      const style = document.createElement("style");
      const selector = "#" + rootId;
      style.textContent = [
        selector + " { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; contain: layout style paint; opacity: 1; transition: opacity 180ms ease; }",
        selector + "[data-hidden='true'] { opacity: 0; }",
        selector + " [data-cursor] { position: fixed; top: 0; left: 0; width: 18px; height: 18px; margin: -9px 0 0 -9px; border: 2px solid rgba(34, 211, 238, 0.98); border-radius: 999px; background: rgba(34, 211, 238, 0.2); box-shadow: 0 0 0 1px rgba(2, 6, 23, 0.55), 0 8px 24px rgba(34, 211, 238, 0.28); transform: translate3d(var(--privora-cursor-x, 50vw), var(--privora-cursor-y, 50vh), 0); transition: transform 220ms cubic-bezier(.2,.8,.2,1); }",
        selector + " [data-cursor]::after { content: ''; position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 999px; background: rgb(236, 254, 255); }",
        selector + " [data-ring] { position: absolute; inset: -9px; border: 2px solid rgba(34, 211, 238, 0); border-radius: 999px; }",
        selector + "[data-pulse='true'] [data-ring] { animation: privora-cursor-pulse 420ms ease-out; }",
        selector + " [data-label] { position: fixed; top: 0; left: 0; max-width: min(240px, calc(100vw - 24px)); border: 1px solid rgba(148, 163, 184, 0.38); border-radius: 7px; background: rgba(15, 23, 42, 0.88); color: white; padding: 4px 7px; font: 600 11px/1.25 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transform: translate3d(var(--privora-label-x, 16px), var(--privora-label-y, 16px), 0); transition: transform 220ms cubic-bezier(.2,.8,.2,1); }",
        selector + " [data-target] { position: fixed; border: 2px solid rgba(34, 211, 238, 0.86); border-radius: 8px; background: rgba(34, 211, 238, 0.08); box-shadow: 0 0 0 1px rgba(2, 6, 23, 0.22); opacity: 0; transform: translate3d(var(--privora-box-x, 0), var(--privora-box-y, 0), 0); width: var(--privora-box-w, 0); height: var(--privora-box-h, 0); transition: opacity 140ms ease, transform 220ms cubic-bezier(.2,.8,.2,1), width 220ms ease, height 220ms ease; }",
        selector + "[data-has-box='true'] [data-target] { opacity: 1; }",
        "@keyframes privora-cursor-pulse { 0% { transform: scale(0.55); border-color: rgba(34, 211, 238, 0.92); opacity: 1; } 100% { transform: scale(1.85); border-color: rgba(34, 211, 238, 0); opacity: 0; } }",
      ].join("\n");
      root.appendChild(style);
      document.documentElement.appendChild(root);
    }
    return root;
  };
  const root = ensure();
  const point = input && input.point ? safePoint(input.point) : safePoint(window.__privoraBrowserCursorLastPoint || { x: window.innerWidth / 2, y: window.innerHeight / 2 });
  window.__privoraBrowserCursorLastPoint = point;
  const label = String(input && input.label || "Browser action").replace(/\s+/g, " ").slice(0, 120);
  const labelX = clamp(point.x + 14, 8, window.innerWidth - 248);
  const labelY = clamp(point.y + 14, 8, window.innerHeight - 34);
  root.style.setProperty("--privora-cursor-x", point.x + "px");
  root.style.setProperty("--privora-cursor-y", point.y + "px");
  root.style.setProperty("--privora-label-x", labelX + "px");
  root.style.setProperty("--privora-label-y", labelY + "px");
  root.querySelector("[data-label]").textContent = label;
  if (input && input.box) {
    const box = input.box;
    root.style.setProperty("--privora-box-x", clamp(box.x, 0, window.innerWidth) + "px");
    root.style.setProperty("--privora-box-y", clamp(box.y, 0, window.innerHeight) + "px");
    root.style.setProperty("--privora-box-w", Math.max(0, Math.min(window.innerWidth, Number(box.width) || 0)) + "px");
    root.style.setProperty("--privora-box-h", Math.max(0, Math.min(window.innerHeight, Number(box.height) || 0)) + "px");
    root.dataset.hasBox = "true";
  } else {
    root.dataset.hasBox = "false";
  }
  root.dataset.hidden = "false";
  root.dataset.pulse = "false";
  if (input && input.pulse) {
    window.clearTimeout(window.__privoraBrowserCursorPulseTimer);
    window.__privoraBrowserCursorPulseTimer = window.setTimeout(() => {
      root.dataset.pulse = "true";
      window.setTimeout(() => { root.dataset.pulse = "false"; }, 430);
    }, 180);
  }
  window.__privoraBrowserCursorOverlay = {
    hide: () => {
      const current = document.getElementById(rootId);
      if (!current) return;
      current.dataset.hidden = "true";
      window.clearTimeout(window.__privoraBrowserCursorHideTimer);
      window.__privoraBrowserCursorHideTimer = window.setTimeout(() => current.remove(), 220);
    },
  };
}
`;
