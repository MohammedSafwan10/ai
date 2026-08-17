import fs from "node:fs";
import path from "node:path";

const firstExistingFile = (candidates: string[]) => candidates.find((candidate) => {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
});

const resourcePathCandidates = (...segments: string[]) => [
  process.resourcesPath ? path.join(process.resourcesPath, ...segments) : "",
  path.join(process.cwd(), ...segments),
].filter(Boolean);

export const resolveAppIconPath = () =>
  firstExistingFile(resourcePathCandidates("assets", "icon.png")) || path.join(process.cwd(), "assets", "icon.png");

export const resolveRipgrepExecutablePath = () => {
  const arch = process.env.npm_config_arch || process.arch;
  const binaryName = process.platform === "win32" ? "rg.exe" : "rg";
  const platformPackage = `ripgrep-${process.platform}-${arch}`;
  const scopedPlatformPackage = path.join("@vscode", platformPackage);
  const candidates = [
    ...resourcePathCandidates(platformPackage, "bin", binaryName),
    ...resourcePathCandidates(scopedPlatformPackage, "bin", binaryName),
    ...resourcePathCandidates("node_modules", scopedPlatformPackage, "bin", binaryName),
  ];
  return firstExistingFile(candidates) || candidates[candidates.length - 1];
};
