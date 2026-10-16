import { describe, expect, it } from "vitest";
import { agentDisplayTime } from "../src/renderer/features/chat/agentIdentity";
import type { SubagentRecord } from "../src/shared/types";

const agent = { status: "completed", createdAt: 100, updatedAt: 900, finishedAt: 200 } as SubagentRecord;
describe("agent list timestamps", () => {
  it("uses completion and close times despite newer metadata updates", () => {
    expect(agentDisplayTime(agent)).toEqual({ timestamp: 200, label: "Completed" });
    expect(agentDisplayTime({ ...agent, status: "closed", closedAt: 300 })).toEqual({ timestamp: 300, label: "Closed" });
    expect(agentDisplayTime({ ...agent, status: "running" })).toEqual({ timestamp: 900, label: "Last updated" });
  });
  it("labels missing historic finish times honestly instead of using a recent update", () => {
    expect(agentDisplayTime({ ...agent, finishedAt: undefined })).toEqual({ timestamp: 100, label: "Created (finish time unavailable)" });
  });
});
