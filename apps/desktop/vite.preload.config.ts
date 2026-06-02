import { defineConfig } from "vite";

export default defineConfig({
  plugins: [{
    name: "privora-preload-code-splitting",
    configResolved(config) {
      const output = config.build.rollupOptions.output;
      const outputs = Array.isArray(output) ? output : output ? [output] : [];
      outputs.forEach((item) => {
        const mutable = item as Record<string, unknown>;
        delete mutable.inlineDynamicImports;
        mutable.codeSplitting = false;
      });
    },
  }],
  build: {
    sourcemap: false,
    rollupOptions: {
      external: ["electron"],
    },
  },
});
