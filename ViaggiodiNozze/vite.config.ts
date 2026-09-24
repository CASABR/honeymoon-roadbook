import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ command }) => ({
  // In dev locale ('npm run dev') la radice è '/' per navigare direttamente su http://localhost:5173/
  // In produzione ('npm run build') la base è '/honeymoon-roadbook/' per GitHub Pages
  base: command === "serve" ? "/" : "/honeymoon-roadbook/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false,
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,jpeg,webp,ico}"],
        navigateFallbackDenylist: [/^\/__\/auth/],
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