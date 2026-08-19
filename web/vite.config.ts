import preact from "@preact/preset-vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { pwaManifest, workboxOptions } from "./src/pwa.js";

export default defineConfig({
  base: "/google-home/",
  plugins: [preact(), VitePWA({ registerType: "autoUpdate", manifest: pwaManifest, workbox: workboxOptions })],
});
