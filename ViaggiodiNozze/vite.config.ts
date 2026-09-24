import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/honeymoon-roadbook/",
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: "autoUpdate",
    manifest: false,
    workbox: {
      navigateFallback: "index.html",
      globPatterns: ["**/*.{js,css,html,svg,png,jpg,jpeg,webp,ico}"],
      navigateFallbackDenylist: [/^\/__\/auth/],
    },
  })],
  server: {
    watch: {
      ignored: ["**/honeymoon-roadbookzip/**", "**/node_modules/**"],
    },
  },
});