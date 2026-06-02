import { defineConfig } from "vite";

const external = ["electron", "@vscode/ripgrep", "node-pty", "bufferutil", "utf-8-validate"];

export default defineConfig({
  build: {
    sourcemap: false,
    rollupOptions: {
      external,
    },
  },
  optimizeDeps: {
    exclude: external,
  },
});
