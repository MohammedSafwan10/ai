import { describe, expect, it, vi } from "vitest";
import { DesktopToolExecutor } from "../src/main/agent/tools/executor";
import type { DesktopToolCall } from "../src/shared/types";

const call = (name: DesktopToolCall["name"], args: Record<string, unknown> = {}): DesktopToolCall => ({
  id: `call-${name}`,
  name,
  arguments: args,
});

const context = {
  workspaceId: "workspace",
  workspaceRoot: "D:/work",
  signal: new AbortController().signal,
  browserExternalApproved: true,
  onCommandOutput: vi.fn(),
};

describe("desktop browser tool executor gate", () => {
  it("routes phase 2c browser workflow tools instead of reporting unknown tool", async () => {
    const workflow = vi.fn(async () => ({ output: "recording", data: { workflow: { id: "wf1" } } }));
    const workflowAssert = vi.fn(async () => ({ output: "added", data: { assertion: { id: "a1" } } }));
    const evidenceVault = vi.fn(async () => ({ output: "saved", data: { evidence: { id: "e1" } } }));
    const diagnose = vi.fn(async () => ({ output: "diagnosed", data: { diagnosis: { kind: "timeout" } } }));
    const executor = new DesktopToolExecutor({
      workflow,
      workflowAssert,
      evidenceVault,
      diagnose,
      recordWorkflowTool: vi.fn(),
    } as never);

    await expect(executor.execute(call("browser_workflow", { action: "start_recording", name: "Smoke" }), context)).resolves.toMatchObject({ success: true });
    await expect(executor.execute(call("browser_assert", { action: "add", kind: "text_present", value: "Done" }), context)).resolves.toMatchObject({ success: true });
    await expect(executor.execute(call("browser_evidence_vault", { action: "save_current" }), context)).resolves.toMatchObject({ success: true });
    await expect(executor.execute(call("browser_diagnose"), context)).resolves.toMatchObject({ success: true });

    expect(workflow).toHaveBeenCalled();
    expect(workflowAssert).toHaveBeenCalled();
    expect(evidenceVault).toHaveBeenCalled();
    expect(diagnose).toHaveBeenCalled();
  });

  it("routes browser_capabilities through the browser executor", async () => {
    const executor = new DesktopToolExecutor({ recordWorkflowTool: vi.fn() } as never);

    const result = await executor.execute(call("browser_capabilities"), context);

    expect(result).toMatchObject({ success: true });
    expect(result.output).toContain("browser_workflow");
  });
});
