/**
 * Real address lookup via Nominatim (OpenStreetMap) — replaces the earlier
 * approach of letting the LLM guess an address from general knowledge
 * (see README, "address as a best-effort guess"). This is a genuine
 * database lookup, not a language-model guess: when it finds nothing, the
 * caller should leave the address empty, never fall back to inventing one.
 *
 * Nominatim usage policy (https://operations.osmfoundation.org/policies/nominatim/)
 * caps this at ~1 request/second and requires an identifying User-Agent —
 * both handled here, process-wide (not per-request), since this module is
 * the only thing calling Nominatim.
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "mittendrin-conversational-form-prototype/0.1 (local dev prototype, no production traffic)";
const REQUEST_TIMEOUT_MS = 5000;
const MIN_INTERVAL_MS = 1100; // a bit over Nominatim's 1 req/s cap, for safety margin

interface NominatimAddress {
  road?: string;
  house_number?: string;
  postcode?: string;
  city?: string;
  town?: string;
  village?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  address?: NominatimAddress;
}

export interface GeocodeResult {
  address: string; // "Straße Hausnummer"
  zip: string;
  city: string;
  latitude: number;
  longitude: number;
}

// Serializes every call through this module to at most ~1/second,
// regardless of how many concurrent /api/extract requests trigger it.
let queue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  // Keep the queue alive even if this call fails, so later calls still run.
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Nominatim's query parser reliably returns zero hits on accented
 * characters (confirmed: "Café Extrablatt Darmstadt" -> [], "Cafe
 * Extrablatt Darmstadt" -> a real hit — same for "Café Nord" vs "Cafe
 * Nord") even though the underlying OSM data does contain accented names.
 * Not documented behavior, found by testing directly. */
function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

async function nominatimSearch(query: string): Promise<NominatimResult[] | null> {
  return throttled(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = new URL(NOMINATIM_URL);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("limit", "1");

      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
      if (!res.ok) return null;
      return (await res.json()) as NominatimResult[];
    } catch (err) {
      console.warn("[geocode] Nominatim request failed:", err instanceof Error ? err.message : err);
      return null;
    } finally {
      clearTimeout(timer);
    }
  });
}

/**
 * Looks up a real address for a named venue + city. Returns null if
 * nothing is found (unknown place, not mapped in OSM, network failure) —
 * the caller must leave the address empty in that case, never invent one.
 */
export async function geocodeVenue(venueName: string, city: string): Promise<GeocodeResult | null> {
  const query = `${venueName} ${city}`.trim();
  if (!query) return null;

  let results = await nominatimSearch(query);
  if ((!results || results.length === 0) && query !== stripDiacritics(query)) {
    results = await nominatimSearch(stripDiacritics(query));
  }
  if (!results || results.length === 0) return null;

  const top = results[0];
  const addr = top.address ?? {};
  const lat = parseFloat(top.lat);
  const lon = parseFloat(top.lon);

  if (!addr.road || Number.isNaN(lat) || Number.isNaN(lon)) return null;

  return {
    address: addr.house_number ? `${addr.road} ${addr.house_number}` : addr.road,
    zip: addr.postcode ?? "",
    city: addr.city ?? addr.town ?? addr.village ?? city,
    latitude: lat,
    longitude: lon,
  };
}
