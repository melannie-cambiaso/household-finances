"use client";

import { useActionState, useEffect } from "react";

import { TRANSFER_KINDS, transferKindLabel } from "@/lib/transfers";

import {
  createTransferAction,
  updateTransferAction,
  type TransferFormState,
  type TransferFormValues,
} from "./actions";

type AccountOption = { id: string; name: string };

const initialState: TransferFormState = { status: "idle" };

const inputClass =
  "w-full rounded-xl border border-line bg-page px-3 py-2 text-text";

export function TransferForm({
  accounts,
  today,
  transfer,
  onSuccess,
}: {
  accounts: AccountOption[];
  today: string;
  // Present when editing: the transfer id and the values to pre-fill.
  transfer?: { id: string; values: TransferFormValues };
  // Called after a transfer is saved, e.g. to close the dialog around the form.
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    transfer ? updateTransferAction : createTransferAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") onSuccess?.();
  }, [state, onSuccess]);
  // After a failed save the form shows what was typed, not the stored values.
  const values =
    state.status === "error" ? state.values : (transfer?.values ?? null);
  const errors = state.status === "error" ? state.errors : {};

  const accountSelect = (
    name: "fromAccountId" | "toAccountId",
    label: string,
    placeholder: string,
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
        {accounts.map((account) => (
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

      {accountSelect("fromAccountId", "From", "Choose the source account")}
      {accountSelect("toAccountId", "To", "Choose the destination account")}

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
          key={`kind-${values?.kind ?? ""}`}
          name="kind"
          required
          defaultValue={values?.kind ?? ""}
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
