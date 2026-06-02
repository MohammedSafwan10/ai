const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const stagedRoot = path.join(root, "build-resources");
const stagedPty = path.join(stagedRoot, "node-pty");
const sourcePty = path.join(root, "node_modules", "node-pty");

const copyFile = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};

const writeJson = (to, value) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, `${JSON.stringify(value, null, 2)}\n`);
};

const copyRuntimeJs = (from, to) => {
  const text = fs.readFileSync(from, "utf8").replace(/\r?\n\/\/# sourceMappingURL=.*?\.map\s*$/u, "");
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, text, "utf8");
};

const copyMatching = (fromDir, toDir, include) => {
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const from = path.join(fromDir, entry.name);
    const to = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      copyMatching(from, to, include);
      continue;
    }
    if (include(from)) copyFile(from, to);
  }
};

fs.rmSync(stagedRoot, { recursive: true, force: true });

writeJson(path.join(stagedPty, "package.json"), {
  name: "node-pty",
  version: "1.1.0",
  main: "./lib/index.js",
  license: "MIT",
});
copyFile(path.join(sourcePty, "LICENSE"), path.join(stagedPty, "LICENSE"));
copyMatching(path.join(sourcePty, "lib"), path.join(stagedPty, "lib"), (file) => {
  if (!file.endsWith(".js") || file.endsWith(".test.js")) return false;
  copyRuntimeJs(file, path.join(stagedPty, "lib", path.relative(path.join(sourcePty, "lib"), file)));
  return false;
});
copyMatching(path.join(sourcePty, "prebuilds", "win32-x64"), path.join(stagedPty, "prebuilds", "win32-x64"), (file) =>
  file.endsWith(".node") || file.endsWith(".dll") || file.endsWith(".exe")
);
