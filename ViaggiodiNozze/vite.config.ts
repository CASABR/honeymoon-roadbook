import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

import { execSync } from "child_process";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageMetadata = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8"));

let commitHash = 'unknown';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch {}

export default defineConfig(({ command }) => ({
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      canvg: path.resolve(__dirname, "src/utils/emptyStub.ts"),
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "leaflet",
      "react-leaflet",
      "firebase/app",
      "firebase/auth",
      "firebase/firestore",
      "lucide-react"
    ],
  },
  // In dev locale ('npm run dev') la radice è '/' per navigare direttamente su http://localhost:5173/
  // In produzione ('npm run build') la base è '/honeymoon-roadbook/' per GitHub Pages
  base: command === "serve" ? "/" : "/honeymoon-roadbook/",
  define: {
    __APP_VERSION__: JSON.stringify(packageMetadata.version),
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleString('it-IT', { 
      day: '2-digit', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    })),
    __COMMIT_HASH__: JSON.stringify(commitHash),
  },
  plugins: [
    command === "serve"
      ? {
          name: "dev-csp-emulator",
          transformIndexHtml(html: string) {
            return html
              .replace(
                /frame-src 'self'/,
                "frame-src 'self' http://127.0.0.1:* http://localhost:*"
              )
              .replace(
                /child-src 'self'/,
                "child-src 'self' http://127.0.0.1:* http://localhost:*"
              )
              .replace(
                /connect-src 'self'/,
                "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*"
              );
          },
        }
      : null,
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "Hounigo",
        short_name: "Hounigo",
        description: "Organizza il viaggio, vivi ogni momento e condividilo con chi vuoi.",
        id: "/honeymoon-roadbook/",
        start_url: "/honeymoon-roadbook/",
        scope: "/honeymoon-roadbook/",
        theme_color: "#FF6B5F",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,jpeg,webp,ico}"],
        navigateFallbackDenylist: [/^\/__\/auth/],
        importScripts: ["push-sw.js"],
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5173,
    open: false,
    watch: {
      ignored: ["**/honeymoon-roadbookzip/**", "**/node_modules/**", "**/scratch/prebeta-screenshot-*/**"],
    },
  },
}));
