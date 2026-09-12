export default function MessageBubble({ entry }) {
  const className =
    "max-w-[85%] rounded-lg px-3 py-2 text-sm " +
    (entry.role === "user"
      ? "ml-auto bg-[var(--color-accent)] text-[var(--color-accent-contrast)]"
      : entry.role === "assistant"
        ? "bg-[var(--color-bg)]"
        : "mx-auto bg-transparent text-center text-xs italic text-[var(--color-ink-muted)]");

  return <div className={className}>{entry.text}</div>;
}
