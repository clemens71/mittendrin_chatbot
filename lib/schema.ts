/**
 * Zod schemas for the mittendrin.in conversational form prototype.
 *
 * SHARED CONTRACT — lives here at lib/schema.ts, not under lib/client/ or
 * lib/server/, because both sides depend on it: the frontend
 * (app/page.tsx, components/*) uses DraftItemSchema/ItemSchema/
 * AdapterDataSchema to hold and validate the draft and build the final
 * submission; the backend (app/api/extract/route.ts, lib/server/*) uses
 * ExtractionSchema/DraftItemSchema/ExtractRequestSchema to validate what
 * the model returns and what the client posted. Keep it framework-only
 * (zod + plain types) — no Next.js server-only imports here, so it stays
 * safe to import from client components.
 *
 * Three layers, on purpose:
 *
 *   1. ExtractionSchema   — the shape the LLM returns for ONE turn. Flat,
 *                           everything nullable (the model must be able to
 *                           say "I don't know" instead of inventing a value).
 *   2. DraftItemSchema    — the shape of the running draft the client and
 *                           server both hold. Nested (i18n objects, etc.),
 *                           still all-optional. This is what /api/extract
 *                           merges the ExtractionSchema output INTO, and
 *                           it's also what the manual-edit checklist writes
 *                           to directly — chat and manual editing share one
 *                           object.
 *   3. ItemSchema / AdapterDataSchema — the strict, submit-time shape.
 *                           Only this layer enforces "required". The final
 *                           item sent to the user is always the output of
 *                           validating the draft against ItemSchema, never
 *                           raw model output.
 *
 * Design note / open assumption (flagged for review):
 * The task spec lists "location" both as part of the required "how do we
 * find this place" rule (address+city OR website OR online-only) AND as a
 * skippable field holding the venue's plain-text name (e.g. "Sozialstation
 * Torstraße"). Those are two different concerns wearing the same name. I
 * resolved it as:
 *   - `location`   : optional plain-text venue name (skippable)
 *   - `address` + `city` : structured address (city required alongside
 *                    address for the address path to count as "complete")
 *   - `website`    : alternate locator path
 *   - `onlineOnly` : explicit boolean note, third locator path (this field
 *                    isn't named in the spec's field list — I added it
 *                    because "an explicit note that it is online-only"
 *                    needs somewhere to live that isn't misread as a real
 *                    street address)
 * Flag if the real mappo.mittendrin.in schema names these differently.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared vocab
// ---------------------------------------------------------------------------

export const INTERVAL_VALUES = [
  "fixed",
  "daily",
  "mon-fri",
  "weekly",
  "bi-weekly",
  "three-weekly",
  "four-weekly",
  "first_of_month",
  "second_of_month",
  "third_of_month",
  "fourth_of_month",
  "last_of_month",
] as const;

export const IntervalEnum = z.enum(INTERVAL_VALUES);
export type Interval = z.infer<typeof IntervalEnum>;

export const DAY_VALUES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const DayEnum = z.enum(DAY_VALUES);
export type Day = z.infer<typeof DayEnum>;

/** Fallback tag vocabulary, used only if the mappo.mittendrin.in fetch fails at startup. */
export const FALLBACK_TAGS = [
  "musik",
  "sport",
  "kinder",
  "familie",
  "kultur",
  "ehrenamt",
  "beratung",
  "bildung",
  "senioren",
  "jugend",
  "natur",
  "spiele",
  "workshop",
  "gesundheit",
  "kunst",
] as const;

// ---------------------------------------------------------------------------
// Structured recurring-event rule
// The model returns THIS shape, never the positional rule[0..4] array — the
// array format is code-generated at submit time in lib/recurring.ts.
// ---------------------------------------------------------------------------

export const RecurringRuleSchema = z.object({
  interval: IntervalEnum,
  day: DayEnum.nullable(),
  start: z.string().nullable(), // "HH:MM", 24h
  end: z.string().nullable(), // "HH:MM", 24h
  exampleDate: z.string().nullable(), // ISO "YYYY-MM-DD", only for e.g. "fixed" one-off dates
});
export type RecurringRule = z.infer<typeof RecurringRuleSchema>;

/** The final on-the-wire tuple shape: ["weekly","thu","19:00","21:00",null] */
export const RecurringRuleTuple = z.tuple([
  IntervalEnum,
  DayEnum.nullable(),
  z.string().nullable(),
  z.string().nullable(),
  z.string().nullable(),
]);
export type RecurringRuleTupleT = z.infer<typeof RecurringRuleTuple>;

// ---------------------------------------------------------------------------
// 1. ExtractionSchema — one LLM turn's output
// ---------------------------------------------------------------------------
//
// IMPORTANT SHAPE NOTE: Claude's structured-outputs endpoint rejects schemas
// with more than 16 nullable/union-typed parameters ("exponential
// compilation cost"). A flat one-nullable-field-per-form-field schema blows
// past that (~27 here). So leaf fields are grouped into a handful of
// nullable *objects* instead — one union slot per group, not per field.
// Inside a group, "no update this turn" is spelled with an empty string
// ("") rather than null, since a required (non-nullable) string leaf costs
// nothing against the union cap. See buildSystemPrompt() for the exact
// wire convention explained to the model. onlineOnly/tags/recurringEvent
// stay as their own top-level nullable fields (still well under the cap)
// since "" has no sensible meaning for a boolean or an array.

const CoreGroupSchema = z.object({
  title: z.string(), // "" = no update this turn
  briefDe: z.string(),
  descriptionDe: z.string(),
});

// Named "place", not "location" — the group itself used to be called
// "location" while one of its own leaf fields was ALSO "location" (the
// venue display name). That self-referential naming made the model overly
// cautious about the whole group ("don't invent a location name" bled into
// suppressing the literal city it should have extracted). The leaf field
// is renamed to venueName for the same reason; draft.location (unchanged)
// is what it maps to after merging — see lib/merge.ts.
const PlaceGroupSchema = z.object({
  venueName: z.string(), // venue display name, e.g. "Café Nord" -> draft.location
  address: z.string(), // street + house number
  zip: z.string(),
  city: z.string(),
  website: z.string(),
});

const ContactGroupSchema = z.object({
  email: z.string(),
  phone: z.string(),
  mobile: z.string(),
  contact: z.string(), // free-text contact person, e.g. "Maria Schulz"
  responsibleInstitution: z.string(),
  sponsors: z.string(),
});

const PracticalInfoGroupSchema = z.object({
  hoursDe: z.string(), // free-text hours, used when NOT a clean recurring rule
  chargeDe: z.string(),
  accessibilityDe: z.string(),
  directionsDe: z.string(),
  venueDe: z.string(), // i18n description of the venue/space itself
  image: z.string(),
});

/** "none" sentinel instead of null — keeps `day` a plain required enum. */
export const WIRE_DAY_VALUES = [...DAY_VALUES, "none"] as const;
export const WireDayEnum = z.enum(WIRE_DAY_VALUES);

/** Wire-level recurring rule: same info as RecurringRuleSchema, but every
 * field required (sentinels instead of null) to stay out of the union-type
 * budget. Converted to/from the internal RecurringRuleSchema in lib/merge.ts. */
export const WireRecurringRuleSchema = z.object({
  interval: IntervalEnum,
  day: WireDayEnum, // "none" if not applicable
  start: z.string(), // "HH:MM" or ""
  end: z.string(), // "HH:MM" or ""
  exampleDate: z.string(), // "YYYY-MM-DD" or ""
});
export type WireRecurringRule = z.infer<typeof WireRecurringRuleSchema>;

/**
 * Base shape shared by every turn. `tags` is re-typed per-request in
 * buildExtractionRequestSchema() once the live tag vocabulary is known, so
 * that structured outputs can enforce the enum at the API level.
 */
const extractionShape = {
  core: CoreGroupSchema.nullable(),
  place: PlaceGroupSchema.nullable(),
  onlineOnly: z.boolean().nullable(),
  contact: ContactGroupSchema.nullable(),
  practicalInfo: PracticalInfoGroupSchema.nullable(),
  tags: z.array(z.string()).nullable(),
  recurringEvent: z.array(WireRecurringRuleSchema).nullable(),
};

export const ExtractionSchema = z.object({
  ...extractionShape,
  // Field paths (draft-object keys, dot-notation for nested, e.g.
  // "brief.de") the model guessed/generated/condensed rather than read
  // verbatim from the user's text. briefDe/descriptionDe normally appear
  // here. Required (not nullable) — empty array is a valid, common answer.
  inferred: z.array(z.string()),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/**
 * Per-request variant with `tags` constrained to the live vocabulary, for
 * strongest structured-outputs enforcement. Falls back to FALLBACK_TAGS
 * when the mappo fetch failed at startup (see lib/tags.ts).
 */
export function buildExtractionRequestSchema(allowedTags: readonly string[]) {
  const tagsTuple = allowedTags.length > 0 ? (allowedTags as [string, ...string[]]) : undefined;
  return z.object({
    ...extractionShape,
    tags: tagsTuple ? z.array(z.enum(tagsTuple)).nullable() : z.array(z.string()).nullable(),
    inferred: z.array(z.string()),
  });
}

// ---------------------------------------------------------------------------
// 2. DraftItemSchema — the running draft (chat + manual edits both write here)
// ---------------------------------------------------------------------------

const i18n = z.object({ de: z.string() });

export const DraftItemSchema = z.object({
  title: z.string().nullable().default(null),
  brief: i18n.nullable().default(null),
  description: i18n.nullable().default(null),

  location: z.string().nullable().default(null),
  address: z.string().nullable().default(null),
  zip: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  website: z.string().nullable().default(null),
  onlineOnly: z.boolean().nullable().default(null),

  email: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  mobile: z.string().nullable().default(null),
  contact: z.string().nullable().default(null),
  responsibleInstitution: z.string().nullable().default(null),
  sponsors: z.string().nullable().default(null),

  hours: i18n.nullable().default(null),
  charge: i18n.nullable().default(null),
  accessibility: i18n.nullable().default(null),
  directions: i18n.nullable().default(null),
  venue: i18n.nullable().default(null),
  image: z.string().nullable().default(null),

  tags: z.array(z.string()).default([]),
  recurringEvent: z.array(RecurringRuleSchema).default([]),

  // Set by code only, never asked, never model-filled — but no longer
  // always null: /api/extract now auto-geocodes (lib/server/geocode.ts,
  // Nominatim) whenever a venue name + city is known but no address, and
  // fills these alongside the geocoded address. Still never touched by
  // the LLM extraction itself.
  state: z.literal("suggestion").default("suggestion"),
  latitude: z.number().nullable().default(null),
  longitude: z.number().nullable().default(null),

  // Bookkeeping for the checklist UI and guardrails — not part of the final
  // Item, stripped before submit.
  inferredFields: z.array(z.string()).default([]), // union of every inferred path seen so far
  turnCount: z.number().int().default(0),
});
export type DraftItem = z.infer<typeof DraftItemSchema>;

export function emptyDraft(): DraftItem {
  return DraftItemSchema.parse({});
}

// ---------------------------------------------------------------------------
// 3. ItemSchema / AdapterDataSchema — strict, submit-time only
// ---------------------------------------------------------------------------

export const ItemSchema = z
  .object({
    title: z.string().min(1, "Titel fehlt"),
    state: z.literal("suggestion"),
    brief: z.object({ de: z.string().min(1, "Kurzbeschreibung fehlt") }),
    description: z.object({ de: z.string().min(1, "Beschreibung fehlt") }),

    location: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    zip: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    website: z.string().nullable().optional(),
    onlineOnly: z.boolean().nullable().optional(),

    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    mobile: z.string().nullable().optional(),
    contact: z.string().nullable().optional(),
    responsibleInstitution: z.string().nullable().optional(),
    sponsors: z.string().nullable().optional(),

    hours: z.object({ de: z.string() }).nullable().optional(),
    charge: z.object({ de: z.string() }).nullable().optional(),
    accessibility: z.object({ de: z.string() }).nullable().optional(),
    directions: z.object({ de: z.string() }).nullable().optional(),
    venue: z.object({ de: z.string() }).nullable().optional(),
    image: z.string().nullable().optional(),

    tags: z.array(z.string()).optional(),
    // JSON.stringify(RecurringRuleTupleT[]) — see lib/recurring.ts
    recurring_event: z.string().optional(),

    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
  })
  .refine((item) => Boolean((item.address && item.city) || item.website || item.onlineOnly === true), {
    message:
      "Es fehlt eine Möglichkeit, den Ort zu finden: Adresse + Ort, eine Website, oder ein Hinweis, dass es nur online stattfindet.",
    path: ["location"],
  });
export type Item = z.infer<typeof ItemSchema>;

export const AdapterDataSchema = z.object({
  adapter: z.object({
    name: z.literal("web-form"),
    sourceName: z.literal("Nutzereingabe (Prototyp)"),
  }),
  lastUpdate: z.number(),
  itemsRecord: z.record(z.string(), ItemSchema),
});
export type AdapterData = z.infer<typeof AdapterDataSchema>;

// ---------------------------------------------------------------------------
// API request/response envelopes for /api/extract
// ---------------------------------------------------------------------------

export const ExtractRequestSchema = z.object({
  draft: DraftItemSchema,
  message: z.string().max(2000, "Nachricht ist zu lang (max. 2000 Zeichen)."),
});
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

export const ExtractResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), draft: DraftItemSchema }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;
