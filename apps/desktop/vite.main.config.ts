import { defineConfig } from "vite";

const external = ["electron", "node:sqlite", "@vscode/ripgrep", "node-pty", "pdfjs-dist", "bufferutil", "utf-8-validate"];

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
