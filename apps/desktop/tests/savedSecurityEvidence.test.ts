import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { SavedEvidenceActions } from "../src/renderer/components/ToolTimeline";
import { savedSecurityEvidence } from "../src/shared/savedSecurityEvidence";
import type { ToolEventRecord } from "../src/shared/types";
const localPath = String.raw`C:\Privora Evidence\Bug bounty-123\evidence-AbC\files\file-report.final.md`;
const tool: ToolEventRecord = { id: "saved", threadId: "thread", messageId: "answer", callId: "collect", name: "kali_artifact", title: "Collect report", status: "done", risk: "safe", args: {}, createdAt: 1, updatedAt: 1, result: { success: true, data: { localSaved: true, localPath, sha256: "a".repeat(64), attachment: { name: "report.final.md", size: 1234 } } } };
describe("recorded PC evidence actions", () => {
  it("preserves the exact path and extension independently of misleading assistant or output text", () => {
    const evidence = savedSecurityEvidence({ ...tool, output: "Saved elsewhere: C:\\wrong\\reportmd" });
    expect(evidence).toEqual({ localPath, name: "report.final.md", size: 1234, sha256: "a".repeat(64) });
    const html = renderToStaticMarkup(createElement(SavedEvidenceActions, { tool }));
    expect(html).toContain(localPath); expect(html).toContain("Copy path"); expect(html).toContain("Open folder"); expect(html).toContain("Recorded at collection time.");
  });
  it("does not offer host actions for failed, incomplete or unconfirmed collections", () => {
    for (const candidate of [{ ...tool, name: "kali_exec" }, { ...tool, status: "running" as const }, { ...tool, result: { success: false, data: tool.result!.data } }, { ...tool, result: { success: true, data: { localSaved: false, localPath } } }, { ...tool, result: { success: true, data: { localSaved: true } } }]) {
      expect(savedSecurityEvidence(candidate)).toBeNull(); expect(renderToStaticMarkup(createElement(SavedEvidenceActions, { tool: candidate }))).toBe("");
    }
  });
});
