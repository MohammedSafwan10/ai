import { describe, expect, it } from "vitest";
import { categoryForTool, liveStatusForTool, previewForTool, titleForTool } from "../src/main/agent/harness/support/toolActivity";
import { kaliCommandPreview } from "../src/main/kali/tools";

describe("Kali tool activity", () => {
  it("identifies remote execution without displaying credential flags", () => {
    const call = { id: "call", name: "kali_exec" as const, arguments: { argv: ["check", "--password", "credential-value", "--token=another-value", "host"] } };
    expect(titleForTool(call)).toBe("Kali · Run check --password [redacted] --token=[redacted] host");
    expect(call.arguments.argv[2]).toBe("credential-value");
    expect(categoryForTool(call)).toBe("terminal");
    expect(liveStatusForTool(call, "running")).toBe("Running in Kali");
    expect(liveStatusForTool(call, "done")).toBeUndefined();
  });

  it("keeps opaque shell and interpreter code out of stored display labels", () => {
    for (const argv of [["/bin/bash", "-lc", "echo sensitive-body"], ["python3", "-c", "print('sensitive-body')"]]) {
      expect(kaliCommandPreview(argv)).not.toContain("sensitive-body");
      expect(kaliCommandPreview(argv)).toContain("[redacted]");
    }
    expect(kaliCommandPreview(["curl", "-u", "username:credential", "https://user:pass@example.com"])).not.toMatch(/credential|user:pass/);
  });

  it("uses readable lifecycle and evidence titles", () => {
    expect(titleForTool({ id: "status", name: "kali_job_status", arguments: { jobId: "job" } })).toBe("Kali · Check job status");
    expect(titleForTool({ id: "cancel", name: "kali_job_cancel", arguments: { jobId: "job" } })).toBe("Kali · Stop job");
    expect(titleForTool({ id: "artifact", name: "kali_artifact", arguments: { jobId: "job", path: "evidence.txt" } })).toBe("Kali · Collect evidence.txt");
    expect(categoryForTool({ id: "environment", name: "kali_capabilities", arguments: {} })).toBe("diagnostic");
  });

  it("bounds and redacts remote previews while leaving ordinary output intact", () => {
    const call = { id: "output", name: "kali_job_output" as const, arguments: { jobId: "job" } };
    expect(previewForTool(call, "ready\npassword=credential-value\n")).toBe("ready\n[redacted]\n");
    expect(previewForTool(call, "x".repeat(20_000))).toHaveLength(12_000);
  });
});
