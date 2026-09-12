# mittendrin.in – conversational entry form (prototype)

A local prototype that replaces the long entry form for mittendrin.in
(Brandenburg) with free text. Paste any blurb, complete or not — one LLM
call turns it into as many fields as it can, including a generated
title/subtitle suggestion. The extracted fields sit at the top of the page
in four tabs (Allgemeine Infos / Ort / Zeit / Weitere Infos), all directly
editable; the chat box sits below them for adding or correcting more.
There's no scripted step-by-step interrogation: a red badge on a tab shows
what's still missing without gating the input on it — add more free text,
or just edit a field directly, in any order, until it's submittable.

Two separate processes, two folders:

- **Backend** — this Next.js app (`app/api/*`, `lib/server/*`, `lib/schema.ts`).
  Port 3000. Holds `ANTHROPIC_API_KEY`.
- **Frontend** — `frontend/` (Vite + React). Port 5173. Talks to the
  backend cross-origin over plain `fetch()` + CORS.

## Setup

Two terminals, both projects installed and started separately:

```bash
# Terminal 1 — backend (this directory)
npm install
cp .env.local.example .env.local   # then paste your ANTHROPIC_API_KEY
npm run dev                        # http://localhost:3000

# Terminal 2 — frontend
cd frontend
npm install
cp .env.example .env               # default already points at localhost:3000
npm run dev                        # http://localhost:5173
```

Open http://localhost:5173 — that's the actual app. Port 3000 now only
answers `/api/extract` and `/api/tags`; opening it in a browser just shows
a one-line "this is the backend" note (`app/page.tsx`).

## Project structure — frontend vs. backend

Two independent npm projects now, not one Next.js app wearing two hats:

```
(repo root)                         BACKEND — Next.js, port 3000
  app/
    page.tsx                          placeholder landing note only, see above
    layout.tsx, globals.css
    api/extract/route.ts              thin handler, logic in lib/server
    api/tags/route.ts                 same
  lib/
    schema.ts                         SHARED CONTRACT — see below
    server/
      anthropic.ts                    Anthropic client + model id (reads ANTHROPIC_API_KEY)
      prompt.ts                       the system prompt sent to Claude
      merge.ts                        merges one extraction turn into the draft
      tags.ts                         fetches/caches the mappo.mittendrin.in tag vocabulary
      rateLimit.ts                    in-memory per-IP rate limit
      cors.ts                         CORS headers for the frontend's cross-origin requests

frontend/                           FRONTEND — Vite + React, port 5173
  index.html                          Vite's entry HTML — must be at this root, not public/
  public/                             static assets only (favicon etc.), NOT the app shell
  src/
    main.jsx, App.jsx, index.css
    api/client.js                     fetch wrapper for /api/extract, /api/tags
    context/ChatContext.jsx           the draft + chat log + actions, one shared state
    hooks/useChat.js                  useContext(ChatContext) accessor
    hooks/useEventSearch.js           placeholder — see "Files that don't do anything yet"
    lib/                              JS port of the backend's lib/client/* + relevant lib/schema.ts pieces
      schema.js, questions.js, recurring.js, buildItem.js, slug.js
    components/
      RegistrationForm.jsx            the tabbed field editor (was components/FieldTabs.tsx)
      ChatWindow.jsx, MessageBubble.jsx, ChatInput.jsx
      RecurringEditor.jsx
      QuickReplyButtons.jsx, EventCard.jsx, EventList.jsx   placeholders — see below
```

### The shared contract

`lib/schema.ts` (backend) and `frontend/src/lib/schema.js` (frontend) must
describe the same shapes — `ItemSchema`, `AdapterDataSchema`, the draft
defaults, the recurring-event interval/day enums. They're now two files in
two npm projects (JS, not TS, on the frontend — no shared package, no
build-time link between them), so nothing stops them drifting apart if one
changes without the other. This is a real cost of the two-process split,
worth it for genuine process separation. If you touch one, touch the other:
`lib/schema.ts`'s docstring and `frontend/src/lib/schema.js`'s docstring
both point at each other.

### Files that don't do anything yet

`EventCard.jsx`, `EventList.jsx`, `useEventSearch.js`, and
`QuickReplyButtons.jsx` were part of the requested frontend scaffold but
don't correspond to anything the app currently does — there's no listing
or search of existing events, only one draft built and submitted at a
time, and no scripted quick-reply flow (see "no forced next-question
flow" below — adding reply chips to the chat would reintroduce exactly the
step-by-step pattern that was deliberately removed). Rather than invent
fake functionality to fill them, they're left as honest placeholders:
`EventCard`/`EventList` render `null`, `useEventSearch` returns an inert
`{ results: [], loading: false, error: null, search: () => {} }`,
`QuickReplyButtons` is a real, working "row of buttons" component that
just isn't rendered from anywhere. Each has a comment saying so. Wire them
up if/when there's an actual feature behind them.

## Architecture

The "chat" is a JSON object with a conversational surface, not a real
conversation, and not a scripted wizard either:

- The frontend holds one `draft` object (`frontend/src/lib/schema.js` →
  `emptyDraft()`, shape matches `lib/schema.ts`'s `DraftItemSchema`) and
  POSTs `{ draft, message }` to `POST /api/extract` on every turn (via
  `frontend/src/api/client.js`) — the first message can be a full blurb, a
  fragment, or a correction; the endpoint doesn't care which.
- **No message history is ever sent** — only the current draft (minus
  bookkeeping fields) + the new message, so input size stays roughly
  constant across a session instead of growing.
- The route (`app/api/extract/route.ts`) makes **one** Claude call with
  structured outputs (`output_config.format` via `client.messages.parse` +
  `zodOutputFormat`), validates the result against a Zod schema
  (`ExtractionSchema`), and merges only the non-empty fields into the draft
  (`lib/server/merge.ts`) — corrections overwrite one field, the rest survives.
- **There is no forced next-question flow, and the chat doesn't narrate.**
  An earlier version of this prototype had `nextQuestion(draft)` pick one
  unsatisfied field at a time and gate the chat on it (with a "weiß nicht /
  überspringen" button); a later one had every turn echo an
  "Erkannt/aktualisiert: …" summary back into the chat. Both are gone —
  what got recognized is visible directly in the tabs (there's no need to
  also say it in the chat), and `frontend/src/lib/questions.js` now only
  exposes `missingRequired()`/`isSubmittable()` (submit gate + tab badges)
  and `followUpQuestions(draft)` (see below). The chat only ever asks; it
  never confirms or reports.
- Every `QUESTION_SLOTS` entry also carries a `category`
  (`frontend/src/lib/questions.js` → `general`/`location`/`time`/`more`),
  which is the only thing that decides which of the four tabs a field
  renders in (`frontend/src/components/RegistrationForm.jsx`,
  `CATEGORY_LABELS`/`CATEGORY_ORDER`) — one more plain lookup table, not a
  layout decision made ad hoc in the component.
- `RegistrationForm.jsx` (the field tabs) and `ChatWindow.jsx` both read/
  write the *same* `draft` via `useChat()` → `ChatContext.jsx`. Editing a
  field directly has identical effect to the model filling it via chat —
  it's how you fix a typo (or a stale LLM-written sentence) without arguing
  with a chatbot.
- **Only extracted fields are shown.** A tab lists only the slots where
  `slot.isSatisfied(draft)` is true — nothing empty, no "fehlt" rows to
  scroll past. What's still missing is summarized two other ways instead: a
  red count badge on the tab (`missingCountByCategory`) and the "Es fehlen
  noch: …" line below the tabs (`stillMissing`, both by label, not by
  showing an empty input). One consequence: a required field the model has
  never touched has **no editable row anywhere** until something mentions
  it in chat — the manual-edit fallback only kicks in once a field exists,
  it doesn't help you originate one from scratch. That's a deliberate
  trade-off for a review-only checklist, not an oversight; revisit if a
  "add this field manually" affordance turns out to be needed after all.
- Submit builds the strict `Item` (`frontend/src/lib/buildItem.js`),
  validates it against `ItemSchema` (only this schema has `required`),
  wraps it in the `AdapterData` envelope, and shows the JSON
  (`App.jsx` → `ResultView`). **No persistence** — the result only ever
  lands in a `<pre>` block with a copy button.

### The 16-nullable-field limit

Claude's structured-outputs endpoint rejects a schema with more than 16
nullable/union-typed parameters ("exponential compilation cost"). A naive
one-nullable-Zod-field-per-form-field `ExtractionSchema` has ~27 and gets a
400. `lib/schema.ts` works around this by grouping leaf fields into a
handful of nullable *objects* (`core`, `place`, `contact`,
`practicalInfo` — one union slot per group instead of one per field) and,
inside a group, spelling "no update this turn" as `""` rather than `null`
(a required string costs nothing against the cap). `lib/server/merge.ts`
still merges per leaf field — `""` means "leave the draft's existing value
alone," anything else overwrites it — so the correction behavior
("nein, 20 Uhr nicht 18 Uhr" changes one field, not the whole group) is
unaffected by the grouping; it's a wire-format detail, not a behavior
change. `onlineOnly`/`tags`/`recurringEvent` stay ungrouped (real `null`)
since `""` has no sane meaning for a boolean or an array. (This schema is
backend-only — the frontend never builds it, only reads the merged draft
back.)

One naming pitfall found while testing: the "place" group was originally
called `location`, and one of its own leaf fields (the venue display name)
was *also* called `location` — a self-referential collision. With that
name, "Wir haben einen Jugendclub in Cottbus aufgemacht" (only a city, no
street) reliably came back with the entire group `null`, `city` included,
even though the prompt explicitly said not to. The model appeared to
generalize "don't invent a location name" from the one ambiguous leaf field
to the whole object. Renaming the leaf to `venueName` (group stays `place`,
maps to `draft.location` in `lib/server/merge.ts`) fixed it — confirmed with
direct before/after reruns of the same input. Worth remembering if you add
more grouped fields: don't reuse a group's own name for one of its members.

### `recurring_event`

The model returns structured objects
(`{interval, day, start, end, exampleDate}`), never the positional-array
string. `frontend/src/lib/recurring.js` (JS port of the backend's former
`lib/client/recurring.ts`) does the two conversions:

- `serializeRecurringEvent()` → the final `'[["weekly","thu","19:00","21:00",null]]'`
  string, computed only at submit time (in the frontend now, since submit
  itself is a frontend-only step — no persistence step exists yet to move
  it to).
- `humanReadableRule()` → what the UI actually shows ("jeden Donnerstag,
  19:00–21:00 Uhr"); the raw string is never displayed.

### Tags

`lib/server/tags.ts` fetches the controlled vocabulary from
`https://mappo.mittendrin.in/tt/latest` once per server process (the
closest a Next dev server gets to "at startup"). The live endpoint returns
a JSON array wrapping an `AdapterData`-shaped envelope of its own, with
`itemsRecord` as an *object* (not array) keyed by a compound id — the
actual tag value is each entry's `name` field (e.g. `"arts_choir"`), not
the key. `normalizeTagRecord()` handles that real shape (confirmed by
fetching it directly — ~100 unique tag/category names as of this writing);
`normalizeTagList()` is a fallback for a plainer array-of-strings/objects
shape in case the endpoint changes. On any failure (timeout, non-200,
unrecognized shape) it falls back to a hardcoded 15-tag list with a
`console.warn`. The live/fallback list is what gets turned into a
`z.enum(...)` for the request-time extraction schema
(`buildExtractionRequestSchema`), so the model is constrained at the API
level, not just asked nicely.

`draft.tags` is still extracted, still validated, and still included in
the final submitted `Item` (`buildItem.js`) — but the UI no longer shows or
edits it (`RegistrationForm.jsx` has no "tags" slot in
`frontend/src/lib/questions.js` anymore, and `components/TagPicker.jsx` was
removed as dead code once nothing imported it). `GET /api/tags` and
`frontend/src/api/client.js` → `fetchTags()` still exist and still work —
just unused for now. Reintroduce the "tags" slot in `questions.js` and call
`fetchTags()` from `ChatContext.jsx` again (it's a one-line
`useEffect`, see the comment left in its place) if a tag editor comes
back.

### CORS

`lib/server/cors.ts` sets `Access-Control-Allow-Origin` to the frontend's
origin (env var `FRONTEND_ORIGIN`, default `http://localhost:5173` — the
Vite default) on both routes, and both export an `OPTIONS` handler for the
browser's preflight request. Deliberately not a wildcard (`*`), even
though neither endpoint uses cookies/credentials — keeps the door only as
open as it needs to be. If you change the frontend's dev port, update
`FRONTEND_ORIGIN` in `.env.local`.

### Guardrails

- `message` is capped at 2000 chars both client-side (counter, hard
  `disabled` on send) and server-side (`ExtractRequestSchema`, zod `.max()`)
  — a modified client can't bypass it.
- `draft.turnCount` is capped at 8; past that, `/api/extract` refuses and
  the UI forces manual completion via the field tabs (chat input is
  disabled, editing and submit stay open).
- `lib/server/rateLimit.ts` is a simple in-memory fixed-window limiter per
  IP (20 requests / 10 minutes). Resets on restart, single-process only —
  adequate for a local prototype, not for production.
- The model's structured output is validated against `ExtractionSchema`
  before it's allowed to touch the draft; on any failure (bad JSON, failed
  Anthropic call, failed schema check) the **old draft is returned
  unchanged** and a plain-text error is shown — never a crash, never
  half-merged garbage.
- The final submitted object is always the output of `ItemSchema.safeParse`
  on the assembled draft (now run in the frontend, via
  `frontend/src/lib/schema.js`) — raw model output is never sent to a
  "backend" for persistence (there is none in this prototype, but the
  shape of the guarantee is real, and would apply equally if a real
  persistence endpoint were added — see "Out of scope" below).

## An assumption worth flagging

The spec lists "location" both as part of the required
locate-this-place rule and as a skippable venue-name field. This build
resolves it as: `draft.location` = optional plain-text venue name (e.g.
"Sozialstation Torstraße", wire name `venueName` on the backend — see the
naming-pitfall note above); the locate-it requirement is
`(address && city) || website || onlineOnly`. `onlineOnly` (boolean) was
added — it isn't in the original field list, but "an explicit note that
it's online-only" needed a home that isn't a fake street address. If the
real mappo.mittendrin.in schema names these fields differently, both
`lib/schema.ts` and `frontend/src/lib/schema.js` need to change, plus
`frontend/src/lib/questions.js` and the "locating" branch in
`frontend/src/components/RegistrationForm.jsx`.

## title/brief as generated suggestions, not strict extraction

Initially `title` (and the venue-name field) followed the same
invent-nothing rule as addresses/phone numbers: a vague input like "Wir
haben einen neuen Jugendclub in Cottbus aufgemacht" left `title` `null`,
forcing a question for it. That was changed on request — `title` and
`brief` (the search-result subtitle/teaser) are now generated suggestions
from whatever the text gives, same license `description` already had, and
get flagged `inferred` (amber, "geraten, bitte prüfen") so it's obvious
they're a suggestion to check, not a verbatim fact. `lib/server/prompt.ts`
rule 3 covers this; rule 1 still holds the line on actual facts (phone,
zip, website, venue name) — those stay empty rather than guessed.
`address` used to be in that list too, and used to be a model guess like
title/brief — see the next section, that's since been replaced with
something more reliable.

## `address` via real geocoding (Nominatim), not a model guess

The first version of this let the LLM propose an `address` from general
knowledge when none was given in the text (e.g. "Schloss Sanssouci in
Potsdam" → the model recalling `address: "Maulbeerallee 1"`), flagged
`inferred` for review. It worked, but it was still fundamentally a
language-model guess sitting next to fields the app otherwise refuses to
invent — direct tension with the original "invent nothing" rule, and
Haiku wasn't even fully reliable at respecting its own boundaries within
that guess (it guessed `zip` too, despite an explicit rule against it, on
the first attempt — see git history / earlier revisions of this file for
that whole story).

Replaced entirely with a real lookup: `lib/server/geocode.ts` calls
**Nominatim** (OpenStreetMap's free geocoding API, no key required)
whenever `POST /api/extract` produces a draft with a venue name
(`location`) and a `city` but no `address` — `app/api/extract/route.ts` →
`maybeGeocode()`, run once after the merge, on every matching turn. The
LLM itself no longer guesses addresses at all (`lib/server/prompt.ts` rule
1 is back to strict "erfinde nichts" for `address`, same as `zip`/`phone`/
`website`/`venueName`).

- **Real data, not a guess**: `geocodeVenue("Café Extrablatt", "Darmstadt")`
  returns the actual `Marktplatz 11, 64283 Darmstadt` — an OpenStreetMap
  database lookup, not the model recalling something from training.
  `latitude`/`longitude` (previously *always* `null`, per the original
  spec — `lib/schema.ts` used to type them as literal `z.null()`) now come
  back real too, straight from the same lookup, no separate step.
- **Nothing found → stays empty**, same contract as before: a made-up
  venue in a made-up city returns no address, no zip, no coordinates — the
  hallucination risk is gone, not just hidden, because there's no guessing
  step left to produce a wrong-but-plausible-looking answer.
- **Still flagged for review**: `address` (and `zip`, if Nominatim returned
  one) go into `inferred` exactly like before — a lookup can still be the
  wrong branch of a chain, or match a same-named place in the wrong part
  of a city, so it's "automatisch ermittelt, bitte prüfen"
  (`RegistrationForm.jsx`'s status label was generalized from "geraten,
  bitte prüfen" to cover both this and the model-generated title/brief
  case), not silently trusted.
- **A real integration quirk, found by testing, not documented anywhere**:
  Nominatim's query parser reliably returns **zero results** for a query
  containing "é" — `"Café Extrablatt Darmstadt"` → `[]`, `"Cafe Extrablatt
  Darmstadt"` → the correct hit — even though the underlying OSM data
  itself does contain accented names (confirmed with a second example,
  "Café Nord" vs "Cafe Nord", same pattern). `geocodeVenue()` retries once
  with diacritics stripped before giving up.
- **Rate limiting is process-wide, not per-request**: Nominatim's usage
  policy caps free use at ~1 request/second and requires an identifying
  `User-Agent` (browsers can't set that header themselves, which is one
  reason this lives server-side rather than being called from the
  frontend). `geocode.ts` serializes every call through a single queue
  with a ~1.1s minimum gap, shared across all concurrent `/api/extract`
  requests — not a per-IP or per-user limit, a hard global one. On a busy
  server this would queue up and add latency to every turn that needs a
  lookup; fine for a local prototype, would need real caching (and
  probably a paid geocoder) before any real traffic.
- **Auto-triggered, not a button**: runs on every turn where the condition
  holds, no user action needed — the tradeoff accepted for that is the
  latency above; a "Adresse per API vorschlagen" button (opt-in, not on
  every turn) was the alternative considered and is a straightforward
  follow-up if the automatic latency turns out to be annoying in practice.

## Deterministic follow-up questions for Ort/Zeit

The chat now nudges specifically on location and time — the two fields
that make an entry actually usable — without reviving the old
one-field-at-a-time wizard. `frontend/src/lib/questions.js` →
`followUpQuestions(draft)` runs after every extraction turn
(`context/ChatContext.jsx` → `sendMessage()`) and returns 0–2 plain German
question strings, each becoming its own chat bubble. Nothing else gets
written to the chat on a successful turn — no "Erkannt/aktualisiert: …", no
confirmation, no narration of what changed. If neither Ort nor Zeit needs a
nudge, a turn that recognized something can add zero new chat bubbles;
what was recognized is still visible, just in the tabs, not repeated in
the chat:

- **Ort**: asks if the `locating` slot is still unsatisfied (no usable
  address+city, no website, not marked online-only); asks a *different*,
  softer confirmation question instead if `locating` is satisfied but
  `"address"` is in `draft.inferredFields` — i.e. the backend guessed it
  (see the `address`-as-best-effort-guess section above) rather than
  reading it verbatim, so it's worth double-checking.
- **Zeit**: asks if the `hoursOrRecurring` slot is unsatisfied. There's no
  "inferred → imprecise" signal for time the way there is for a guessed
  address (nothing currently makes `hours.de` a generated suggestion), so
  only the missing case is covered — a vague-but-present time like
  "nachmittags" satisfies the slot and won't trigger a follow-up. Worth
  revisiting if that turns out to matter in practice.

This stays consistent with the rest of the app's design: **the model never
decides what to ask** — `followUpQuestions()` is a plain function over the
draft, same lookup-table principle as `QUESTION_SLOTS` itself. And it's
**non-blocking** — the extra chat bubbles are just messages; they don't
disable the input, hide the tabs, or require a reply before doing anything
else. Verified with a pure unit check (`emptyDraft()` → both questions;
"Hauptstraße 12"/"Potsdam"/a real `recurringEvent` and nothing inferred →
no questions; `address` present but in `inferredFields` → only the
confirm-the-address question; a draft with only `city` set → both
questions again).

## Chat-first initial layout

`frontend/src/App.jsx` now only renders `<RegistrationForm />` once
`draft.turnCount > 0` — i.e. after the first message has actually been
sent, successful extraction or not (a turn that recognized nothing still
counts, matching "nach der ersten Eingabe" literally, not "after something
was successfully extracted"). Before that, `<ChatWindow />` is the only
thing in the page body, so it's naturally what's on top — no reordering
logic needed, the form just isn't in the DOM yet. `hasContent` in
`ChatWindow.jsx`/`ChatInput.jsx` (placeholder text, row count) already
tracked the same `draft.turnCount > 0` condition independently; this reuses
the same signal for a different purpose (visibility of a whole section
rather than copy) rather than introducing a second concept of "has
content."

## Out of scope (and where it would hook in)

- ~~**Geocoding** — `latitude`/`longitude` are always `null`.~~ No longer
  out of scope — see "`address` via real geocoding (Nominatim)" above.
  `latitude`/`longitude` are populated automatically whenever the address
  is too. A manual "Koordinaten ermitteln" button (only geocode on request,
  not on every turn) was the original plan and is still a reasonable
  follow-up if the automatic latency turns out to be a problem in practice.
- **Image upload** — `image` is a plain URL text field
  (`frontend/src/components/RegistrationForm.jsx`, slot `"image"`). A real
  upload would need a storage endpoint (on the backend, so it can hold
  credentials) and would replace that `<input>` with a file picker that
  POSTs to it.
- **English translations** — every i18n object in `lib/schema.ts` /
  `frontend/src/lib/schema.js` only ever gets a `de` key. Adding a language
  means widening those objects (both copies) and the extraction prompt
  (`lib/server/prompt.ts`), not changing the architecture.
- **Multi-item submission** — `AdapterDataSchema.itemsRecord` is already a
  record, but the frontend (`App.jsx`) only ever builds one entry from one
  `draft`. Multiple items would mean an array of drafts and a slug-collision
  check in `frontend/src/lib/slug.js`.
- **Real persistence** — `submit()` in `frontend/src/context/ChatContext.jsx`
  only renders JSON (`resultJson` → `ResultView` in `App.jsx`). Persisting
  would mean POSTing `parsedAdapter.data` to a new backend endpoint (e.g.
  `POST /api/submit` in `app/api/`) instead of just calling
  `setResultJson(...)` — and that's also where the final
  `ItemSchema.safeParse` guarantee would move to (or be duplicated), since
  a real backend should never trust a client-side validation pass alone.
- **Turnstile/captcha** — would sit in front of `POST /api/extract` in
  `app/api/extract/route.ts`, alongside the existing rate limiter.
- **Event search/listing/registration** — see "Files that don't do
  anything yet" above; `EventCard`/`EventList`/`useEventSearch` are
  placeholders, not a feature.

## Known limitation: free-text fields can go stale after a narrow correction

`brief.de`/`description.de`/`hours.de` are generated prose that can embed a
detail (a day, a time) also held structurally elsewhere (`recurringEvent`).
If a later message corrects only the structured value (test case 3 below),
the model — correctly, per the merge rules — doesn't touch the `core`/
`practicalInfo` groups just because nothing in *them* changed, so a
generated sentence can go on saying "jeden Donnerstag" after the day's been
corrected to Tuesday elsewhere. This satisfies the actual merge contract
(unrelated fields aren't touched) but can leave prose that's a beat behind
the structured data. The brief/description fields (Allgemeine Infos tab)
are directly editable for exactly this reason — no field is chat-only.

## Testing

All three scenarios from the spec were run against the live API
(`claude-haiku-4-5-20251001`), not just read over — request/response
bodies posted straight to `/api/extract`, and the resulting draft pushed
through the real `buildItem` → `ItemSchema` → `AdapterDataSchema` submit
path to confirm the final JSON validates. After the frontend/backend split,
the same three were re-verified end-to-end cross-origin (`curl` with an
`Origin: http://localhost:5173` header against the running backend, plus a
CORS preflight check and a `vite build` to confirm the ported frontend code
compiles):

1. **Recurring, near-complete**: "Jeden Donnerstag von 19 bis 21 Uhr offenes
   Brettspieltreffen im Café Nord, Hauptstraße 12, 14467 Potsdam. Eintritt
   frei, barrierefrei zugänglich, Kontakt Maria Schulz, 0331 1234567." →
   one call filled title, brief/description, address/zip/city, charge,
   accessibility, contact, phone, tags, and a correct structured
   `recurringEvent` (`weekly`/`thu`/`19:00`–`21:00`). All required fields
   satisfied — nothing left to ask, matches "fills nearly everything,
   asks almost nothing."
2. **Vague one-liner**: "Wir haben einen neuen Jugendclub in Cottbus
   aufgemacht." → `title`/`brief`/`description` came back as generated
   suggestions ("Jugendclub Cottbus" / a one-line teaser / a short
   description), all flagged `inferred`; `address`/`zip`/`website` stayed
   `null` — no invented street or zip. `city` came back `null` too in this
   exact phrasing (the model reads "in Cottbus aufgemacht" as naming the
   club, not as a separate locative fact — confirmed via isolated reruns
   that a plainer phrasing like "Das Treffen findet in Cottbus statt."
   extracts `city` correctly). Either way `isSubmittable()` is `false`
   (locating is unsatisfied) and the "Ort" tab correctly shows a red badge —
   the practical requirement, "don't invent a street/zip," holds.
3. **Correction mid-flow**: turn 1's result, then "Ach halt, es ist
   Dienstag nicht Donnerstag, und die Adresse ist Hauptstraße 21." →
   diffed the before/after drafts field-by-field: only `address`
   (`"Hauptstraße 12"` → `"Hauptstraße 21"`) and `recurringEvent`
   (`day: "thu"` → `"tue"`, `interval`/`start`/`end` preserved) changed.
   Every other field — title, brief, description, zip, city, phone,
   contact, charge, accessibility, tags — survived untouched.
