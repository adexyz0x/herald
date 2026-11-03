import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: false },
  // Some wallet libraries still expect Node: `global` is `globalThis` in browsers, and the `util`
  // polyfill reads NODE_DEBUG as it loads.
  define: { global: "globalThis", "process.env.NODE_DEBUG": "undefined" },
  build: {
    // The app itself (React and Motion) is about 155 kB gzipped. Wallet code (about 480 kB gzipped)
    // and the demo signer are split out and load only after the page is up, when they're needed.
    chunkSizeWarningLimit: 1700,
    rolldownOptions: {
      onwarn(warning, warn) {
        // js-sha256, used inside a wallet library, checks for Node with eval. Browsers never take that path.
        if (warning.code === "EVAL" && String(warning.id ?? warning.message).includes("js-sha256")) return;
        warn(warning);
      },
    },
  },
});
