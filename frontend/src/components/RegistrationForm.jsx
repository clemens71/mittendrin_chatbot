import { useState } from "react";
import { useChat } from "../hooks/useChat";
import { CATEGORY_LABELS, CATEGORY_ORDER, isI18nField, missingCountByCategory, slotsByCategory, slotStatus } from "../lib/questions";
import RecurringEditor from "./RecurringEditor";

// The form you fill out to submit ("register") an entry — the port of the
// Next.js prototype's FieldTabs.tsx, renamed to fit this scaffold. Reads
// its state from useChat() rather than props, since the draft is shared
// with ChatWindow via ChatContext.

// Only ever rendered for satisfied slots (see the filter below) — "missing"
// never actually shows as a row, but the keys stay so slotStatus() and
// missingCountByCategory() (still used for the tab badges + the "Es fehlen
// noch" summary) keep a consistent status vocabulary.
const STATUS_STYLES = {
  missing: "border-l-[var(--color-required-missing)] bg-[var(--color-required-missing-bg)]",
  inferred: "border-l-[var(--color-inferred)] bg-[var(--color-inferred-bg)]",
  filled: "border-l-[var(--color-filled)] bg-white",
};

const STATUS_LABEL = {
  missing: "fehlt",
  // Covers two different sources — a model-generated suggestion (title/
  // brief/description) and a server-side lookup (address/zip/coordinates
  // via geocoding, see lib/server/geocode.ts) — neither is verbatim from
  // what was typed, so both get the same "please check" treatment.
  inferred: "automatisch ermittelt, bitte prüfen",
  filled: "ok",
};

export default function RegistrationForm() {
  const { draft, updateDraft, submit, submittable, stillMissing } = useChat();
  const [activeTab, setActiveTab] = useState("general");

  const setField = (key, value) => {
    if (isI18nField(key)) {
      updateDraft({ [key]: value ? { de: value } : null }, [key]);
    } else {
      updateDraft({ [key]: value || null }, [key]);
    }
  };

  const getFieldValue = (key) => {
    const v = draft[key];
    if (v && typeof v === "object" && "de" in v) {
      return String(v.de ?? "");
    }
    return v == null ? "" : String(v);
  };

  const renderEditor = (slot) => {
    switch (slot.id) {
      case "locating":
        return (
          <div className="grid gap-1.5 sm:grid-cols-2">
            <input
              className="rounded border border-[var(--color-border)] px-2 py-1 text-sm"
              placeholder="Straße, Hausnummer"
              value={getFieldValue("address")}
              onChange={(e) => updateDraft({ address: e.target.value || null }, ["address"])}
            />
            <input
              className="rounded border border-[var(--color-border)] px-2 py-1 text-sm"
              placeholder="Ort"
              value={getFieldValue("city")}
              onChange={(e) => updateDraft({ city: e.target.value || null }, ["city"])}
            />
            <input
              className="rounded border border-[var(--color-border)] px-2 py-1 text-sm sm:col-span-2"
              placeholder="Website (alternativ)"
              value={getFieldValue("website")}
              onChange={(e) => updateDraft({ website: e.target.value || null }, ["website"])}
            />
            <label className="flex items-center gap-1.5 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={draft.onlineOnly === true}
                onChange={(e) => updateDraft({ onlineOnly: e.target.checked || null }, ["onlineOnly"])}
              />
              findet nur online statt (kein physischer Ort)
            </label>
          </div>
        );

      case "hoursOrRecurring":
        return (
          <div className="space-y-2">
            <RecurringEditor
              rules={draft.recurringEvent}
              onChange={(rules) => updateDraft({ recurringEvent: rules }, ["recurringEvent"])}
            />
            <div>
              <span className="text-xs text-[var(--color-ink-muted)]">oder als Freitext:</span>
              <textarea
                className="mt-1 w-full rounded border border-[var(--color-border)] px-2 py-1 text-sm"
                rows={2}
                value={getFieldValue("hours")}
                onChange={(e) => setField("hours", e.target.value)}
              />
            </div>
          </div>
        );

      default: {
        const key = slot.fields[0];
        if (slot.inputType === "textarea") {
          return (
            <textarea
              className="w-full rounded border border-[var(--color-border)] px-2 py-1 text-sm"
              rows={3}
              value={getFieldValue(key)}
              onChange={(e) => setField(key, e.target.value)}
            />
          );
        }
        return (
          <input
            className="w-full rounded border border-[var(--color-border)] px-2 py-1 text-sm"
            value={getFieldValue(key)}
            onChange={(e) => setField(key, e.target.value)}
          />
        );
      }
    }
  };

  const Field = ({ slot }) => {
    const status = slotStatus(slot, draft);
    return (
      <div className={`rounded-r border-l-4 px-3 py-2 ${STATUS_STYLES[status]}`}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{slot.label}</span>
          <span className="shrink-0 text-xs font-normal text-[var(--color-ink-muted)]">{STATUS_LABEL[status]}</span>
        </div>
        {slot.hint && <p className="mb-1 text-xs text-[var(--color-ink-muted)]">{slot.hint}</p>}
        {renderEditor(slot)}
      </div>
    );
  };

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-ink-muted)]">
          Was bisher erkannt wurde — bei Bedarf direkt anpassen. Was noch fehlt, steht unten und als Zahl am Reiter.
        </p>
        <button
          onClick={submit}
          disabled={!submittable}
          className="shrink-0 rounded bg-[var(--color-accent)] px-4 py-1.5 text-sm font-medium text-[var(--color-accent-contrast)] disabled:opacity-40"
        >
          Eintrag absenden
        </button>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-[var(--color-border)]">
        {CATEGORY_ORDER.map((cat) => {
          const missing = missingCountByCategory(cat, draft);
          const active = cat === activeTab;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveTab(cat)}
              className={
                "relative -mb-px flex items-center gap-1.5 rounded-t border border-b-0 px-3 py-1.5 text-sm " +
                (active
                  ? "border-[var(--color-border)] bg-white font-medium text-[var(--color-ink)]"
                  : "border-transparent text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]")
              }
            >
              {CATEGORY_LABELS[cat]}
              {missing > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-required-missing)] px-1 text-[10px] font-semibold text-white">
                  {missing}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-2 border border-t-0 border-[var(--color-border)] p-3">
        {(() => {
          const extracted = slotsByCategory(activeTab).filter((slot) => slot.isSatisfied(draft));
          if (extracted.length === 0) {
            return <p className="text-sm text-[var(--color-ink-muted)]">Hier ist noch nichts erkannt worden.</p>;
          }
          return extracted.map((slot) => <Field key={slot.id} slot={slot} />);
        })()}
      </div>

      {!submittable && (
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
          Es fehlen noch: {stillMissing.map((s) => s.label).join(", ")}
        </p>
      )}
    </section>
  );
}
