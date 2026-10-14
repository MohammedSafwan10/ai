import { describe, expect, it } from "vitest";
import { categoryForTool, liveStatusForTool, previewForTool, titleForTool } from "../src/main/agent/harness/support/toolActivity";
import { kaliCommandPreview } from "../src/main/kali/tools";

describe("Kali tool activity", () => {
  it("shows the operator's complete command without changing execution arguments", () => {
    const call = { id: "call", name: "kali_exec" as const, arguments: { argv: ["check", "--password", "credential-value", "--token=another-value", "host"] } };
    expect(titleForTool(call)).toBe("Kali · Run check --password credential-value --token=another-value host");
    expect(call.arguments.argv[2]).toBe("credential-value");
    expect(categoryForTool(call)).toBe("terminal");
    expect(liveStatusForTool(call, "running")).toBe("Running in Kali");
    expect(liveStatusForTool(call, "done")).toBeUndefined();
  });

  it("keeps shell and interpreter source visible in command history", () => {
    for (const argv of [["/bin/bash", "-lc", "echo sensitive-body"], ["python3", "-c", "print('sensitive-body')"]]) {
      expect(kaliCommandPreview(argv)).toContain("sensitive-body");
      expect(kaliCommandPreview(argv)).not.toContain("[redacted]");
    }
    expect(kaliCommandPreview(["curl", "-u", "username:credential", "https://user:pass@example.com"])).toContain("username:credential");
  });

  it("uses readable lifecycle and evidence titles", () => {
    expect(titleForTool({ id: "status", name: "kali_job_status", arguments: { jobId: "job" } })).toBe("Kali · Check job status");
    expect(titleForTool({ id: "cancel", name: "kali_job_cancel", arguments: { jobId: "job" } })).toBe("Kali · Stop job");
    expect(titleForTool({ id: "artifact", name: "kali_artifact", arguments: { jobId: "job", path: "evidence.txt" } })).toBe("Kali · Collect evidence.txt");
    expect(categoryForTool({ id: "environment", name: "kali_capabilities", arguments: {} })).toBe("diagnostic");
  });

  it("bounds remote previews without masking the VM output", () => {
    const call = { id: "output", name: "kali_job_output" as const, arguments: { jobId: "job" } };
    expect(previewForTool(call, "ready\npassword=credential-value\n")).toBe("ready\npassword=credential-value\n");
    expect(previewForTool(call, "x".repeat(20_000))).toHaveLength(12_000);
  });
});
