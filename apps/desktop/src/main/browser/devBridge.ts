import { redactSensitiveText } from "./browserSecurity";
import type { BrowserCdpClient } from "./browserCdp";

export interface DevBridgeSnapshot {
  available: boolean;
  tools: string[];
  state?: unknown;
}

export const inspectDevBridge = async (cdp: BrowserCdpClient): Promise<DevBridgeSnapshot> => {
  const result = await cdp.evaluate<DevBridgeSnapshot | null>(`
    (() => {
      const bridge = window.__PRIVORA_DEVBRIDGE__;
      if (!bridge || typeof bridge !== 'object') return { available: false, tools: [] };
      const tools = bridge.tools && typeof bridge.tools === 'object' ? Object.keys(bridge.tools).slice(0, 40) : [];
      let state = undefined;
      if (typeof bridge.snapshot === 'function') state = bridge.snapshot();
      return { available: true, tools, state };
    })()
  `);
  if (!result?.available) return { available: false, tools: [] };
  return {
    available: true,
    tools: result.tools || [],
    state: sanitizeJson(result.state),
  };
};

const sanitizeJson = (value: unknown): unknown => {
  if (typeof value === "string") return redactSensitiveText(value, 1000);
  if (Array.isArray(value)) return value.slice(0, 50).map(sanitizeJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 80)
      .map(([key, item]) => [
        key,
        /token|secret|password|cookie|key/i.test(key) ? "[redacted]" : sanitizeJson(item),
      ]),
  );
};
