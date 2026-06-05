import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BrowserWorkflowManager, classifyDiagnosis } from "../src/main/browser/browserWorkflow";

const tempDirs: string[] = [];

const makeManager = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "privora-browser-workflow-"));
  tempDirs.push(dir);
  return { dir, manager: new BrowserWorkflowManager(dir) };
};

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("browser workflow manager", () => {
  it("records reusable workflow steps and redacts sensitive field values", () => {
    const { manager } = makeManager();
    const workflow = manager.startRecording("workspace-1", "Checkout smoke");

    manager.recordStep({
      workspaceId: "workspace-1",
      action: "browser_open",
      args: { url: "https://example.com/path?token=secret" },
    });
    manager.recordStep({
      workspaceId: "workspace-1",
      action: "browser_form_fill",
      args: {
        formId: "f1",
        fields: [
          { fieldId: "f1-c1", name: "email", value: "person@example.com" },
          { fieldId: "f1-c2", name: "password", value: "super-secret-password" },
        ],
      },
      targetStrategy: { formId: "f1", formLabel: "Login" },
    });

    const stopped = manager.stopRecording("workspace-1", workflow.id);
    expect(stopped?.steps).toHaveLength(2);
    expect(stopped?.steps[0].args.url).toBe("https://example.com/path?...");
    expect(JSON.stringify(stopped)).not.toContain("super-secret-password");
    expect(JSON.stringify(stopped)).not.toContain("person@example.com");
    expect(JSON.stringify(stopped)).toContain("privora@example.test");
    expect(stopped?.steps[1].redactionLevel).toBe("sensitive");
  });

  it("stores bounded evidence summaries without inline binary artifacts", () => {
    const { manager } = makeManager();
    const workflow = manager.startRecording("workspace-1", "Evidence smoke");
    manager.stopRecording("workspace-1", workflow.id);

    const evidence = manager.saveEvidence({
      workspaceId: "workspace-1",
      workflowId: workflow.id,
      tabId: "tab-1",
      data: {
        url: "https://example.com/?api_key=secret",
        title: "Example",
        screenshotPath: "C:/Users/Thumbeja/AppData/Roaming/Privora/browser-artifacts/shot.png",
        visibleText: "Loaded page with bearer abc.def.ghi and public text",
        console: [{ level: "error", message: "token=secret" }],
        requests: [{ url: "https://example.com/api", status: 500, headers: { Authorization: "Bearer secret" } }],
      },
    });

    expect(evidence.url).toBe("https://example.com/?...");
    expect(evidence.artifactPaths).toEqual(["C:/Users/Thumbeja/AppData/Roaming/Privora/browser-artifacts/shot.png"]);
    expect(JSON.stringify(evidence)).not.toContain("Bearer secret");
    expect(JSON.stringify(evidence)).not.toContain("abc.def.ghi");
  });

  it("adds assertions, tracks run status, and classifies diagnoses", () => {
    const { manager } = makeManager();
    const workflow = manager.startRecording("workspace-1", "Replay smoke");
    manager.recordStep({ workspaceId: "workspace-1", action: "browser_wait", args: { for: "text", value: "Ready" } });
    manager.stopRecording("workspace-1", workflow.id);
    const assertion = manager.addAssertion("workspace-1", { workflowId: workflow.id, kind: "text_present", value: "Success" });
    const run = manager.beginRun("workspace-1", workflow.id);
    const diagnosis = classifyDiagnosis("Submit button stayed disabled because email is invalid.");
    manager.finishRun(run, "failed", diagnosis);

    const panel = manager.panelState("workspace-1");
    expect(assertion.kind).toBe("text_present");
    expect(panel.workflows[0]).toMatchObject({ id: workflow.id, stepCount: 1, assertionCount: 1, lastRunStatus: "failed" });
    expect(panel.lastRun?.diagnosis?.kind).toBe("element_disabled");
    expect(manager.diagnose("workspace-1").kind).toBe("element_disabled");
    expect(manager.diagnose("workspace-1", undefined, "Text missing: Newer assertion text").finding).toContain("Newer assertion text");
  });

  it("returns and retrieves completed run status", () => {
    const { manager } = makeManager();
    const workflow = manager.startRecording("workspace-1", "Passed replay");
    manager.stopRecording("workspace-1", workflow.id);
    const run = manager.beginRun("workspace-1", workflow.id);

    const finished = manager.finishRun(run, "passed");

    expect(finished.status).toBe("passed");
    expect(finished.endedAt).toBeTypeOf("number");
    expect(manager.getRun("workspace-1", finished.id).status).toBe("passed");
  });

  it("diagnoses failed text assertions with the actual missing text", () => {
    const diagnosis = classifyDiagnosis("text_present assertion failed: Text missing: Definitely absent success text.");

    expect(diagnosis.kind).toBe("element_missing");
    expect(diagnosis.finding).toContain("Expected page text was missing");
    expect(diagnosis.finding).toContain("Definitely absent success text");
  });
});
