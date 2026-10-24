"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SignOutButton } from "./sign-out-button";

// Only pages that exist are listed; add an entry here when a new page ships.
const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/expenses", label: "Expenses", icon: "💸" },
  { href: "/incomes", label: "Incomes", icon: "💰" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-full flex-col gap-4 border-b border-line bg-sidebar p-4 md:min-h-screen md:w-60 md:shrink-0 md:border-r md:border-b-0">
      <p className="px-2 py-3 text-xl">Household finances</p>

      <nav aria-label="Main" className="flex gap-2 md:flex-col">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
                active
                  ? "bg-accent-soft text-accent"
                  : "text-muted hover:bg-surface hover:text-text"
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        <SignOutButton />
      </div>
    </aside>
  );
}
