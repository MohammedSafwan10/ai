import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolTimeline, TerminalOutputPanel, cleanTerminalText, mergeToolDetail, terminalOutputSections, terminalCommandText } from "../src/renderer/components/ToolTimeline";
import type { ToolEventRecord } from "../src/shared/types";

const tool = (overrides: Partial<ToolEventRecord> = {}): ToolEventRecord => ({
  id: "terminal", threadId: "thread", messageId: "message", callId: "call", name: "kali_exec",
  title: "Kali · Run bash -c [redacted]", args: { argv: ["bash", "-c", "printf 'hello\\n'\nprintf 'done\\n'"] },
  status: "done", risk: "risky", output: "hello\ndone\n", createdAt: 1, updatedAt: 2, ...overrides,
});

describe("terminal output history", () => {
  it.each(["done", "failed", "cancelled", "running"] as const)("keeps Kali output expandable when %s", (status) => {
    const html = renderToStaticMarkup(createElement(ToolTimeline, {
      tools: [tool({ status })], messageStatus: status === "running" ? "running" : "completed", defaultOpen: true,
      onApprove: () => {}, onApproveAll: () => {},
    }));
    expect(html).toContain('title="Expand output"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Kali · bash");
    expect(html).not.toContain("[redacted]");
  });
  it("offers a command and reopen control even before output arrives or for silent commands", () => {
    const event = tool({ output: "" });
    const sections = terminalOutputSections(event, "");
    expect(sections[0]).toEqual({ label: "Command", value: "bash -c\nprintf 'hello\\n'\nprintf 'done\\n'" });
    expect(sections[1]).toEqual({ label: "Output", value: "" });
    const html = renderToStaticMarkup(createElement(ToolTimeline, { tools: [event], messageStatus: "completed", defaultOpen: true, onApprove: () => {}, onApproveAll: () => {} }));
    expect(html).toContain('title="Expand output"');
  });
  it("renders copy controls for command and output after completion", () => {
    const html = renderToStaticMarkup(createElement(TerminalOutputPanel, { tool: tool(), output: "hello\ndone\n" }));
    expect(html).toContain('aria-label="Copy command"');
    expect(html).toContain('aria-label="Copy output"');
    expect(html).toContain("hello\ndone");
  });
  it("does not mistake program flags for interpreter script arguments", () => {
    expect(terminalCommandText(tool({ args: { argv: ["nmap", "-sC", "lab.example"] } }))).toBe("nmap -sC lab.example");
  });
  it("prefers hydrated output over its same-version preview while preserving newer live data", () => {
    const preview = tool({ output: "tail only", detailAvailable: true });
    const detail = tool({ output: "full command output" });
    expect(mergeToolDetail(preview, detail).output).toBe("full command output");
    expect(mergeToolDetail(tool({ updatedAt: 3, output: "new stream" }), detail).output).toBe("new stream");
    const hydrated = tool({ output: "full command output", result: { success: true, output: "short preview" } });
    expect(terminalOutputSections(hydrated, hydrated.output!)).toContainEqual({ label: "Output", value: "full command output" });
  });
  it("cleans ANSI formatting and carriage returns without interpreting output as markup", () => {
    expect(cleanTerminalText("\x1b[31mready\x1b[0m\rprogress\r\ndone")).toBe("ready\nprogress\ndone");
    expect(cleanTerminalText("<script>example</script>")).toBe("<script>example</script>");
  });
});
