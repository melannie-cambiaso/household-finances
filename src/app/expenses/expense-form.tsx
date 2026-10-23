"use client";

import { useActionState } from "react";

import { createExpenseAction, type ExpenseFormState } from "./actions";

type ItemOption = {
  id: string;
  name: string;
  categoryName: string;
  reimbursementPct: number | null;
};

type AccountOption = { id: string; name: string };

const initialState: ExpenseFormState = { status: "idle" };

const inputClass = "w-full rounded-md border bg-transparent px-3 py-2";

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
}: {
  items: ItemOption[];
  accounts: AccountOption[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(
    createExpenseAction,
    initialState,
  );
  const values = state.status === "error" ? state.values : null;
  const errors = state.status === "error" ? state.errors : {};

  return (
    <form action={formAction} className="grid w-full max-w-xl gap-4">
      <label className="grid gap-1">
        <span>Item</span>
        <select
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
        <span>Paid from</span>
        <select
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
        <span>Amount (CLP)</span>
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
        <span>Paid on</span>
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
        <span>Counts toward (optional, defaults to the month paid)</span>
        <input
          name="budgetMonth"
          type="month"
          defaultValue={values?.budgetMonth ?? ""}
          className={inputClass}
        />
        {errors.budgetMonth && <FieldError message={errors.budgetMonth} />}
      </label>

      <label className="grid gap-1">
        <span>Description (optional)</span>
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
        <p role="alert" className="text-red-500">
          {state.message}
        </p>
      )}
      {state.status === "success" && <p role="status">Expense saved</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? "Saving..." : "Add expense"}
      </button>
    </form>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <span role="alert" className="text-sm text-red-500">
      {message}
    </span>
  );
}
