import Link from "next/link";

// The two faces of /savings. Passed explicitly so the pages stay server
// components: there is no client state to read here.
export function SavingsTabs({ current }: { current: "movements" | "goals" }) {
  return (
    <nav aria-label="Savings" className="flex flex-wrap gap-2">
      <Tab href="/savings" label="Movements" active={current === "movements"} />
      <Tab href="/savings/goals" label="Goals" active={current === "goals"} />
    </nav>
  );
}

function Tab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  const colors = active
    ? "border-accent-soft bg-accent-soft text-accent"
    : "border-line text-muted hover:bg-surface hover:text-text";
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full border px-4 py-1 text-sm transition-colors ${colors}`}
    >
      {label}
    </Link>
  );
}
