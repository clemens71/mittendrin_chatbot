// This app is now the backend only — see README "Project structure". The
// UI lives in ../frontend (Vite + React), which talks to /api/extract and
// /api/tags cross-origin (CORS: lib/server/cors.ts). This page is just a
// landing note so `app/` still has a valid root route, not the real UI.
export default function Page() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">mittendrin.in – Backend</h1>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
        Dies ist nur der API-Server (<code>/api/extract</code>, <code>/api/tags</code>). Die Oberfläche läuft
        separat unter <code>../frontend</code> (<code>npm run dev</code> dort, Standard-Port 5173).
      </p>
    </main>
  );
}
