import fs from "node:fs/promises";
import path from "node:path";
import { FiltersEngine, Request, type ElectronRequestType } from "@ghostery/adblocker";

export interface FilterMatchInput {
  url: string;
  sourceUrl?: string;
  resourceType: ElectronRequestType;
  requestId?: string;
  tabId?: number;
}

export interface FilterMatchResult {
  matched: boolean;
  ruleSource?: string;
}

export class GhosteryFilterEngine {
  private engine: FiltersEngine | null = null;
  private readyPromise: Promise<void> | null = null;
  private lastError: string | undefined;

  constructor(private cachePath: string) {}

  get ready() {
    return Boolean(this.engine);
  }

  get error() {
    return this.lastError;
  }

  preload() {
    if (!this.readyPromise) {
      this.readyPromise = this.load().catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error);
      });
    }
    return this.readyPromise;
  }

  match(input: FilterMatchInput): FilterMatchResult {
    if (!this.engine) return { matched: false };
    try {
      const response = this.engine.match(Request.fromRawDetails({
        requestId: input.requestId,
        tabId: input.tabId,
        url: input.url,
        sourceUrl: input.sourceUrl || input.url,
        type: input.resourceType,
      }));
      return {
        matched: response.match && !response.exception,
        ruleSource: response.filter?.toString(),
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return { matched: false };
    }
  }

  private async load() {
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
    this.engine = await FiltersEngine.fromPrebuiltAdsAndTracking(fetch, {
      path: this.cachePath,
      read: fs.readFile,
      write: fs.writeFile,
    });
    this.lastError = undefined;
  }
}
