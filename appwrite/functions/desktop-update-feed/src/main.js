const endpoint = process.env.APPWRITE_FUNCTION_API_ENDPOINT || process.env.APPWRITE_ENDPOINT || "https://sgp.cloud.appwrite.io/v1";
const projectId = process.env.APPWRITE_FUNCTION_PROJECT_ID || process.env.APPWRITE_PROJECT_ID || "69af9f0700103b7f3482";
const apiKey = process.env.APPWRITE_FUNCTION_API_KEY || process.env.APPWRITE_API_KEY;

const databaseId = process.env.RELEASES_DATABASE_ID || "privora_desktop";
const collectionId = process.env.RELEASES_COLLECTION_ID || "desktop_releases";
const bucketId = process.env.RELEASES_BUCKET_ID || "desktop-releases";

const noStoreHeaders = {
  "cache-control": "no-store, no-cache, must-revalidate",
  "pragma": "no-cache",
};
const jsonHeaders = { "content-type": "application/json; charset=utf-8", ...noStoreHeaders };
const textHeaders = { "content-type": "text/plain; charset=utf-8", ...noStoreHeaders };

const storageDownloadUrl = (fileId) =>
  `${endpoint}/storage/buckets/${bucketId}/files/${encodeURIComponent(fileId)}/download?project=${encodeURIComponent(projectId)}`;

const latestReleaseUrl = ({ platform, arch, channel }) => {
  const params = new URLSearchParams();
  params.append("queries[]", JSON.stringify({ method: "equal", attribute: "platform", values: [platform] }));
  params.append("queries[]", JSON.stringify({ method: "equal", attribute: "arch", values: [arch] }));
  params.append("queries[]", JSON.stringify({ method: "equal", attribute: "channel", values: [channel] }));
  params.append("queries[]", JSON.stringify({ method: "equal", attribute: "latest", values: [true] }));
  params.append("queries[]", JSON.stringify({ method: "limit", values: [1] }));
  params.append("ttl", "0");

  return `${endpoint}/databases/${databaseId}/collections/${collectionId}/documents?${params.toString()}`;
};

const findLatestRelease = async ({ platform, arch, channel }) => {
  const response = await fetch(latestReleaseUrl({ platform, arch, channel }), {
    headers: {
      "x-appwrite-project": projectId,
      ...(apiKey ? { "x-appwrite-key": apiKey } : {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Appwrite query failed with ${response.status}: ${body}`);
  }

  const data = await response.json();
  return data.documents?.[0] || null;
};

const releasePayload = (release, target) => ({
  platform: target.platform,
  arch: target.arch,
  channel: target.channel,
  version: release.version,
  releaseDate: release.releaseDate,
  notes: release.notes || "",
  files: {
    releases: storageDownloadUrl(release.releasesFileId),
    package: storageDownloadUrl(release.packageFileId),
    installer: release.installerFileId ? storageDownloadUrl(release.installerFileId) : null,
  },
  squirrelFeed: `/${target.platform}/${target.arch}/${target.channel}`,
});

const parseTarget = (path = "") => {
  const parts = path.split("/").filter(Boolean);
  return {
    platform: parts[0] || "win32",
    arch: parts[1] || "x64",
    channel: parts[2] || "stable",
    fileName: parts[3] || "",
  };
};

const fetchText = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Storage fetch failed with ${response.status}`);
  }
  return response.text();
};

export default async ({ req, res, error }) => {
  try {
    const target = parseTarget(req.path);
    const release = await findLatestRelease(target);

    if (!release) {
      return res.json({ error: "No release found.", ...target }, 404, jsonHeaders);
    }

    if (!target.fileName) {
      return res.json(releasePayload(release, target), 200, jsonHeaders);
    }

    if (target.fileName === "RELEASES") {
      const body = await fetchText(storageDownloadUrl(release.releasesFileId));
      return res.text(body, 200, textHeaders);
    }

    if (target.fileName.endsWith(".nupkg")) {
      return res.redirect(storageDownloadUrl(release.packageFileId), 302);
    }

    if (target.fileName.endsWith(".exe") && release.installerFileId) {
      return res.redirect(storageDownloadUrl(release.installerFileId), 302);
    }

    return res.json({ error: "Unknown release file.", fileName: target.fileName }, 404, jsonHeaders);
  } catch (err) {
    error(err.message);
    return res.json({ error: "Update feed failed." }, 500, jsonHeaders);
  }
};
