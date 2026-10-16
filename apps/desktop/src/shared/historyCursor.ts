/** Portable UTF-8 cursor shared by SQLite pagination and renderer history eviction. */
export const encodeHistoryCursor = (message: { id: string; createdAt: number }) =>
  btoa(Array.from(new TextEncoder().encode(JSON.stringify({ id: message.id, createdAt: message.createdAt })), (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
