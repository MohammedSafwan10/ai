import type { ForgeConfig } from "@electron-forge/shared-types";
import fs from "node:fs";
import path from "node:path";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";

const targetPlatform = process.env.npm_config_platform || process.platform;
const targetArch = process.env.npm_config_arch || process.arch;
const optionalResource = (...segments: string[]) => path.join(...segments);
const existingOptionalResources = (...resources: string[]) => resources.filter((resource) => fs.existsSync(resource));
const ripgrepResourcePackage = `node_modules/@vscode/ripgrep-${targetPlatform}-${targetArch}`;
const windowsCertificateFile = process.env.WINDOWS_CERTIFICATE_FILE;
const windowsCertificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD;

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: "**/node_modules/node-pty/**",
    },
    extraResource: [
      "assets",
      "build-resources/node-pty",
      ...existingOptionalResources(
        optionalResource(ripgrepResourcePackage),
      ),
    ],
    executableName: "Privora",
    icon: "assets/icon",
    name: "Privora",
    ...(windowsCertificateFile ? {
      windowsSign: {
        certificateFile: windowsCertificateFile,
        certificatePassword: windowsCertificatePassword,
      },
    } : {}),
  },
  rebuildConfig: {
    ignoreModules: process.env.PRIVORA_SKIP_PTY_REBUILD === "1" ? ["node-pty"] : [],
  },
  makers: [
    new MakerSquirrel({
      name: "Privora",
      setupIcon: "assets/icon.ico",
      setupExe: "PrivoraSetup.exe",
      ...(windowsCertificateFile ? {
        certificateFile: windowsCertificateFile,
        certificatePassword: windowsCertificatePassword,
      } : {}),
    }),
    new MakerZIP({}, ["win32", "darwin"]),
    new MakerDMG({
      name: "Privora",
      icon: "assets/icon.icns",
      overwrite: true,
    }, ["darwin"]),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts",
        },
      ],
    }),
  ],
};

export default config;
