import { defineConfig } from "vite";

const external = ["electron", "bufferutil", "utf-8-validate"];

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
