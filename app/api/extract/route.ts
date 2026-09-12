import { NextRequest, NextResponse } from "next/server";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { getAnthropicClient, EXTRACTION_MODEL } from "@/lib/server/anthropic";
import { buildExtractionRequestSchema, DraftItemSchema, ExtractRequestSchema, type DraftItem, type ExtractResponse } from "@/lib/schema";
import { buildSystemPrompt, buildUserContent } from "@/lib/server/prompt";
import { mergeExtractionIntoDraft } from "@/lib/server/merge";
import { geocodeVenue } from "@/lib/server/geocode";
import { getAllowedTags } from "@/lib/server/tags";
import { checkRateLimit, getClientIp } from "@/lib/server/rateLimit";
import { corsPreflight, withCors } from "@/lib/server/cors";

export const runtime = "nodejs";

const MAX_TURNS = 8;

export function OPTIONS() {
  return corsPreflight();
}

function fail(error: string, status = 400) {
  return withCors(NextResponse.json<ExtractResponse>({ ok: false, error }, { status }));
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return fail(
      `Zu viele Anfragen. Bitte in ${Math.ceil((rl.retryAfterMs ?? 0) / 1000)} Sekunden erneut versuchen.`,
      429,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Ungültiges Anfrageformat.");
  }

  const parsedRequest = ExtractRequestSchema.safeParse(body);
  if (!parsedRequest.success) {
    return fail("Eingabe ungültig: " + parsedRequest.error.issues.map((i) => i.message).join("; "));
  }
  const { draft, message } = parsedRequest.data;

  if (draft.turnCount >= MAX_TURNS) {
    return fail(
      `Maximale Anzahl an Nachrichten (${MAX_TURNS}) für diesen Entwurf erreicht. Bitte die restlichen Felder manuell in der Checkliste ausfüllen.`,
    );
  }

  const allowedTags = await getAllowedTags();

  let client;
  try {
    client = getAnthropicClient();
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Server ist nicht konfiguriert.", 500);
  }

  const requestSchema = buildExtractionRequestSchema(allowedTags);
  const today = new Date().toISOString().slice(0, 10);

  let parsedOutput: unknown;
  try {
    const response = await client.messages.parse({
      model: EXTRACTION_MODEL,
      max_tokens: 2048,
      temperature: 0,
      system: buildSystemPrompt(today, allowedTags),
      messages: [{ role: "user", content: buildUserContent(draft, message) }],
      output_config: { format: zodOutputFormat(requestSchema) },
    });
    parsedOutput = response.parsed_output;
  } catch (err) {
    console.error("[extract] Anthropic API call failed:", err);
    return fail("Die Anfrage an das Sprachmodell ist fehlgeschlagen. Der bisherige Entwurf bleibt unverändert.", 502);
  }

  const extraction = requestSchema.safeParse(parsedOutput);
  if (!extraction.success) {
    console.error("[extract] model output failed schema validation:", extraction.error.issues);
    return fail("Die Antwort des Sprachmodells war ungültig. Der bisherige Entwurf bleibt unverändert.", 502);
  }

  const merged = mergeExtractionIntoDraft(draft, extraction.data);
  const mergedCheck = DraftItemSchema.safeParse(merged);
  if (!mergedCheck.success) {
    console.error("[extract] merged draft failed schema validation:", mergedCheck.error.issues);
    return fail("Der zusammengeführte Entwurf war ungültig. Der bisherige Entwurf bleibt unverändert.", 500);
  }

  const finalDraft = await maybeGeocode(mergedCheck.data);

  return withCors(NextResponse.json<ExtractResponse>({ ok: true, draft: finalDraft }));
}

/**
 * Auto-fills address/zip/coordinates via a real Nominatim lookup — never
 * an LLM guess — whenever a venue name + city are known but no address is.
 * Best-effort: on any failure (nothing found, network error, timeout)
 * `geocodeVenue` returns null and the draft is returned exactly as merged,
 * address left empty rather than invented. Never blocks or fails the
 * overall /api/extract response — a geocoding miss is not an extract
 * failure.
 */
async function maybeGeocode(draftData: DraftItem): Promise<DraftItem> {
  if (draftData.address || !draftData.location || !draftData.city) return draftData;

  let result;
  try {
    result = await geocodeVenue(draftData.location, draftData.city);
  } catch (err) {
    console.warn("[extract] geocoding threw unexpectedly:", err instanceof Error ? err.message : err);
    return draftData;
  }
  if (!result) return draftData;

  const inferred = new Set(draftData.inferredFields);
  inferred.add("address");
  if (result.zip) inferred.add("zip");

  return {
    ...draftData,
    address: result.address,
    zip: result.zip || draftData.zip,
    city: result.city || draftData.city,
    latitude: result.latitude,
    longitude: result.longitude,
    inferredFields: Array.from(inferred),
  };
}
