import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/admin/",
  envDir: "../..",
  plugins: [react()],
  server: {
    port: 5174
  },
  preview: {
    port: 4174
  }
});
