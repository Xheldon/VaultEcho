import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  plugins: [vue()],
  root: fileURLToPath(new URL(".", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("../public/admin", import.meta.url)),
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
