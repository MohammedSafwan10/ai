import { describe, expect, it } from "vitest";
import { CausalJournal } from "../src/main/browser/causalJournal";

describe("causal journal", () => {
  it("builds compact causal findings from console and network evidence", async () => {
    const journal = new CausalJournal("workspace");
    journal.recordConsole({
      level: "error",
      message: "Auth failed token=secret",
      sourceId: "src/auth.ts",
      lineNumber: 84,
    });
    journal.recordRequest({
      id: "1",
      url: "http://localhost:5173/api/session?token=secret",
      method: "POST",
      status: 401,
      startedAt: Date.now(),
    });
    journal.begin("Clicked Sign in", { url: "http://localhost:5173/", title: "App" });
    const finding = await journal.finish(fakeContents(), { url: "http://localhost:5173/", title: "App" });

    expect(finding?.finding).toContain("Clicked Sign in");
    expect(finding?.finding).toContain("POST http://localhost:5173/api/session?...");
    expect(finding?.consoleErrors[0]?.message).toContain("[redacted]");
  });

  it("clears page-scoped console and network evidence", () => {
    const journal = new CausalJournal("workspace");
    journal.recordConsole({ level: "error", message: "stale error" });
    journal.recordRequest({
      id: "stale",
      url: "http://localhost:5173/stale",
      method: "GET",
      status: 500,
      startedAt: Date.now(),
    });

    journal.clearPageEvidence();

    expect(journal.recentConsole()).toEqual([]);
    expect(journal.recentNetwork()).toEqual([]);
  });
});

const fakeContents = () => ({
  getURL: () => "http://localhost:5173/",
  getTitle: () => "App",
}) as Electron.WebContents;
