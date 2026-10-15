export const agentIdentity = (id: string) => {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  hash >>>= 0;
  return { shape: hash % 32, tint: Math.floor(hash / 32) % 7 };
};

export const relativeAgentTime = (timestamp: number, now: number) => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  const minutes = Math.floor(Math.max(0, now - timestamp) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 43200) return `${Math.floor(minutes / 1440)}d ago`;
  return `${Math.floor(minutes / 43200)}mo ago`;
};
