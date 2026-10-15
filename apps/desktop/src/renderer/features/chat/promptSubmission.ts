/** A chat retains its send lock until its actual submission promise settles. */
export const promptSubmissionError = (error: unknown) => {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "").trim() || "Could not send the message. Try again after checking the project and connection.";
};

export const beginPromptSubmission = (
  pending: Set<string>, threadId: string, start: () => Promise<void>,
): Promise<void> | null => {
  if (pending.has(threadId)) return null;
  pending.add(threadId);
  return Promise.resolve().then(start).finally(() => pending.delete(threadId));
};
