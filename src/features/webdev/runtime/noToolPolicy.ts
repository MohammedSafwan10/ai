export const createNoOutputNudge = (afterToolResults = false) =>
  afterToolResults
    ? "The tool execution has completed. Now continue from the confirmed results: either provide the final user-facing summary of what changed and the important files touched, or call the next Web Dev tool if more work is needed. Do not remain silent."
    : "You produced no visible response and no tool call. Continue now: either answer the user naturally or call the appropriate Web Dev tool.";
