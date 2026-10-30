"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SignOutButton } from "./sign-out-button";

// Only pages that exist are listed; add an entry here when a new page ships.
const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/accounts", label: "Accounts", icon: "🏦" },
  { href: "/expenses", label: "Expenses", icon: "💸" },
  { href: "/incomes", label: "Incomes", icon: "💰" },
  { href: "/transfers", label: "Transfers", icon: "🔁" },
  { href: "/savings", label: "Savings", icon: "🐷" },
];

// Rarely used pages live under one expandable entry to keep the menu short.
const CONFIG_ITEMS = [
  { href: "/budget", label: "Budget", icon: "📊" },
  { href: "/categories", label: "Categories", icon: "🏷️" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  // Only matters below the md breakpoint: from md up the menu is always shown.
  const [open, setOpen] = useState(false);
  const [configToggled, setConfigToggled] = useState(false);
  // Stays open while one of its pages is showing, so the current page is never hidden.
  const configActive = CONFIG_ITEMS.some((item) => isActive(pathname, item.href));
  const configOpen = configToggled || configActive;

  return (
    <aside className="sticky top-0 z-20 flex max-h-dvh w-full flex-col gap-4 border-b border-line bg-sidebar p-4 md:h-dvh md:w-60 md:shrink-0 md:border-r md:border-b-0">
      <div className="flex items-center justify-between">
        <p className="px-2 py-3 text-xl">Household finances</p>
        <button
          type="button"
          className="rounded-xl border border-line p-2 text-muted transition-colors hover:bg-surface hover:text-text md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="main-menu"
          onClick={() => setOpen((value) => !value)}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      <div
        id="main-menu"
        className={`${open ? "flex" : "hidden"} min-h-0 flex-col gap-4 md:flex md:flex-1`}
      >
        <nav aria-label="Main" className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(pathname, item.href)}
              onNavigate={() => setOpen(false)}
            />
          ))}

          <button
            type="button"
            aria-expanded={configOpen}
            aria-controls="config-menu"
            onClick={() => setConfigToggled((value) => !value)}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
              configActive
                ? "text-accent"
                : "text-muted hover:bg-surface hover:text-text"
            }`}
          >
            <span aria-hidden="true">⚙️</span>
            <span className="flex-1">Config</span>
            <span aria-hidden="true" className="text-sm">
              {configOpen ? "▾" : "▸"}
            </span>
          </button>
          {configOpen && (
            <div id="config-menu" className="ml-4 flex flex-col gap-2 border-l border-line pl-2">
              {CONFIG_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
          )}
        </nav>

        <div className="mt-auto shrink-0">
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: { href: string; label: string; icon: string };
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
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
}
