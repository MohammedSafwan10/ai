/** Full output remains available in saved tool records; retain a bounded live preview. */
export const compactLiveOutput = (value: string, maxChars = 40_000) => {
  if (value.length <= maxChars) return value;
  const head = value.slice(0, 10_000);
  const tail = value.slice(-(maxChars - 10_000));
  return `${head}\n\n[... live output compacted ...]\n\n${tail}`;
};
