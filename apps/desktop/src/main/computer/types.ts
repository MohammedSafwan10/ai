import type {
  ComputerAppRecord,
  ComputerSnapshotRecord,
  ComputerUseActionInput,
  ComputerUseActionResultRecord,
  ComputerUseBackendId,
  ComputerUseCapability,
  ComputerWindowRecord,
} from "../../shared/types";

export interface ComputerUseCapabilitiesRecord {
  backend: ComputerUseBackendId;
  available: boolean;
  platform: NodeJS.Platform;
  capabilities: ComputerUseCapability[];
  limitations: string[];
  diagnostics: string[];
}

export interface ComputerUseBackend {
  id: ComputerUseBackendId;
  capabilities(signal?: AbortSignal): Promise<ComputerUseCapabilitiesRecord>;
  listWindows(signal?: AbortSignal): Promise<ComputerWindowRecord[]>;
  focusWindow(windowId: string, signal?: AbortSignal): Promise<ComputerUseActionResultRecord>;
  findApps(input: { query?: string; limit?: number }, signal?: AbortSignal): Promise<ComputerAppRecord[]>;
  snapshot(input: { windowId?: string; depth?: number; includeBoxes?: boolean; scope?: "window" | "active_document" | "matching_controls"; role?: string; editableOnly?: boolean }, signal?: AbortSignal): Promise<ComputerSnapshotRecord>;
  act(input: ComputerUseActionInput, signal?: AbortSignal): Promise<ComputerUseActionResultRecord>;
  resolveCachedNode?(ref: string, windowId?: string): ComputerSnapshotRecord["nodes"][number] | undefined;
  screenshot(input: { windowId?: string; x?: number; y?: number; width?: number; height?: number; artifactPath: string }, signal?: AbortSignal): Promise<ComputerUseActionResultRecord>;
  openApp(input: { app?: string; path?: string; args?: string[]; interactionMode?: "background_only" | "allow_foreground" }, signal?: AbortSignal): Promise<ComputerUseActionResultRecord>;
  stop(): void;
}
