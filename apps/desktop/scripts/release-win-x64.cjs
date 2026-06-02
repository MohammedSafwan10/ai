#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..", "..");
const packagePath = path.join(desktopRoot, "package.json");

const config = {
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

  assertCommand("git", ["--version"]);
  assertCommand("npm", ["--version"]);
  assertCommand("appwrite", ["--version"]);
  assertAppwriteLogin();
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
      path: path.join(artifactRoot, "PrivoraSetup.exe"),
    },
  };

  Object.values(artifacts).forEach((artifact) => {
    if (!fs.existsSync(artifact.path)) {
      throw new Error(`Missing release artifact: ${artifact.path}`);
    }
  });

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

  upsertReleaseDocument(releaseDocumentId, releaseData);

  existingReleases
    .filter((doc) => isTargetRelease(doc) && doc.latest && doc.$id !== releaseDocumentId)
    .forEach((doc) => updateReleaseDocument(doc.$id, { latest: false }));

  updateReleaseDocument(releaseDocumentId, { latest: true });
  verifyFeed(targetVersion);

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
`);
}

function assertCommand(command, commandArgs) {
  try {
    execFileSync(resolveExecutable(command), commandArgs, { cwd: repoRoot, stdio: "ignore" });
  } catch {
    throw new Error(`Required command is not available: ${command}`);
  }
}

function assertAppwriteLogin() {
  try {
    runJson("appwrite", ["-j", "whoami"]);
  } catch {
    throw new Error("Appwrite CLI is not logged in or not linked. Run `appwrite login` from the repo first.");
  }
}

function assertCleanGitUnlessAllowed() {
  if (args.allowDirty) return;

  const status = execFileSync(resolveExecutable("git"), ["status", "--porcelain"], {
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
  if (storageFileExists(artifact.id)) {
    log(`Storage file exists, skipping upload: ${artifact.id}`);
    return;
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
    "--permissions",
    'read("any")',
  ]);
}

function storageFileExists(fileId) {
  try {
    runJson("appwrite", ["-j", "storage", "get-file", "--bucket-id", config.bucketId, "--file-id", fileId]);
    return true;
  } catch {
    return false;
  }
}

function listReleaseDocuments() {
  const response = runJson("appwrite", [
    "-j",
    "databases",
    "list-documents",
    "--database-id",
    config.databaseId,
    "--collection-id",
    config.collectionId,
    "--limit",
    "100",
    "--ttl",
    "0",
  ]);

  return response.documents || [];
}

function upsertReleaseDocument(documentId, data) {
  run("appwrite", [
    "databases",
    "upsert-document",
    "--database-id",
    config.databaseId,
    "--collection-id",
    config.collectionId,
    "--document-id",
    documentId,
    "--data",
    JSON.stringify(data),
    "--permissions",
    'read("any")',
  ]);
}

function updateReleaseDocument(documentId, data) {
  run("appwrite", [
    "databases",
    "update-document",
    "--database-id",
    config.databaseId,
    "--collection-id",
    config.collectionId,
    "--document-id",
    documentId,
    "--data",
    JSON.stringify(data),
  ]);
}

function verifyFeed(expectedVersion) {
  const feed = fetchJson(config.feedUrl);
  if (feed.version !== expectedVersion) {
    throw new Error(`Feed verification failed. Expected ${expectedVersion}, got ${feed.version || "unknown"}.`);
  }

  const releasesText = fetchText(`${config.feedUrl}/RELEASES`);
  if (!releasesText.includes(`Privora-${expectedVersion}-full.nupkg`)) {
    throw new Error("RELEASES verification failed; it does not mention the new package.");
  }
}

function fetchJson(url) {
  const output = runPowerShell(["-NoProfile", "-Command", `(Invoke-WebRequest ${quotePs(url)}).Content`]);
  return JSON.parse(output);
}

function fetchText(url) {
  return runPowerShell(["-NoProfile", "-Command", `(Invoke-WebRequest ${quotePs(url)}).Content`]);
}

function runPowerShell(commandArgs) {
  const executable = process.platform === "win32" ? "powershell" : "pwsh";
  return execFileSync(executable, commandArgs, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function run(command, commandArgs, options = {}) {
  log(`$ ${[command, ...commandArgs].join(" ")}`);
  execFileSync(resolveExecutable(command), commandArgs, {
    cwd: options.cwd || repoRoot,
    stdio: "inherit",
  });
}

function runJson(command, commandArgs) {
  const output = execFileSync(resolveExecutable(command), commandArgs, { cwd: repoRoot, encoding: "utf8" });
  return JSON.parse(output);
}

function resolveExecutable(command) {
  if (process.platform !== "win32") return command;
  if (command === "npm" || command === "appwrite") return `${command}.cmd`;
  return command;
}

function log(message) {
  console.log(`[desktop-release] ${message}`);
}

function quotePs(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
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
