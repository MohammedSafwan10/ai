#!/usr/bin/env node
// Windows artifacts are built here; the ARM VPS only verifies and serves them.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const desktop = path.resolve(__dirname, ".."),
  repo = path.resolve(desktop, "../..");
const FEED = "https://updates.nexdark.com/win32/x64/stable";
function run(command, args, options = {}) {
  if (process.platform === "win32" && command === "npm")
    return execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `& 'npm' ${args.map((x) => "'" + String(x).replace(/'/g, "''") + "'").join(" ")}; exit $LASTEXITCODE`,
      ],
      { cwd: repo, stdio: "inherit", ...options },
    );
  return execFileSync(command, args, {
    cwd: repo,
    stdio: "inherit",
    ...options,
  });
}
function sha(file, algorithm = "sha256") {
  const result = crypto.createHash(algorithm);
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)))
      result.update(buffer.subarray(0, count));
  } finally {
    fs.closeSync(fd);
  }
  return result.digest("hex");
}
function semver(value) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value))
    throw Error("Expected x.y.z version");
  return value.split(".").map(Number);
}
function parse(argv) {
  const options = { bump: "patch" };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    if (["help", "publish", "skip-build", "allow-dirty"].includes(key))
      options[key] = true;
    else if (
      [
        "version",
        "bump",
        "notes",
        "release-date",
        "artifacts",
        "host",
        "root",
      ].includes(key)
    ) {
      const value = argv[++i];
      if (!value || value.startsWith("--"))
        throw Error(`Missing --${key} value`);
      options[key] = value;
    } else throw Error(`Unknown option: ${argv[i]}`);
  }
  return options;
}
function main() {
  const args = parse(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Prepare: npm run desktop:release:win:x64 -- --version x.y.z --notes "Release notes"\nPublish: add --publish. Defaults: host oci-coolify, root /home/ubuntu/privora-releases.\n--skip-build --artifacts <directory> imports existing verified Squirrel artifacts.\n--allow-dirty bypasses the source-tree check. --bump patch|minor|major|none.\nUse SSH agent/config; no cloud API keys. --release-date preserves an imported release timestamp.',
    );
    return;
  }
  const host =
      args.host || process.env.PRIVORA_RELEASE_SSH_HOST || "oci-coolify",
    remoteRoot =
      args.root ||
      process.env.PRIVORA_RELEASE_ROOT ||
      "/home/ubuntu/privora-releases";
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(host) ||
    !/^\/[a-zA-Z0-9_/-]+$/.test(remoteRoot) ||
    remoteRoot.includes("..") ||
    remoteRoot === "/" ||
    remoteRoot.endsWith("/")
  )
    throw Error(
      "Use a safe SSH config alias and a dedicated absolute release root",
    );
  if (
    !args["allow-dirty"] &&
    run("git", ["status", "--porcelain"], {
      encoding: "utf8",
      stdio: "pipe",
    }).trim()
  )
    throw Error(
      "Commit the intended source first, or explicitly use --allow-dirty",
    );
  const pkg = JSON.parse(
    fs.readFileSync(path.join(desktop, "package.json"), "utf8"),
  );
  let version = args.version;
  if (!version) {
    const parts = semver(pkg.version);
    const index = { major: 0, minor: 1, patch: 2 }[args.bump];
    if (args.bump !== "none") {
      if (index === undefined) throw Error("Invalid bump");
      parts[index]++;
      for (let i = index + 1; i < 3; i++) parts[i] = 0;
    }
    version = parts.join(".");
  }
  semver(version);
  if (args["skip-build"] && !args.version)
    throw Error("Importing existing artifacts requires an explicit --version");
  if (!args["skip-build"]) {
    if (process.platform !== "win32")
      throw Error("Build Windows installers on Windows");
    const cert = process.env.WINDOWS_CERTIFICATE_FILE,
      password = process.env.WINDOWS_CERTIFICATE_PASSWORD;
    if (Boolean(cert) !== Boolean(password))
      throw Error("Configure both signing values, or neither");
    if (pkg.version !== version)
      run("npm", [
        "--prefix",
        "apps/desktop",
        "version",
        version,
        "--no-git-tag-version",
      ]);
    run("npm", ["--prefix", "apps/desktop", "run", "lint"]);
    run("npm", ["--prefix", "apps/desktop", "test"]);
    run("npm", ["--prefix", "apps/desktop", "run", "make:win:x64"]);
    if (cert) {
      for (const file of [
        path.join(desktop, "out/Privora-win32-x64/Privora.exe"),
        path.join(desktop, "out/make/squirrel.windows/x64/PrivoraSetup.exe"),
      ]) {
        const quoted = "'" + file.replace(/'/g, "''") + "'";
        const status = run(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            `(Get-AuthenticodeSignature -LiteralPath ${quoted}).Status.ToString()`,
          ],
          { encoding: "utf8", stdio: "pipe" },
        ).trim();
        if (status !== "Valid")
          throw Error("Authenticode signature verification failed");
      }
    } else
      console.log("Signing is not configured. Windows artifacts are unsigned.");
  }
  const artifacts = path.resolve(
    args.artifacts || path.join(desktop, "out/make/squirrel.windows/x64"),
  );
  const bundle = fs.mkdtempSync(path.join(os.tmpdir(), "privora-release-"));
  const manifest = fs
    .readFileSync(path.join(artifacts, "RELEASES"), "utf8")
    .trim();
  const packages = [];
  for (const line of manifest.split(/\r?\n/)) {
    const match = line.match(
      /^([a-f\d]{40}) (Privora-\d+\.\d+\.\d+-full\.nupkg) (\d+)$/i,
    );
    if (!match) throw Error("Invalid Squirrel RELEASES manifest");
    const file = path.join(artifacts, match[2]);
    if (
      fs.lstatSync(file).isSymbolicLink() ||
      sha(file, "sha1") !== match[1].toLowerCase() ||
      fs.statSync(file).size !== Number(match[3])
    )
      throw Error(`Package failed verification: ${match[2]}`);
    packages.push(match[2]);
  }
  if (!packages.includes(`Privora-${version}-full.nupkg`))
    throw Error("Requested version is absent from artifacts");
  for (const name of [...packages, "PrivoraSetup.exe", "RELEASES"])
    fs.copyFileSync(path.join(artifacts, name), path.join(bundle, name));
  const installer = path.join(bundle, "PrivoraSetup.exe");
  const releaseDate = args["release-date"] || new Date().toISOString();
  if (Number.isNaN(Date.parse(releaseDate)))
    throw Error("Invalid release date");
  const metadata = {
    platform: "win32",
    arch: "x64",
    channel: "stable",
    version,
    releaseDate,
    notes: args.notes || `Privora Desktop ${version}.`,
    sha256: sha(installer),
    size: fs.statSync(installer).size,
    files: {
      releases: `${FEED}/RELEASES`,
      package: `${FEED}/Privora-${version}-full.nupkg`,
      installer: `${FEED}/PrivoraSetup-${version}.exe`,
    },
    squirrelFeed: "/win32/x64/stable",
  };
  fs.writeFileSync(
    path.join(bundle, "metadata.json"),
    JSON.stringify(metadata, null, 2) + "\n",
  );
  console.log(`Verified release bundle: ${bundle}`);
  if (!args.publish) {
    console.log(
      "Prepared locally. Add --publish to upload and atomically promote.",
    );
    return;
  }
  const stage = `${version.replace(/\./g, "_")}-${crypto.randomBytes(8).toString("hex")}`;
  run("ssh", ["-o", "BatchMode=yes", host, `mkdir -p ${remoteRoot}/staging`]);
  run("scp", [
    "-q",
    path.join(repo, "apps/releases/promote.py"),
    `${host}:${remoteRoot}/promote.py`,
  ]);
  run("scp", ["-q", "-r", bundle, `${host}:${remoteRoot}/staging/${stage}`]);
  run("ssh", [
    "-o",
    "BatchMode=yes",
    host,
    `python3 ${remoteRoot}/promote.py --root ${remoteRoot} --promote ${stage}`,
  ]);
  console.log(`Promoted ${version}. Public feed: ${FEED}`);
  console.log(
    "Before a DNS cutover, verify through the new origin. Published bytes remain immutable; rollback changes only the current pointer.",
  );
}
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[desktop-release] ${error.message}`);
    process.exitCode = 1;
  }
}
module.exports = { sha, semver, parse };
