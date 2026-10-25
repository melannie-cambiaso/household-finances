"use client";

import { useActionState, useEffect } from "react";

import { useModalClose } from "@/shared/ui/modal";
import {
  setOpeningBalanceAction,
  type OpeningBalanceFormState,
} from "./actions";

const initialState: OpeningBalanceFormState = { status: "idle" };

const inputClass =
  "w-full rounded-xl border border-line bg-page px-3 py-2 text-text";

// Sets the opening balance of one savings account, or changes the current one.
export function OpeningBalanceForm({
  accountId,
  opening,
  today,
}: {
  accountId: string;
  opening: { amount: number; on: string } | null;
  today: string;
}) {
  const [state, formAction, pending] = useActionState(
    setOpeningBalanceAction,
    initialState,
  );
  const close = useModalClose();

  useEffect(() => {
    if (state.status === "success") close();
  }, [state, close]);

  // After a failed save the fields show what was typed, not the stored values.
  const typed = state.status === "error" ? state.values : null;
  const errors = state.status === "error" ? state.errors : {};

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="accountId" value={accountId} />
      <p className="text-sm text-muted">
        How much was saved at the start of a given day. The balance is this
        amount plus everything that moved from that day on, that day included,
        so use the figure from before you registered that day&apos;s movements.
      </p>
      <label className="grid gap-1">
        <span className="text-muted">Amount saved (CLP)</span>
        <input
          // Remount so a failed save shows what was typed.
          key={typed === null ? "stored-amount" : "typed-amount"}
          name="amount"
          type="text"
          inputMode="numeric"
          required
          autoComplete="off"
          defaultValue={typed?.amount ?? (opening ? String(opening.amount) : "")}
          aria-invalid={errors.amount ? true : undefined}
          className={inputClass}
        />
        {errors.amount && (
          <span role="alert" className="text-sm text-expense">
            {errors.amount}
          </span>
        )}
      </label>
      <label className="grid gap-1">
        <span className="text-muted">At the start of</span>
        <input
          key={typed === null ? "stored-on" : "typed-on"}
          name="on"
          type="date"
          required
          max={today}
          defaultValue={typed?.on ?? opening?.on ?? today}
          aria-invalid={errors.on ? true : undefined}
          className={inputClass}
        />
        {errors.on && (
          <span role="alert" className="text-sm text-expense">
            {errors.on}
          </span>
        )}
      </label>
      {state.status === "error" && state.message && (
        <p role="alert" className="text-sm text-expense">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="justify-self-start rounded-full bg-accent px-5 py-2 text-page transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
