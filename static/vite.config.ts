import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const staticRoot = fileURLToPath(new URL("./", import.meta.url));
const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export default defineConfig({
  root: staticRoot,
  base: "/Taopdf/",
  publicDir: fileURLToPath(new URL("../public", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@": projectRoot,
    },
  },
  build: {
    outDir: fileURLToPath(new URL("../pages-dist", import.meta.url)),
    emptyOutDir: true,
  },
});
