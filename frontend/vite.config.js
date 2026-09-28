import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development the interface talks to the backend through a
    // same-origin proxy, so no CORS round trip and no hard-coded
    // host in the browser. Production builds fall back to
    // VITE_API_BASE, or http://127.0.0.1:8000.
    proxy: {
      "/api": {
        target: process.env.NWIS_BACKEND ?? "http://127.0.0.1:8000",
        changeOrigin: true
      },
      "/ws": {
        target: process.env.NWIS_BACKEND ?? "http://127.0.0.1:8000",
        ws: true,
        changeOrigin: true
      }
    }
  },
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep the map vendor code and the React runtime in their
        // own chunks so a UI change does not invalidate them.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("leaflet")) return "vendor-map";
          if (id.includes("react") || id.includes("scheduler")) {
            return "vendor-react";
          }
          return undefined;
        }
      }
    }
  }
});
