import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { resolve } from "node:path";

/**
 * Standalone SPA build for the Electron renderer.
 * Uses relative asset paths so the bundle loads over file://.
 */
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  build: {
    outDir: "dist-desktop",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(process.cwd(), "index.desktop.html"),
    },
  },
});
