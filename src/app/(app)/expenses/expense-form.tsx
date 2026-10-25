"use client";

import { useActionState, useEffect } from "react";

import {
  createExpenseAction,
  updateExpenseAction,
  type ExpenseFormState,
  type ExpenseFormValues,
} from "./actions";
import { useModalClose } from "@/shared/ui/modal";

type ItemOption = {
  id: string;
  name: string;
  categoryName: string;
  reimbursementPct: number | null;
};

type AccountOption = { id: string; name: string };

const initialState: ExpenseFormState = { status: "idle" };

const inputClass =
  "w-full rounded-xl border border-line bg-page px-3 py-2 text-text";

function groupByCategory(items: ItemOption[]) {
  const groups = new Map<string, ItemOption[]>();
  for (const item of items) {
    const group = groups.get(item.categoryName) ?? [];
    group.push(item);
    groups.set(item.categoryName, group);
  }
  return [...groups.entries()];
}

export function ExpenseForm({
  items,
  accounts,
  today,
  expense,
}: {
  items: ItemOption[];
  accounts: AccountOption[];
  today: string;
  // Present when editing: the expense id and the values to pre-fill.
  expense?: { id: string; values: ExpenseFormValues };
}) {
  const [state, formAction, pending] = useActionState(
    expense ? updateExpenseAction : createExpenseAction,
    initialState,
  );

  const close = useModalClose();

  useEffect(() => {
    if (state.status === "success") close();
  }, [state, close]);
  // After a failed save the form shows what was typed, not the stored values.
  const values =
    state.status === "error" ? state.values : (expense?.values ?? null);
  const errors = state.status === "error" ? state.errors : {};

  return (
    <form action={formAction} className="grid w-full gap-4">
      {expense && <input type="hidden" name="expenseId" value={expense.id} />}
      <label className="grid gap-1">
        <span className="text-muted">Item</span>
        {/* React does not apply a changed defaultValue to a mounted <select>,
            so the key remounts it with the choice the user had made. */}
        <select
          key={`item-${values?.itemId ?? ""}`}
          name="itemId"
          required
          defaultValue={values?.itemId ?? ""}
          className={inputClass}
        >
          <option value="" disabled>
            Choose an item
          </option>
          {groupByCategory(items).map(([category, group]) => (
            <optgroup key={category} label={category}>
              {group.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.reimbursementPct !== null
                    ? ` (${item.reimbursementPct}% reimbursable)`
                    : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {errors.itemId && <FieldError message={errors.itemId} />}
      </label>

      <label className="grid gap-1">
        <span className="text-muted">Paid from</span>
        <select
          key={`account-${values?.accountId ?? ""}`}
          name="accountId"
          required
          defaultValue={values?.accountId ?? ""}
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
          placeholder="12.500"
          defaultValue={values?.amount ?? ""}
          className={inputClass}
        />
        {errors.amount && <FieldError message={errors.amount} />}
      </label>

      <label className="grid gap-1">
        <span className="text-muted">Paid on</span>
        <input
          name="spentOn"
          type="date"
          required
          defaultValue={values?.spentOn || today}
          className={inputClass}
        />
        {errors.spentOn && <FieldError message={errors.spentOn} />}
      </label>

      <label className="grid gap-1">
        <span className="text-muted">
          Counts toward (optional, defaults to the month paid)
        </span>
        <input
          name="budgetMonth"
          type="month"
          defaultValue={values?.budgetMonth ?? ""}
          className={inputClass}
        />
        {errors.budgetMonth && <FieldError message={errors.budgetMonth} />}
      </label>

      <label className="grid gap-1">
        <span className="text-muted">Description (optional)</span>
        <input
          name="description"
          type="text"
          maxLength={200}
          defaultValue={values?.description ?? ""}
          className={inputClass}
        />
        {errors.description && <FieldError message={errors.description} />}
      </label>

      {state.status === "error" && state.message && (
        <p role="alert" className="text-expense">
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <p role="status" className="text-income">
          Expense saved
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent px-5 py-2 text-page transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving..." : expense ? "Save changes" : "Add expense"}
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
