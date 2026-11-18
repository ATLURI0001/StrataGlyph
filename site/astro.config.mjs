import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// GitHub Pages serves the repository at /strataglyph under the owner's custom domain.
export default defineConfig({
  site: "https://atluri0001.github.io",
  base: "/strataglyph",
  trailingSlash: "ignore",
  vite: { plugins: [tailwindcss()] },
});
