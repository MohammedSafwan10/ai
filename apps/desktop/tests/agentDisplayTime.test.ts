import { describe, expect, it } from "vitest";
import { agentDisplayTime, agentListTime, sortAgentRows } from "../src/renderer/features/chat/agentIdentity";
import type { SubagentRecord } from "../src/shared/types";

const agent = { status: "completed", createdAt: 100, updatedAt: 900, finishedAt: 200 } as SubagentRecord;
describe("agent list timestamps", () => {
  it("keeps active launch order and list timestamps stable across alternating stream updates", () => {
    let rows = [
      { ...agent, id: "b", createdAt: 200, status: "running" as const },
      { ...agent, id: "a", createdAt: 100, status: "running" as const },
      { ...agent, id: "c", createdAt: 200, status: "waiting" as const },
    ];
    for (let tick = 0; tick < 30; tick++) {
      rows = rows.map((row, index) => index === tick % rows.length ? { ...row, updatedAt: 1000 + tick } : row);
      expect(sortAgentRows(rows, true).map((row) => row.id)).toEqual(["a", "b", "c"]);
      expect(agentListTime(rows[0], true)).toEqual({ timestamp: 200, label: "Created" });
    }
    expect(rows.map((row) => row.id)).toEqual(["b", "a", "c"]);
  });
  it("orders finished rows by their stable finish times, including unavailable legacy times", () => {
    const rows = [
      { ...agent, id: "older", finishedAt: 200, updatedAt: 9000 },
      { ...agent, id: "newer", finishedAt: 300, updatedAt: 900 },
      { ...agent, id: "legacy", finishedAt: undefined, createdAt: 50, updatedAt: 99999 },
    ];
    expect(sortAgentRows(rows, false).map((row) => row.id)).toEqual(["newer", "older", "legacy"]);
    expect(sortAgentRows(rows.map((row) => ({ ...row, updatedAt: row.updatedAt + 99999 })), false).map((row) => row.id)).toEqual(["newer", "older", "legacy"]);
    expect(agentListTime({ ...rows[0], status: "closed", closedAt: 400 }, false)).toEqual({ timestamp: 400, label: "Closed" });
  });
  it("uses completion and close times despite newer metadata updates", () => {
    expect(agentDisplayTime(agent)).toEqual({ timestamp: 200, label: "Completed" });
    expect(agentDisplayTime({ ...agent, status: "closed", closedAt: 300 })).toEqual({ timestamp: 300, label: "Closed" });
    expect(agentDisplayTime({ ...agent, status: "running" })).toEqual({ timestamp: 900, label: "Last updated" });
  });
  it("labels missing historic finish times honestly instead of using a recent update", () => {
    expect(agentDisplayTime({ ...agent, finishedAt: undefined })).toEqual({ timestamp: 100, label: "Created (finish time unavailable)" });
  });
  it("uses actual streamed activity only for live agents", () => {
    expect(agentDisplayTime({ ...agent, status: "running" }, 1200)).toEqual({ timestamp: 1200, label: "Last updated" });
    expect(agentDisplayTime({ ...agent, status: "running" }, 500).timestamp).toBe(900);
    expect(agentDisplayTime({ ...agent, status: "running" }, NaN).timestamp).toBe(900);
    expect(agentDisplayTime(agent, 1200)).toEqual({ timestamp: 200, label: "Completed" });
  });
});
