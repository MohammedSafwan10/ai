import { defineConfig } from "vite";

const external = ["electron", "@vscode/ripgrep", "bufferutil", "utf-8-validate"];

export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      external,
    },
  },
  optimizeDeps: {
    exclude: external,
  },
});
