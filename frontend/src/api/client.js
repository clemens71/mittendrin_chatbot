/**
 * Thin fetch wrapper around the backend (../../../app/api/*, logic in
 * ../../../lib/server/*). Base URL comes from VITE_API_BASE_URL (see
 * .env.example) since the two now run as separate processes on separate
 * ports — cross-origin, so the backend needs CORS (lib/server/cors.ts).
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

/** GET /api/tags — the controlled tag vocabulary. Falls back to an empty
 * list on any network error; the tag picker just shows nothing to pick
 * from rather than crashing the page. */
export async function fetchTags() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.tags ?? [];
  } catch {
    return [];
  }
}

/**
 * POST /api/extract — the one LLM call per turn. Returns the same
 * { ok: true, draft } | { ok: false, error } shape the backend sends;
 * never throws for an application-level failure (bad model output, rate
 * limit, etc.) — only a genuine network failure produces a rejected
 * promise, which callers should catch.
 */
export async function extract(draft, message) {
  const res = await fetch(`${API_BASE_URL}/api/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft, message }),
  });
  return res.json();
}
