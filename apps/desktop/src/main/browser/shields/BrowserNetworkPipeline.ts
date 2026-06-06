import type { BrowserShieldsBlockedRequestRecord } from "../../../shared/types";
import { isHardBlockedUrl } from "../browserSecurity";
import { ShieldsManager } from "./ShieldsManager";

export interface BrowserNetworkPipelineOptions {
  workspaceId: string;
  shields: ShieldsManager;
  onShieldsBlocked?: (record: BrowserShieldsBlockedRequestRecord, details: Electron.OnBeforeRequestListenerDetails) => void;
}

export class BrowserNetworkPipeline {
  constructor(private options: BrowserNetworkPipelineOptions) {}

  handleBeforeRequest(details: Electron.OnBeforeRequestListenerDetails) {
    if (isHardBlockedUrl(details.url)) return { cancel: true };
    if (details.resourceType === "mainFrame") return { cancel: false };
    const decision = this.options.shields.evaluate(this.options.workspaceId, details);
    if (decision.blocked && decision.record) {
      this.options.onShieldsBlocked?.(decision.record, details);
      return { cancel: true };
    }
    return { cancel: false };
  }
}
