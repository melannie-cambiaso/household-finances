"use client";

import { useActionState, useState } from "react";

import { plannedTotals } from "@/lib/budget";
import { formatClp } from "@/shared/money";

import { saveBudgetAction, type BudgetFormState } from "./actions";

export type EditorItem = { id: string; name: string; categoryName: string };
export type EditorSource = { id: string; name: string };

const initialState: BudgetFormState = { status: "idle" };

const inputClass =
  "w-36 rounded-xl border border-line bg-page px-3 py-1 text-right font-numeric text-text";

function groupByCategory(items: EditorItem[]) {
  const groups = new Map<string, EditorItem[]>();
  for (const item of items) {
    const group = groups.get(item.categoryName) ?? [];
    group.push(item);
    groups.set(item.categoryName, group);
  }
  return [...groups.entries()];
}

export function BudgetEditor({
  month,
  items,
  sources,
  planned,
}: {
  month: string;
  items: EditorItem[];
  sources: EditorSource[];
  // Current planned amounts keyed by field name; a missing key means no line.
  planned: Record<string, string>;
}) {
  const [state, formAction, isSaving] = useActionState(
    saveBudgetAction,
    initialState,
  );
  const typed = state.status === "error" ? state.values : null;
  const errors = state.status === "error" ? state.errors : {};

  // After a failed save the form shows what the user typed, not the saved value.
  const valueOf = (name: string) => typed?.[name] ?? planned[name] ?? "";

  // What is currently in the fields, so the totals follow what is being typed.
  const [edited, setEdited] = useState<Record<string, string>>({});
  const totals = plannedTotals({ ...planned, ...typed, ...edited });

  const row = (name: string, label: string) => (
    <li key={name} className="flex items-center justify-between gap-4">
      <label htmlFor={name} className="min-w-0 truncate">
        {label}
      </label>
      <div className="flex flex-col items-end">
        <input
          id={name}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="—"
          // Keyed by the typed value so a failed save shows what was typed.
          key={`${name}-${typed ? "typed" : "saved"}`}
          defaultValue={valueOf(name)}
          className={inputClass}
        />
        {errors[name] && (
          <span role="alert" className="text-sm text-expense">
            {errors[name]}
          </span>
        )}
      </div>
    </li>
  );

  return (
    <form
      action={formAction}
      className="grid gap-6"
      onInput={(event) => {
        const field = event.target as HTMLInputElement;
        setEdited((current) => ({ ...current, [field.name]: field.value }));
      }}
    >
      <input type="hidden" name="month" value={month} />

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xl">
          Planned spending
          <span className="font-numeric font-bold text-expense">
            {formatClp(totals.spending)}
          </span>
        </h2>
        <p className="mb-4 text-sm text-muted">
          Leave an amount blank to plan nothing for that item. A 0 is a plan of
          zero.
        </p>
        <div className="grid gap-5">
          {groupByCategory(items).map(([category, group]) => (
            <div key={category}>
              <h3 className="mb-2 text-muted">{category}</h3>
              <ul className="grid gap-2">
                {group.map((item) => row(`item:${item.id}`, item.name))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface p-6">
        <h2 className="mb-4 flex flex-wrap items-baseline justify-between gap-2 text-xl">
          Planned income
          <span className="font-numeric font-bold text-income">
            {formatClp(totals.income)}
          </span>
        </h2>
        <ul className="grid gap-2">
          {sources.map((source) => row(`source:${source.id}`, source.name))}
        </ul>
      </section>

      {state.status === "error" && state.message && (
        <p role="alert" className="text-expense">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" className="text-income">
          Budget saved
        </p>
      )}

      <button
        type="submit"
        disabled={isSaving}
        className="justify-self-end rounded-full bg-accent px-5 py-2 text-page transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isSaving ? "Saving..." : "Save budget"}
      </button>
    </form>
  );
}
