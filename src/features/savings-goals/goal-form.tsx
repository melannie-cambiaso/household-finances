"use client";

import { useActionState, useEffect } from "react";

import { NAME_MAX_LENGTH } from "@/features/savings-goals/rules";
import { useModalClose } from "@/shared/ui/modal";

import {
  createGoalAction,
  updateGoalAction,
  type GoalFormState,
  type GoalFormValues,
} from "./actions";

const initialState: GoalFormState = { status: "idle" };

const inputClass =
  "w-full rounded-xl border border-line bg-page px-3 py-2 text-text";

// Creates a savings goal, or edits its name, target amount and target date.
export function GoalForm({
  goal,
}: {
  // Present when editing: the goal id and the values to pre-fill.
  goal?: { id: string; values: GoalFormValues };
}) {
  const [state, formAction, pending] = useActionState(
    goal ? updateGoalAction : createGoalAction,
    initialState,
  );
  const close = useModalClose();

  useEffect(() => {
    if (state.status === "success") close();
  }, [state, close]);

  // After a failed save the fields show what was typed, not the stored values.
  const values = state.status === "error" ? state.values : (goal?.values ?? null);
  // Remount the inputs on failure so they show what was typed.
  const attempt = state.status === "error" ? "typed" : "stored";

  return (
    <form action={formAction} className="grid gap-3">
      {goal && <input type="hidden" name="goalId" value={goal.id} />}

      <label className="grid gap-1">
        <span className="text-muted">Name</span>
        <input
          key={`${attempt}-name`}
          name="name"
          type="text"
          required
          autoComplete="off"
          maxLength={NAME_MAX_LENGTH}
          placeholder="Emergency fund"
          defaultValue={values?.name ?? ""}
          className={inputClass}
        />
      </label>

      <label className="grid gap-1">
        <span className="text-muted">Target amount (CLP)</span>
        <input
          key={`${attempt}-target-amount`}
          name="targetAmount"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required
          placeholder="1.000.000"
          defaultValue={values?.targetAmount ?? ""}
          className={inputClass}
        />
      </label>

      <label className="grid gap-1">
        <span className="text-muted">Target date (optional)</span>
        <input
          key={`${attempt}-target-date`}
          name="targetDate"
          type="date"
          defaultValue={values?.targetDate ?? ""}
          className={inputClass}
        />
      </label>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-expense">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="justify-self-start rounded-full bg-accent px-5 py-2 text-page transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving..." : goal ? "Save changes" : "Add goal"}
      </button>
    </form>
  );
}
