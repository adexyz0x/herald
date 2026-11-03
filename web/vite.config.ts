import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: false },
  // React and Motion together are about 150 kB gzipped; the NEAR signer is split out and loads on first use.
  build: { chunkSizeWarningLimit: 600 },
});
