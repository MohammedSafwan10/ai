import type { ToolActivityItemRecord } from "../../../shared/types";

export const normalizeStreamingPatchText = (value: string) =>
  value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, "\"")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

export const streamingPatchActivities = (patch: string): ToolActivityItemRecord[] => {
  const items: ToolActivityItemRecord[] = [];
  let currentIndex = -1;
  let pendingMoveFrom = "";

  for (const line of normalizeStreamingPatchText(patch).split("\n")) {
    const add = line.match(/^\*\*\* Add File:\s*(.+)$/);
    const update = line.match(/^\*\*\* Update File:\s*(.+)$/);
    const del = line.match(/^\*\*\* Delete File:\s*(.+)$/);
    const move = line.match(/^\*\*\* Move to:\s*(.+)$/);
    if (add) {
      pendingMoveFrom = "";
      currentIndex = pushActivity(items, { verb: "Creating", path: add[1].trim(), additions: 0, deletions: 0 });
      continue;
    }
    if (update) {
      pendingMoveFrom = update[1].trim();
      currentIndex = pushActivity(items, { verb: "Editing", path: pendingMoveFrom, additions: 0, deletions: 0 });
      continue;
    }
    if (del) {
      pendingMoveFrom = "";
      currentIndex = pushActivity(items, { verb: "Deleting", path: del[1].trim(), additions: 0, deletions: 0 });
      continue;
    }
    if (move && pendingMoveFrom && currentIndex >= 0) {
      items[currentIndex] = { ...items[currentIndex], verb: "Moving", path: `${pendingMoveFrom} -> ${move[1].trim()}` };
      continue;
    }
    if (currentIndex < 0) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) {
      items[currentIndex] = { ...items[currentIndex], additions: (items[currentIndex].additions || 0) + 1 };
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      items[currentIndex] = { ...items[currentIndex], deletions: (items[currentIndex].deletions || 0) + 1 };
    }
  }

  return items.filter((item) => item.path);
};

const pushActivity = (items: ToolActivityItemRecord[], item: ToolActivityItemRecord) => {
  items.push(item);
  return items.length - 1;
};
