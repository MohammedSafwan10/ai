import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  plugins: [tanstackStart(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 3001,
  },
});
