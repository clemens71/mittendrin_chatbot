import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite dev server runs on its own port (default 5173), separate from the
// Next.js backend (default 3000, see ../lib/server + ../app/api). The two
// talk over plain fetch() + CORS (see api/client.js and
// ../lib/server/cors.ts) — no proxy needed, but one is easy to add here
// later (server.proxy) if you'd rather avoid CORS entirely.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
