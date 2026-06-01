export class StreamStalledError extends Error {}

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown error";

export const windowlessInterval = (callback: () => void, ms: number) =>
  setInterval(callback, ms);
