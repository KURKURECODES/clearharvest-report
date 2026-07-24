import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // maplibre-gl loads its tile-parsing code in a Web Worker via a `new URL(...)`
  // worker constructor. Vite's dependency pre-bundling rewrites that URL and
  // breaks it (worker request 404s), which leaves the map stuck on "loading"
  // forever since the style/tile pipeline never completes. Excluding it from
  // pre-bundling keeps the worker's URL intact.
  optimizeDeps: {
    exclude: ["maplibre-gl"],
  },
});
