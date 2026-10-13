/** A chat retains its send lock until its actual submission promise settles. */
export const beginPromptSubmission = (
  pending: Set<string>, threadId: string, start: () => Promise<void>,
): Promise<void> | null => {
  if (pending.has(threadId)) return null;
  pending.add(threadId);
  return Promise.resolve().then(start).finally(() => pending.delete(threadId));
};
