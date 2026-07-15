#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");
const packagePath = path.join(desktopRoot, "package.json");

const config = {
  endpoint: "https://sgp.cloud.appwrite.io/v1",
  projectId: "69af9f0700103b7f3482",
  databaseId: "privora_desktop",
  collectionId: "desktop_releases",
  bucketId: "desktop-releases",
  platform: "win32",
  arch: "x64",
  channel: "stable",
  feedUrl: "https://updates.nexdark.com/win32/x64/stable",
};

const args = parseArgs(process.argv.slice(2));

main();

function main() {
  if (args.help) {
    printHelp();
    return;
  }

  const signingEnabled = validateSigningConfig();
  assertCommand("git", ["--version"]);
  assertCommand("npm", ["--version"]);
  assertCommand("appwrite", ["--version"]);
  configureAppwriteClient();
  assertAppwriteAccess();
  assertCleanGitUnlessAllowed();

  const previousPackageVersion = readPackageVersion();
  const targetVersion = resolveTargetVersion(previousPackageVersion);
  const versionToken = toVersionToken(targetVersion);

  log(`Preparing Windows x64 release ${targetVersion}.`);
  updatePackageVersion(targetVersion, previousPackageVersion);

  run("npm", ["--prefix", "apps/desktop", "run", "lint"], { cwd: repoRoot });
  run("npm", ["--prefix", "apps/desktop", "test"], { cwd: repoRoot });
  run("npm", ["--prefix", "apps/desktop", "run", "make:win:x64"], { cwd: repoRoot });

  const artifactRoot = path.join(desktopRoot, "out", "make", "squirrel.windows", "x64");
  const installerSourcePath = path.join(artifactRoot, "PrivoraSetup.exe");
  const versionedInstallerPath = path.join(artifactRoot, `PrivoraSetup-${targetVersion}.exe`);
  if (!fs.existsSync(installerSourcePath)) {
    throw new Error(`Missing release artifact: ${installerSourcePath}`);
  }
  fs.copyFileSync(installerSourcePath, versionedInstallerPath);

  const artifacts = {
    releases: {
      id: `win-x64-${versionToken}-releases`,
      path: path.join(artifactRoot, "RELEASES"),
    },
    package: {
      id: `win-x64-${versionToken}-nupkg`,
      path: path.join(artifactRoot, `Privora-${targetVersion}-full.nupkg`),
    },
    installer: {
      id: `win-x64-${versionToken}-setup`,
      path: versionedInstallerPath,
    },
  };

  Object.values(artifacts).forEach((artifact) => {
    if (!fs.existsSync(artifact.path)) {
      throw new Error(`Missing release artifact: ${artifact.path}`);
    }
  });
  if (signingEnabled) {
    assertValidAuthenticodeSignature(path.join(desktopRoot, "out", "Privora-win32-x64", "Privora.exe"));
    assertValidAuthenticodeSignature(artifacts.installer.path);
  }

  uploadFileIfNeeded(artifacts.releases);
  uploadFileIfNeeded(artifacts.package);
  uploadFileIfNeeded(artifacts.installer);

  const releaseDocumentId = `win-x64-stable-${versionToken}`;
  const existingReleases = listReleaseDocuments();
  const latestRelease = existingReleases.find((doc) => isTargetRelease(doc) && doc.latest);

  if (latestRelease && compareVersions(targetVersion, latestRelease.version) <= 0 && !args.force) {
    throw new Error(
      `Refusing to publish ${targetVersion}; latest Appwrite release is ${latestRelease.version}. Use --force to override.`,
    );
  }

  const releaseDate = new Date().toISOString();
  const notes = args.notes || `Windows desktop release ${targetVersion}.`;
  const releaseData = {
    platform: config.platform,
    arch: config.arch,
    channel: config.channel,
    version: targetVersion,
    releasesFileId: artifacts.releases.id,
    packageFileId: artifacts.package.id,
    installerFileId: artifacts.installer.id,
    notes,
    releaseDate,
    latest: false,
  };

  upsertReleaseDocument(releaseDocumentId, releaseData, existingReleases.some((doc) => doc.$id === releaseDocumentId));

  existingReleases
    .filter((doc) => isTargetRelease(doc) && doc.latest && doc.$id !== releaseDocumentId)
    .forEach((doc) => updateReleaseDocument(doc.$id, { latest: false }));

  updateReleaseDocument(releaseDocumentId, { latest: true });
  verifyFeed(targetVersion, artifacts.releases.path);

  log(`Published ${targetVersion}.`);
  log(`Installer: ${artifacts.installer.path}`);
  log(`Feed: ${config.feedUrl}`);
  log("Commit and push the version bump after reviewing git status.");
}

function parseArgs(rawArgs) {
  const parsed = {
    bump: "patch",
    notes: "",
    force: false,
    allowDirty: false,
    help: false,
  };

  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    const next = rawArgs[index + 1];

    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--version") {
      parsed.version = requireValue(arg, next);
      index += 1;
    } else if (arg === "--bump") {
      parsed.bump = requireValue(arg, next);
      index += 1;
    } else if (arg === "--notes") {
      parsed.notes = requireValue(arg, next);
      index += 1;
    } else if (arg === "--force") parsed.force = true;
    else if (arg === "--allow-dirty") parsed.allowDirty = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function requireValue(flag, value) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function printHelp() {
  console.log(`
Usage:
  npm run desktop:release:win:x64
  npm run desktop:release:win:x64 -- --version 0.1.2 --notes "Fix updater"

Options:
  --version <x.y.z>    Publish an exact version instead of bumping patch.
  --bump <kind>        patch, minor, major, or none. Default: patch.
  --notes <text>       Release notes stored in Appwrite metadata.
  --allow-dirty        Allow releasing with pre-existing uncommitted changes.
  --force              Allow publishing a version <= the current latest metadata.

Auth:
  Set APPWRITE_RELEASE_API_KEY or APPWRITE_API_KEY for non-interactive Appwrite publishing.
`);
}

function assertCommand(command, commandArgs) {
  try {
    execCommand(command, commandArgs, { cwd: repoRoot, stdio: "ignore" });
  } catch {
    throw new Error(`Required command is not available: ${command}`);
  }
}

function validateSigningConfig() {
  const certificateFile = process.env.WINDOWS_CERTIFICATE_FILE;
  const certificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD;
  if (!certificateFile && !certificatePassword) {
    log("WARNING: Publishing unsigned Windows artifacts because no signing certificate is configured.");
    return false;
  }
  if (!certificateFile || !certificatePassword) {
    throw new Error("Set both WINDOWS_CERTIFICATE_FILE and WINDOWS_CERTIFICATE_PASSWORD, or leave both unset to publish unsigned artifacts.");
  }
  if (!fs.existsSync(certificateFile)) throw new Error(`Windows signing certificate was not found: ${certificateFile}`);
  return true;
}

function assertValidAuthenticodeSignature(filePath) {
  const status = runPowerShell([
    "-NoProfile",
    "-Command",
    `(Get-AuthenticodeSignature -LiteralPath ${quotePs(filePath)}).Status.ToString()`,
  ]).trim();
  if (status !== "Valid") throw new Error(`Authenticode verification failed for ${filePath}: ${status || "unknown status"}`);
}

function configureAppwriteClient() {
  const apiKey = process.env.APPWRITE_RELEASE_API_KEY || process.env.APPWRITE_API_KEY;
  const commandArgs = [
    "client",
    "--endpoint",
    config.endpoint,
    "--project-id",
    config.projectId,
  ];

  if (apiKey) commandArgs.push("--key", apiKey);

  execCommand("appwrite", commandArgs, { cwd: repoRoot, stdio: "ignore" });
}

function assertAppwriteAccess() {
  try {
    listReleaseDocuments();
  } catch {
    throw new Error(
      "Appwrite CLI cannot access the Privora project. Set APPWRITE_RELEASE_API_KEY to a temporary Appwrite API key with storage/databases access, then rerun.",
    );
  }
}

function assertCleanGitUnlessAllowed() {
  if (args.allowDirty) return;

  const status = execCommand("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  if (status) {
    throw new Error("Working tree has uncommitted changes. Commit/stash them first, or rerun with --allow-dirty.");
  }
}

function readPackageVersion() {
  return JSON.parse(fs.readFileSync(packagePath, "utf8")).version;
}

function resolveTargetVersion(currentVersion) {
  if (args.version) {
    assertSemver(args.version);
    return args.version;
  }

  if (!["patch", "minor", "major", "none"].includes(args.bump)) {
    throw new Error("--bump must be patch, minor, major, or none.");
  }

  if (args.bump === "none") return currentVersion;

  const [major, minor, patch] = parseVersion(currentVersion);
  if (args.bump === "major") return `${major + 1}.0.0`;
  if (args.bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function updatePackageVersion(targetVersion, previousVersion) {
  if (targetVersion === previousVersion) {
    log(`Keeping package version ${targetVersion}.`);
    return;
  }

  run("npm", ["--prefix", "apps/desktop", "version", targetVersion, "--no-git-tag-version"], { cwd: repoRoot });
}

function uploadFileIfNeeded(artifact) {
  const existing = getStorageFile(artifact.id);
  if (existing) {
    const localSize = fs.statSync(artifact.path).size;
    const remoteSize = Number(existing.sizeOriginal ?? existing.sizeActual ?? -1);
    if (remoteSize === localSize) {
      log(`Storage file exists, skipping upload: ${artifact.id}`);
      return;
    }

    log(`Storage file differs, replacing: ${artifact.id} (${remoteSize} -> ${localSize} bytes)`);
    run("appwrite", ["storage", "delete-file", "--bucket-id", config.bucketId, "--file-id", artifact.id]);
  }

  run("appwrite", [
    "storage",
    "create-file",
    "--bucket-id",
    config.bucketId,
    "--file-id",
    artifact.id,
    "--file",
    artifact.path,
  ]);
}

function getStorageFile(fileId) {
  try {
    return runJson("appwrite", ["-j", "storage", "get-file", "--bucket-id", config.bucketId, "--file-id", fileId]);
  } catch {
    return null;
  }
}

function listReleaseDocuments() {
  const documents = [];
  let offset = 0;
  let total = Infinity;
  const pageSize = 100;

  while (documents.length < total) {
    const params = new URLSearchParams();
    params.append("queries[]", JSON.stringify({ method: "limit", values: [pageSize] }));
    params.append("queries[]", JSON.stringify({ method: "offset", values: [offset] }));
    params.append("ttl", "0");
    const response = appwriteRequest(
      "GET",
      `/databases/${config.databaseId}/collections/${config.collectionId}/documents?${params.toString()}`,
    );
    const page = response.documents || [];
    documents.push(...page);
    total = Number.isFinite(Number(response.total)) ? Number(response.total) : documents.length;
    if (page.length === 0) break;
    offset += page.length;
  }

  return documents;
}

function upsertReleaseDocument(documentId, data, exists) {
  if (exists) {
    updateReleaseDocument(documentId, data);
    return;
  }

  appwriteRequest("POST", `/databases/${config.databaseId}/collections/${config.collectionId}/documents`, {
    documentId,
    data,
  });
}

function updateReleaseDocument(documentId, data) {
  appwriteRequest("PATCH", `/databases/${config.databaseId}/collections/${config.collectionId}/documents/${documentId}`, {
    data,
  });
}

function appwriteRequest(method, route, body) {
  const apiKey = process.env.APPWRITE_RELEASE_API_KEY || process.env.APPWRITE_API_KEY;
  if (!apiKey) throw new Error("APPWRITE_RELEASE_API_KEY or APPWRITE_API_KEY is required.");

  let response;
  const commandArgs = [
    "-NoProfile",
    "-Command",
    [
      `$headers = @{ 'X-Appwrite-Project' = ${quotePs(config.projectId)}; 'X-Appwrite-Key' = ${quotePs(apiKey)}; 'Content-Type' = 'application/json' }`,
      body === undefined ? "$body = $null" : `$body = ${quotePs(JSON.stringify(body))}`,
      "$params = @{ Method = " +
        quotePs(method) +
        "; Uri = " +
        quotePs(`${config.endpoint}${route}`) +
        "; Headers = $headers }",
      "if ($body) { $params.Body = $body }",
      "try { Invoke-RestMethod @params | ConvertTo-Json -Depth 20 -Compress } catch { $status = [int]$_.Exception.Response.StatusCode; $content = $_.ErrorDetails.Message; Write-Output (@{ status = $status; body = $content } | ConvertTo-Json -Compress); exit 66 }",
    ].join("; "),
  ];

  try {
    response = runPowerShell(commandArgs);
  } catch (error) {
    if (error.status !== 66 || !error.stdout) throw error;
    response = String(error.stdout).trim();
  }

  const parsed = response ? JSON.parse(response) : {};
  if (parsed && typeof parsed.status === "number" && Object.prototype.hasOwnProperty.call(parsed, "body")) {
    const error = new Error(`Appwrite API ${method} ${route} failed with ${parsed.status}: ${parsed.body}`);
    error.status = parsed.status;
    throw error;
  }

  return parsed;
}

function verifyFeed(expectedVersion, localReleasesPath) {
  const feed = fetchJson(config.feedUrl);
  if (feed.version !== expectedVersion) {
    throw new Error(`Feed verification failed. Expected ${expectedVersion}, got ${feed.version || "unknown"}.`);
  }

  const releasesText = fetchText(`${config.feedUrl}/RELEASES`);
  const localReleasesText = fs.readFileSync(localReleasesPath, "utf8").trim();
  if (releasesText !== localReleasesText) {
    throw new Error("RELEASES verification failed; public feed does not match the generated manifest.");
  }
}

function fetchJson(url) {
  const output = fetchText(url);
  return JSON.parse(output);
}

function fetchText(url) {
  return execCommand(process.platform === "win32" ? "curl.exe" : "curl", ["-fsSL", url], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function runPowerShell(commandArgs) {
  const executable = process.platform === "win32" ? "powershell" : "pwsh";
  return execFileSync(executable, commandArgs, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function run(command, commandArgs, options = {}) {
  log(`$ ${[command, ...commandArgs].join(" ")}`);
  execCommand(command, commandArgs, {
    cwd: options.cwd || repoRoot,
    stdio: "inherit",
  });
}

function runJson(command, commandArgs) {
  const output = execCommand(command, commandArgs, { cwd: repoRoot, encoding: "utf8" });
  const normalizedOutput = stripAnsi(output).trim();

  try {
    return JSON.parse(normalizedOutput);
  } catch {
    return vm.runInNewContext(`(${normalizedOutput})`, Object.create(null), { timeout: 1000 });
  }
}

function execCommand(command, commandArgs, options = {}) {
  if (process.platform !== "win32") {
    return execFileSync(command, commandArgs, options);
  }

  const psCommand = ["&", quotePs(command), ...commandArgs.map((arg) => quotePs(arg))].join(" ");
  return execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand], options);
}

function log(message) {
  console.log(`[desktop-release] ${message}`);
}

function quotePs(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

function isTargetRelease(doc) {
  return doc.platform === config.platform && doc.arch === config.arch && doc.channel === config.channel;
}

function toVersionToken(version) {
  return version.replace(/\./g, "_");
}

function assertSemver(version) {
  parseVersion(version);
}

function parseVersion(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Expected semantic version x.y.z, got: ${version}`);
  return match.slice(1).map((value) => Number(value));
}

function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}
