import type { ComputerAppRecord, ComputerSnapshotRecord, ComputerUseActionInput, ComputerUseActionResultRecord, ComputerWindowRecord } from "../../shared/types";
import type { ComputerUseBackend, ComputerUseCapabilitiesRecord } from "./types";

export class CuaComputerUseBackend implements ComputerUseBackend {
  readonly id = "cua_driver" as const;

  async capabilities(): Promise<ComputerUseCapabilitiesRecord> {
    return {
      backend: this.id,
      available: false,
      platform: process.platform,
      capabilities: [],
      limitations: [
        "Cua is intentionally not vendored into Privora v1.",
        "This adapter stays disabled until a separate audit, install model, telemetry review, and Windows smoke test pass.",
      ],
      diagnostics: ["adapter=placeholder", "status=not_audited"],
    };
  }

  async listWindows(): Promise<ComputerWindowRecord[]> {
    throw unavailable();
  }

  async focusWindow(): Promise<ComputerUseActionResultRecord> {
    throw unavailable();
  }

  async findApps(): Promise<ComputerAppRecord[]> {
    return [];
  }

  async snapshot(): Promise<ComputerSnapshotRecord> {
    throw unavailable();
  }

  async act(_input: ComputerUseActionInput): Promise<ComputerUseActionResultRecord> {
    throw unavailable();
  }

  async screenshot(): Promise<ComputerUseActionResultRecord> {
    throw unavailable();
  }

  async openApp(): Promise<ComputerUseActionResultRecord> {
    throw unavailable();
  }

  stop() {}
}

const unavailable = () =>
  new Error("Cua driver is not enabled in this build. Privora uses privora_windows_native by default; audit Cua separately before enabling this adapter.");
