import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      // Ignora la cartella del vecchio progetto estratta accidentalmente qui dentro
      ignored: ["**/honeymoon-roadbookzip/**", "**/node_modules/**"],
    },
  },
});

