"use client";

import { useActionState, useEffect } from "react";

import { TRANSFER_KINDS, transferKindLabel, type TransferKind } from "@/features/transfers/rules";

import {
  createTransferAction,
  updateTransferAction,
  type TransferFormState,
  type TransferFormValues,
} from "./actions";
import { useModalClose } from "@/shared/ui/modal";

type AccountOption = { id: string; name: string };
type GoalOption = { id: string; name: string };

const initialState: TransferFormState = { status: "idle" };

const inputClass =
  "w-full rounded-xl border border-line bg-page px-3 py-2 text-text";

export function TransferForm({
  accounts,
  today,
  transfer,
  goals,
  toAccounts,
  presetGoalId,
  presetKind,
}: {
  accounts: AccountOption[];
  today: string;
  // Present when editing: the transfer id and the values to pre-fill.
  transfer?: { id: string; values: TransferFormValues };
  // The active goals, when the form offers a contribution. Without them a goal
  // the transfer already has is only kept, never chosen.
  goals?: GoalOption[];
  // What the money may go to; every account unless only savings can take it.
  toAccounts?: AccountOption[];
  // The goal to start on: how a goal card contributes to itself.
  presetGoalId?: string;
  presetKind?: TransferKind;
}) {
  const [state, formAction, pending] = useActionState(
    transfer ? updateTransferAction : createTransferAction,
    initialState,
  );

  const close = useModalClose();

  useEffect(() => {
    if (state.status === "success") close();
  }, [state, close]);
  // After a failed save the form shows what was typed, not the stored values.
  const values =
    state.status === "error" ? state.values : (transfer?.values ?? null);
  const errors = state.status === "error" ? state.errors : {};
  const goalId =
    values?.goalId ?? transfer?.values.goalId ?? presetGoalId ?? "";
  const kind = values?.kind ?? transfer?.values.kind ?? presetKind ?? "";
  const toOptions = toAccounts ?? accounts;

  const accountSelect = (
    name: "fromAccountId" | "toAccountId",
    label: string,
    placeholder: string,
    options: AccountOption[],
  ) => (
    <label className="grid gap-1">
      <span className="text-muted">{label}</span>
      {/* React does not apply a changed defaultValue to a mounted <select>,
          so the key remounts it with the choice the user had made. */}
      <select
        key={`${name}-${values?.[name] ?? ""}`}
        name={name}
        required
        defaultValue={values?.[name] ?? ""}
        className={inputClass}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
      {errors[name] && <FieldError message={errors[name]} />}
    </label>
  );

  return (
    <form action={formAction} className="grid w-full gap-4">
      {transfer && (
        <input type="hidden" name="transferId" value={transfer.id} />
      )}
      {accountSelect("fromAccountId", "From", "Choose the source account", accounts)}
      {accountSelect("toAccountId", "To", "Choose the destination account", toOptions)}

      {goals ? (
        <label className="grid gap-1">
          <span className="text-muted">Goal (optional)</span>
          <select
            key={`goal-${goalId}`}
            name="goalId"
            defaultValue={goalId}
            className={inputClass}
          >
            <option value="">No goal</option>
            {goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.name}
              </option>
            ))}
            {/* An archived goal is not offered for a new contribution, but an
                edited transfer keeps the one it already has. */}
            {goalId !== "" && !goals.some((goal) => goal.id === goalId) && (
              <option value={goalId}>Archived goal</option>
            )}
          </select>
          {errors.goalId && <FieldError message={errors.goalId} />}
        </label>
      ) : values?.goalId ? (
        <input type="hidden" name="goalId" value={values.goalId} />
      ) : null}

      <label className="grid gap-1">
        <span className="text-muted">Amount (CLP)</span>
        <input
          name="amount"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required
          placeholder="150.000"
          defaultValue={values?.amount ?? ""}
          className={inputClass}
        />
        {errors.amount && <FieldError message={errors.amount} />}
      </label>

      <label className="grid gap-1">
        <span className="text-muted">Date</span>
        <input
          name="madeOn"
          type="date"
          required
          defaultValue={values?.madeOn || today}
          className={inputClass}
        />
        {errors.madeOn && <FieldError message={errors.madeOn} />}
      </label>

      <label className="grid gap-1">
        <span className="text-muted">Kind</span>
        <select
          key={`kind-${kind}`}
          name="kind"
          required
          defaultValue={kind}
          className={inputClass}
        >
          <option value="" disabled>
            Choose a kind
          </option>
          {TRANSFER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {transferKindLabel(kind)}
            </option>
          ))}
        </select>
        {errors.kind && <FieldError message={errors.kind} />}
      </label>

      {state.status === "error" && state.message && (
        <p role="alert" className="text-expense">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" className="text-income">
          Transfer saved
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent px-5 py-2 text-page transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving..." : transfer ? "Save changes" : "Add transfer"}
      </button>
    </form>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <span role="alert" className="text-sm text-expense">
      {message}
    </span>
  );
}
