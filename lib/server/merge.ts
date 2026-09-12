import type { DraftItem, Extraction, RecurringRule, WireRecurringRule } from "../schema";

/**
 * Merges one turn's extraction into the running draft. Fields are grouped
 * on the wire (see schema.ts's union-type-budget note), but the merge
 * policy is still per-leaf-field: within a returned (non-null) group, an
 * empty string ("") means "no update this turn" and leaves the draft's
 * existing value untouched; any other string overwrites it. This is what
 * makes "nein, 20 Uhr nicht 18 Uhr" correct one field without wiping the
 * rest, even though title/brief/description now travel together as one
 * group on the wire.
 *
 * Also maintains draft.inferredFields: a field path freshly (re-)inferred
 * this turn is added; a field path the model actually overwrote WITHOUT
 * flagging it as inferred (i.e. it read a concrete value from the text) is
 * removed, since it's no longer a guess. Untouched fields keep their
 * previous flag as-is.
 */
export function mergeExtractionIntoDraft(draft: DraftItem, extraction: Extraction): DraftItem {
  const inferred = new Set(draft.inferredFields);
  const mark = (path: string) => {
    if (extraction.inferred.includes(path)) inferred.add(path);
    else inferred.delete(path);
  };

  const next: DraftItem = { ...draft };

  const setPlain = (key: Exclude<keyof DraftItem, "brief" | "description" | "hours" | "charge" | "accessibility" | "directions" | "venue">, value: string, path: string) => {
    if (value === "") return;
    (next as Record<string, unknown>)[key] = value;
    mark(path);
  };

  const setI18n = (
    key: "brief" | "description" | "hours" | "charge" | "accessibility" | "directions" | "venue",
    value: string,
    path: string,
  ) => {
    if (value === "") return;
    next[key] = { de: value };
    mark(path);
  };

  if (extraction.core !== null) {
    setPlain("title", extraction.core.title, "title");
    setI18n("brief", extraction.core.briefDe, "brief.de");
    setI18n("description", extraction.core.descriptionDe, "description.de");
  }

  if (extraction.place !== null) {
    setPlain("location", extraction.place.venueName, "location");
    setPlain("address", extraction.place.address, "address");
    setPlain("zip", extraction.place.zip, "zip");
    setPlain("city", extraction.place.city, "city");
    setPlain("website", extraction.place.website, "website");
  }

  if (extraction.onlineOnly !== null) {
    next.onlineOnly = extraction.onlineOnly;
    mark("onlineOnly");
  }

  if (extraction.contact !== null) {
    setPlain("email", extraction.contact.email, "email");
    setPlain("phone", extraction.contact.phone, "phone");
    setPlain("mobile", extraction.contact.mobile, "mobile");
    setPlain("contact", extraction.contact.contact, "contact");
    setPlain("responsibleInstitution", extraction.contact.responsibleInstitution, "responsibleInstitution");
    setPlain("sponsors", extraction.contact.sponsors, "sponsors");
  }

  if (extraction.practicalInfo !== null) {
    setI18n("hours", extraction.practicalInfo.hoursDe, "hours.de");
    setI18n("charge", extraction.practicalInfo.chargeDe, "charge.de");
    setI18n("accessibility", extraction.practicalInfo.accessibilityDe, "accessibility.de");
    setI18n("directions", extraction.practicalInfo.directionsDe, "directions.de");
    setI18n("venue", extraction.practicalInfo.venueDe, "venue.de");
    setPlain("image", extraction.practicalInfo.image, "image");
  }

  if (extraction.tags !== null) {
    next.tags = extraction.tags;
    mark("tags");
  }

  if (extraction.recurringEvent !== null) {
    next.recurringEvent = extraction.recurringEvent.map(wireRuleToInternal);
    mark("recurringEvent");
  }

  next.inferredFields = Array.from(inferred);
  next.turnCount = draft.turnCount + 1;
  return next;
}

function wireRuleToInternal(rule: WireRecurringRule): RecurringRule {
  return {
    interval: rule.interval,
    day: rule.day === "none" ? null : rule.day,
    start: rule.start === "" ? null : rule.start,
    end: rule.end === "" ? null : rule.end,
    exampleDate: rule.exampleDate === "" ? null : rule.exampleDate,
  };
}
