"use client";

import { useActionState, useEffect, useState } from "react";

import {
  createIncomeAction,
  updateIncomeAction,
  type IncomeFormState,
  type IncomeFormValues,
} from "./actions";
import { useModalClose } from "@/shared/ui/modal";

type SourceOption = {
  id: string;
  name: string;
  kind: "fixed" | "per_friday" | "reimbursement";
  defaultAccountId: string;
};

type AccountOption = { id: string; name: string };

type PendingOption = { id: string; label: string };

const initialState: IncomeFormState = { status: "idle" };

const inputClass =
  "w-full rounded-xl border border-line bg-page px-3 py-2 text-text";

export function IncomeForm({
  sources,
  accounts,
  pending,
  today,
  income,
}: {
  sources: SourceOption[];
  accounts: AccountOption[];
  pending: PendingOption[];
  today: string;
  // Present when editing: the income id and the values to pre-fill.
  income?: { id: string; values: IncomeFormValues };
}) {
  const [state, formAction, isSaving] = useActionState(
    income ? updateIncomeAction : createIncomeAction,
    initialState,
  );

  const close = useModalClose();

  useEffect(() => {
    if (state.status === "success") close();
  }, [state, close]);
  // After a failed save the form shows what was typed, not the stored values.
  const values =
    state.status === "error" ? state.values : (income?.values ?? null);
  const errors = state.status === "error" ? state.errors : {};

  // Controlled, because choosing a source picks its usual account and decides
  // whether the related-expense field is shown. Controlled values also survive
  // the form reset that React runs after an action.
  const [sourceId, setSourceId] = useState(income?.values.incomeSourceId ?? "");
  const [accountId, setAccountId] = useState(income?.values.accountId ?? "");
  const [relatedId, setRelatedId] = useState(
    income?.values.relatedExpenseId ?? "",
  );
  const source = sources.find((s) => s.id === sourceId);
  const isReimbursement = source?.kind === "reimbursement";

  return (
    <form action={formAction} className="grid w-full gap-4">
      {income && <input type="hidden" name="incomeId" value={income.id} />}
      <label className="grid gap-1">
        <span className="text-muted">Source</span>
        <select
          name="incomeSourceId"
          required
          value={sourceId}
          onChange={(event) => {
            const next = sources.find((s) => s.id === event.target.value);
            setSourceId(event.target.value);
            if (next) setAccountId(next.defaultAccountId);
            if (next?.kind !== "reimbursement") setRelatedId("");
          }}
          className={inputClass}
        >
          <option value="" disabled>
            Choose a source
          </option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {errors.incomeSourceId && (
          <FieldError message={errors.incomeSourceId} />
        )}
      </label>

      <label className="grid gap-1">
        <span className="text-muted">Received in</span>
        <select
          name="accountId"
          required
          value={accountId}
          onChange={(event) => setAccountId(event.target.value)}
          className={inputClass}
        >
          <option value="" disabled>
            Choose an account
          </option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>
        {errors.accountId && <FieldError message={errors.accountId} />}
      </label>

      <label className="grid gap-1">
        <span className="text-muted">Amount (CLP)</span>
        <input
          name="amount"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          required
          placeholder="1.500.000"
          defaultValue={values?.amount ?? ""}
          className={inputClass}
        />
        {errors.amount && <FieldError message={errors.amount} />}
      </label>

      <label className="grid gap-1">
        <span className="text-muted">Received on</span>
        <input
          name="receivedOn"
          type="date"
          required
          defaultValue={values?.receivedOn || today}
          className={inputClass}
        />
        {errors.receivedOn && <FieldError message={errors.receivedOn} />}
      </label>

      <label className="grid gap-1">
        <span className="text-muted">
          Counts toward (optional, defaults to the month received)
        </span>
        <input
          name="budgetMonth"
          type="month"
          defaultValue={values?.budgetMonth ?? ""}
          className={inputClass}
        />
        {errors.budgetMonth && <FieldError message={errors.budgetMonth} />}
      </label>

      {isReimbursement && (
        <label className="grid gap-1">
          <span className="text-muted">Covers expense (optional)</span>
          <select
            name="relatedExpenseId"
            value={relatedId}
            onChange={(event) => setRelatedId(event.target.value)}
            className={inputClass}
          >
            <option value="">Not linked to an expense</option>
            {pending.map((expense) => (
              <option key={expense.id} value={expense.id}>
                {expense.label}
              </option>
            ))}
          </select>
          {errors.relatedExpenseId && (
            <FieldError message={errors.relatedExpenseId} />
          )}
        </label>
      )}

      {state.status === "error" && state.message && (
        <p role="alert" className="text-expense">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" className="text-income">
          Income saved
        </p>
      )}

      <button
        type="submit"
        disabled={isSaving}
        className="rounded-full bg-accent px-5 py-2 text-page transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isSaving ? "Saving..." : income ? "Save changes" : "Add income"}
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
