import { NextResponse } from "next/server";

/**
 * The frontend (frontend/, Vite) now runs as a separate process on its own
 * port — cross-origin from this Next.js backend, so these two endpoints
 * need CORS. Configurable via FRONTEND_ORIGIN in .env.local; defaults to
 * Vite's default dev port. Not a wildcard on purpose, even though these
 * routes don't use cookies/credentials — keeps the door only as open as it
 * needs to be for a local prototype.
 */
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": FRONTEND_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function withCors(response: NextResponse): NextResponse {
  const headers = corsHeaders();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

/** Handles the browser's CORS preflight (OPTIONS) request. Export this as
 * `OPTIONS` from any route.ts that needs cross-origin POST/custom headers. */
export function corsPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
