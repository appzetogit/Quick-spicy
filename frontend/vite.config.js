import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "url";
import path from "path";
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Vite's default splitting gave every lucide icon its own file: 229 of the 523
        // built chunks were under 4KB and together came to just 255KB, so loading the home
        // page cost over 200 HTTP round-trips for a quarter of a megabyte. On a phone that
        // is the page load.
        //
        // Only what is used everywhere is grouped. Heavy, feature-specific libraries -
        // jspdf, html2canvas, recharts, firebase, maps - are deliberately NOT listed, so
        // they keep their own lazily loaded chunks and never reach a customer who is only
        // browsing restaurants.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("lucide-react")) return "icons";
          if (/[\/]node_modules[\/](react|react-dom|react-router|react-router-dom|scheduler)[\/]/.test(id)) {
            return "react-vendor";
          }
          return undefined;
        },
      },
    },
  },
});
