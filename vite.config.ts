import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { type Plugin, defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import pkg from "./package.json" with { type: "json" };

// Dos ediciones del mismo código (ver src/lib/edition.ts):
//   VITE_EDITION=demo  demostración pública en GitHub Pages (/app_croak/), sin Firebase.
//   VITE_EDITION=full  app del equipo en Firebase Hosting, con inicio de sesión.
// En la edición demo, firebase.ts y auth.tsx se reemplazan por versiones vacías: así el SDK, la pantalla
// de inicio de sesión y los datos del proyecto no llegan al paquete público.
function demoStubs(): Plugin {
  const stubs: Record<string, string> = {
    "/src/lib/firebase.ts": fileURLToPath(new URL("./src/lib/firebase.stub.ts", import.meta.url)),
    "/src/lib/auth.tsx": fileURLToPath(new URL("./src/lib/auth.stub.tsx", import.meta.url)),
  };
  return {
    name: "croak-demo-stubs",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || !/\/(firebase|auth)$/.test(source)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      const hit = resolved && Object.keys(stubs).find((k) => resolved.id.endsWith(k));
      return hit ? stubs[hit] : null;
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  const demo = env.VITE_EDITION === "demo";
  return {
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    demo && demoStubs(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/favicon-32.png", "icons/apple-touch-icon.png", "icons/logo.png"],
      manifest: {
        name: demo ? "Croak · Demostración" : "Croak",
        short_name: "Croak",
        description: demo
          ? "Demostración con datos simulados del monitor de agua Croak."
          : "Monitoreo de pH, turbidez y TDS del agua de tu instalación.",
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
        manualChunks: demo ? undefined : { firebase: ["firebase/app", "firebase/auth", "firebase/database"] },
      },
    },
  },
  };
});
