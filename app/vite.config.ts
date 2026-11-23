import { defineConfig } from "vite";
export default defineConfig({
  root: ".",
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: { host: "0.0.0.0", port: 8421, proxy: { "/api": "http://127.0.0.1:8420" } },
});
