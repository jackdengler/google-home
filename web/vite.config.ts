import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/google-home/",
  plugins: [preact()],
});
