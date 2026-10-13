const SAFE_IMAGE_TYPES = /^image\/(?:png|jpeg|webp|gif)$/;

/** Serves only app-owned content-addressed blobs; never executes evidence markup. */
export const attachmentProtocolResponse = (
  request: Request,
  load: (artifactId: string) => Uint8Array,
  devServerUrl?: string,
) => {
  const origin = request.headers.get("Origin");
  const allowedOrigin = devServerUrl ? new URL(devServerUrl).origin : "null";
  if (origin && origin !== allowedOrigin) return new Response(null, { status: 403 });
  const headers: Record<string, string> = {
    "Cache-Control": "private, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Vary": "Origin",
  };
  if (origin === allowedOrigin) headers["Access-Control-Allow-Origin"] = allowedOrigin;
  const empty = (status: number) => new Response(null, { status, headers });
  if (request.method !== "GET") return empty(405);
  try {
    const url = new URL(request.url);
    if (url.protocol !== "privora-attachment:" || url.hostname !== "artifact") return empty(404);
    const artifactId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (!/^[a-f0-9]{64}\.bin$/.test(artifactId)) return empty(400);
    const mimeType = url.searchParams.get("mime") || "application/octet-stream";
    headers["Content-Type"] = SAFE_IMAGE_TYPES.test(mimeType) ? mimeType : mimeType === "text/plain" ? "text/plain; charset=utf-8" : "application/octet-stream";
    return new Response(new Uint8Array(load(artifactId)), { status: 200, headers });
  } catch {
    return empty(404);
  }
};
