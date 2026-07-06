import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/honeymoon-roadbook/",
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      ignored: ["**/honeymoon-roadbookzip/**", "**/node_modules/**"],
    },
  },
});