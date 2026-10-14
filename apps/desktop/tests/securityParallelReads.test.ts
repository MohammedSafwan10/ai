import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "test" } }));
import { supportsParallelExecution } from "../src/main/agent/tools/orchestrator";
import { securityWorkspaceBlockReason } from "../src/main/kali/definitions";
import type { DesktopToolCall } from "../src/shared/types";
const call = (name: DesktopToolCall["name"], args = {}): DesktopToolCall => ({ id: "test", name, arguments: args });

describe("Security read scheduling and evidence", () => {
  it("parallelizes cached reads while keeping state reconciliation and shared browser actions serial", () => {
    for (const name of ["kali_capabilities", "security_finding_list"] as const) expect(supportsParallelExecution(call(name))).toBe(true);
    expect(supportsParallelExecution(call("kali_job_output"))).toBe(true);
    expect(supportsParallelExecution(call("kali_job_output", { follow: true }))).toBe(false);
    for (const name of ["kali_exec", "kali_job_status", "kali_job_cancel", "browser_open", "browser_screenshot"] as const) expect(supportsParallelExecution(call(name))).toBe(false);
  });
  it("allows browser evidence without granting general host access", () => {
    for (const name of ["browser_screenshot", "browser_evidence", "browser_pdf"] as const) expect(securityWorkspaceBlockReason(call(name), true)).toBeNull();
    for (const name of ["exec_command", "desktop_write_file", "computer_act"] as const) expect(securityWorkspaceBlockReason(call(name), true)).toBeTruthy();
  });
});
