import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: "**/node_modules/node-pty/**",
    },
    extraResource: [
      "node_modules/node-pty",
    ],
    executableName: "Privora",
    name: "Privora",
  },
  rebuildConfig: {
    ignoreModules: process.env.PRIVORA_SKIP_PTY_REBUILD === "1" ? ["node-pty"] : [],
  },
  makers: [
    new MakerSquirrel({
      name: "Privora",
      setupExe: "PrivoraSetup.exe",
    }),
    new MakerZIP({}, ["win32"]),
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
