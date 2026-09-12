/**
 * Frontend copy of the shapes defined in ../../../lib/schema.ts (the Next.js
 * backend). This is a prototype-grade duplication, not a shared package —
 * keep the two in sync by hand:
 *   - INTERVAL_VALUES / DAY_VALUES: must match lib/schema.ts exactly (they
 *     drive both the RecurringEditor <select> options here and what the
 *     backend accepts).
 *   - emptyDraft(): must match DraftItemSchema's defaults in lib/schema.ts.
 *   - ItemSchema / AdapterDataSchema: must match the backend's ItemSchema /
 *     AdapterDataSchema exactly — this is what guarantees "the final
 *     submitted object is never unvalidated" even though validation now
 *     happens in a different process than the one that will (eventually)
 *     persist it.
 *
 * If you change lib/schema.ts, mirror the change here.
 */

import { z } from "zod";

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
];

export const DAY_VALUES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** A fresh, empty draft — mirrors DraftItemSchema's defaults in lib/schema.ts. */
export function emptyDraft() {
  return {
    title: null,
    brief: null,
    description: null,
    location: null,
    address: null,
    zip: null,
    city: null,
    website: null,
    onlineOnly: null,
    email: null,
    phone: null,
    mobile: null,
    contact: null,
    responsibleInstitution: null,
    sponsors: null,
    hours: null,
    charge: null,
    accessibility: null,
    directions: null,
    venue: null,
    image: null,
    tags: [],
    recurringEvent: [],
    state: "suggestion",
    latitude: null,
    longitude: null,
    inferredFields: [],
    turnCount: 0,
  };
}

const i18n = z.object({ de: z.string().min(1) });

/** Strict, submit-time shape — only this schema enforces "required".
 * Mirrors lib/schema.ts's ItemSchema. */
export const ItemSchema = z
  .object({
    title: z.string().min(1, "Titel fehlt"),
    state: z.literal("suggestion"),
    brief: i18n,
    description: i18n,

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
    recurring_event: z.string().optional(),

    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
  })
  .refine((item) => Boolean((item.address && item.city) || item.website || item.onlineOnly === true), {
    message:
      "Es fehlt eine Möglichkeit, den Ort zu finden: Adresse + Ort, eine Website, oder ein Hinweis, dass es nur online stattfindet.",
    path: ["location"],
  });

export const AdapterDataSchema = z.object({
  adapter: z.object({
    name: z.literal("web-form"),
    sourceName: z.literal("Nutzereingabe (Prototyp)"),
  }),
  lastUpdate: z.number(),
  itemsRecord: z.record(z.string(), ItemSchema),
});
