import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import pkg from "./package.json" with { type: "json" };

// GitHub Pages sirve la app en /app_croak/.
export default defineConfig({
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/favicon-32.png", "icons/apple-touch-icon.png", "icons/logo.png"],
      manifest: {
        name: "Croak",
        short_name: "Croak",
        description: "Monitoreo de pH, turbidez y TDS del agua de tu instalación.",
        lang: "es-MX",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#f6fbf8",
        theme_color: "#0b7a4f",
        categories: ["utilities"],
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallback: "index.html",
        // Las fuentes traen subconjuntos para otros alfabetos; solo se guardan los de español.
        globIgnores: ["**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2"],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // El SDK de Firebase cambia poco: en su propio archivo se aprovecha la caché entre versiones.
        manualChunks: { firebase: ["firebase/app", "firebase/auth", "firebase/database"] },
      },
    },
  },
});
