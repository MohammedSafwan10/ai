type PlanPart = { type: "text" | "plan"; text: string };

/** Only standalone protocol markers outside Markdown code are actionable. */
export const splitProposedPlan = (text: string): PlanPart[] => {
  const parts: PlanPart[] = [];
  let cursor = 0;
  let position = 0;
  let planStart: { marker: number; body: number } | null = null;
  let fence: { character: string; length: number } | null = null;
  let inlineCodeLength = 0;
  const escapedAt = (offset: number) => {
    let slashes = 0;
    let index = offset - 1;
    while (index >= 0 && text[index] === "\\") { slashes += 1; index -= 1; }
    return slashes % 2 === 1;
  };
  const lastTicks = new Map<number, number>();
  for (const ticks of text.matchAll(/`+/g)) {
    if (!escapedAt(ticks.index)) lastTicks.set(ticks[0].length, ticks.index);
  }
  for (const match of text.matchAll(/[^\n]*(?:\n|$)/g)) {
    const line = match[0];
    if (!line) continue;
    const body = line.replace(/\r?\n$/, "");
    const marker = body.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
    } else if (marker && inlineCodeLength === 0) {
      fence = { character: marker[1][0], length: marker[1].length };
    } else if (inlineCodeLength === 0 && /^ {0,3}<proposed_plan>\s*$/.test(body)) {
      if (!planStart) planStart = { marker: position, body: position + line.length };
    } else if (inlineCodeLength === 0 && planStart && /^ {0,3}<\/proposed_plan>\s*$/.test(body)) {
      if (planStart.marker > cursor) parts.push({ type: "text", text: text.slice(cursor, planStart.marker) });
      const plan = text.slice(planStart.body, position).trim();
      if (plan) parts.push({ type: "plan", text: plan });
      cursor = position + line.length;
      planStart = null;
    } else if (!/^ {4}|^\t/.test(body)) {
      for (const ticks of body.matchAll(/`+/g)) {
        const index = position + ticks.index;
        if (escapedAt(index)) continue;
        if (inlineCodeLength === 0 && (lastTicks.get(ticks[0].length) ?? -1) > index) inlineCodeLength = ticks[0].length;
        else if (ticks[0].length === inlineCodeLength) inlineCodeLength = 0;
      }
    }
    position += line.length;
  }
  if (cursor < text.length) parts.push({ type: "text", text: text.slice(cursor) });
  return parts.length ? parts : [{ type: "text", text }];
};
