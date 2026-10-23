import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ command }) => ({
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
  },
  // In dev locale ('npm run dev') la radice è '/' per navigare direttamente su http://localhost:5173/
  // In produzione ('npm run build') la base è '/honeymoon-roadbook/' per GitHub Pages
  base: command === "serve" ? "/" : "/honeymoon-roadbook/",
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleString('it-IT', { 
      day: '2-digit', 
      month: 'short', 
      hour: '2-digit', 
      minute: '2-digit' 
    })),
    'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(''),
    'import.meta.env.VITE_GEMINI_API_KEY_B64': JSON.stringify(''),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "Hounigo",
        short_name: "Hounigo",
        description: "Organizza il viaggio, vivi ogni momento e condividilo con chi vuoi.",
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
      ignored: ["**/honeymoon-roadbookzip/**", "**/node_modules/**"],
    },
  },
}));