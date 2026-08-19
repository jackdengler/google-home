import type { ManifestOptions, VitePWAOptions } from "vite-plugin-pwa";

export const pwaManifest: Partial<ManifestOptions> = {
  name: "Nest Dial",
  short_name: "Nest Dial",
  description: "A private, focused control for your Nest thermostat.",
  theme_color: "#f1f5f4",
  background_color: "#edf2f1",
  display: "standalone",
  orientation: "portrait",
  start_url: "/google-home/",
  scope: "/google-home/",
  icons: [
    { src: "/google-home/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "/google-home/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
  ],
};

export const workboxOptions: VitePWAOptions["workbox"] = {
  navigateFallback: "/google-home/index.html",
  globPatterns: ["**/*.{js,css,html,png,svg}"],
  cleanupOutdatedCaches: true,
  runtimeCaching: [],
};
