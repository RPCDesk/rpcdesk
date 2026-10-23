import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@rpcdesk/protocol": path.resolve(process.cwd(), "packages/protocol/src/index.ts"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**", "**/node_modules/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/src-tauri/**",
      "sidecar/src/build-plugin.test.ts",
    ],
  },
  build: {
    target: "safari15",
    sourcemap: true,
  },
});
