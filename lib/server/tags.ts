import { FALLBACK_TAGS } from "../schema";

const TAG_SOURCE_URL = "https://mappo.mittendrin.in/tt/latest";
const FETCH_TIMEOUT_MS = 5000;

const TAG_PATTERN = /^[a-z0-9_-]+$/;

function cleanTagValues(values: unknown[]): string[] | null {
  const tags = values
    .filter((v): v is string => typeof v === "string")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => TAG_PATTERN.test(t));
  const unique = Array.from(new Set(tags));
  return unique.length > 0 ? unique : null;
}

/**
 * Live shape of https://mappo.mittendrin.in/tt/latest, confirmed by fetching
 * it directly: a JSON ARRAY of one or more AdapterData-shaped envelopes,
 * each with an `itemsRecord` OBJECT (keyed by a compound id like
 * "categories-arts-tags-arts_choir"). Each entry's `name` field (e.g.
 * "arts_choir") is the actual value that belongs in an item's `tags` array —
 * not the compound `id`. Entries cover both top-level categories
 * (`from: ["categories"]`) and leaf tags (`from: [..., "tags"]`); both are
 * flat, lowercase, pattern-valid strings, so both are accepted here.
 * Currently ~100 unique names total across one envelope.
 */
function extractNamesFromEnvelope(envelope: unknown): (string | null)[] {
  if (!envelope || typeof envelope !== "object") return [];
  const itemsRecord = (envelope as Record<string, unknown>).itemsRecord;
  if (!itemsRecord || typeof itemsRecord !== "object" || Array.isArray(itemsRecord)) return [];

  return Object.values(itemsRecord as Record<string, unknown>).map((entry) => {
    if (entry && typeof entry === "object") {
      const name = (entry as Record<string, unknown>).name;
      if (typeof name === "string") return name;
    }
    return null;
  });
}

function normalizeTagRecord(raw: unknown): string[] | null {
  const envelopes = Array.isArray(raw) ? raw : [raw];
  const names = envelopes.flatMap(extractNamesFromEnvelope);
  return cleanTagValues(names);
}

/** Fallback: a bare array of strings, or of objects with a tag/slug/id/name field. */
function normalizeTagList(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;

  const values = raw.map((entry) => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const obj = entry as Record<string, unknown>;
      const candidate = obj.tag ?? obj.slug ?? obj.id ?? obj.name;
      if (typeof candidate === "string") return candidate;
    }
    return null;
  });

  return cleanTagValues(values);
}

async function fetchAllowedTags(): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(TAG_SOURCE_URL, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    // Primary: the real AdapterData-with-object-itemsRecord shape. Fallbacks
    // cover a bare array or an array nested under a common wrapper key, in
    // case the endpoint's shape changes later.
    const list =
      normalizeTagRecord(json) ??
      normalizeTagList(json) ??
      normalizeTagList((json as Record<string, unknown>)?.tags) ??
      normalizeTagList((json as Record<string, unknown>)?.data);

    if (!list) throw new Error("unrecognized response shape");

    console.log(`[tags] loaded ${list.length} tags from ${TAG_SOURCE_URL}`);
    return list;
  } catch (err) {
    console.warn(
      `[tags] could not load tag vocabulary from ${TAG_SOURCE_URL} (${
        err instanceof Error ? err.message : String(err)
      }) — falling back to hardcoded list of ${FALLBACK_TAGS.length} tags.`,
    );
    return [...FALLBACK_TAGS];
  }
}

// Fetched once per server process (module-level cache), not per request —
// this is the closest a Next.js dev server gets to a "startup" hook.
let cache: Promise<string[]> | null = null;

export function getAllowedTags(): Promise<string[]> {
  if (!cache) cache = fetchAllowedTags();
  return cache;
}
