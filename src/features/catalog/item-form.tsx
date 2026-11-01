"use client";

import { useActionState, useEffect } from "react";

import {
  createItemAction,
  updateItemAction,
  type ItemFormState,
  type ItemFormValues,
} from "./actions";
import { useModalClose } from "@/shared/ui/modal";

type CategoryOption = { id: string; name: string };

const initialState: ItemFormState = { status: "idle" };

const inputClass =
  "w-full rounded-xl border border-line bg-page px-3 py-2 text-text";

// Adds an item to `defaultCategoryId`, or edits one when `item` is given.
export function ItemForm({
  categories,
  defaultCategoryId,
  item,
}: {
  categories: CategoryOption[];
  defaultCategoryId: string;
  // Present when editing: the item id and the values to pre-fill.
  item?: { id: string; values: ItemFormValues };
}) {
  const [state, formAction, pending] = useActionState(
    item ? updateItemAction : createItemAction,
    initialState,
  );
  const close = useModalClose();

  useEffect(() => {
    if (state.status === "success") close();
  }, [state, close]);

  // After a failed save the form shows what was typed, not the stored values.
  const values =
    state.status === "error"
      ? state.values
      : (item?.values ?? {
          name: "",
          categoryId: defaultCategoryId,
          reimbursementPct: "",
        });
  const errors = state.status === "error" ? state.errors : {};
  const fieldKey = state.status === "error" ? "typed" : "stored";

  return (
    <form action={formAction} className="grid gap-4">
      {item && <input type="hidden" name="itemId" value={item.id} />}

      <label className="grid gap-1">
        <span className="text-muted">Name</span>
        <input
          key={`name-${fieldKey}`}
          name="name"
          type="text"
          required
          maxLength={60}
          autoComplete="off"
          defaultValue={values.name}
          className={inputClass}
        />
        {errors.name && <FieldError message={errors.name} />}
      </label>

      <label className="grid gap-1">
        <span className="text-muted">Category</span>
        {/* React does not apply a changed defaultValue to a mounted <select>,
            so the key remounts it with the choice the user had made. */}
        <select
          key={`category-${values.categoryId}`}
          name="categoryId"
          required
          defaultValue={values.categoryId}
          className={inputClass}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {errors.categoryId && <FieldError message={errors.categoryId} />}
        {item && (
          <span className="text-sm text-muted">
            Moving an item regroups its past months under the new category in
            the totals.
          </span>
        )}
      </label>

      <label className="grid gap-1">
        <span className="text-muted">
          Reimbursement percentage (blank = not reimbursable)
        </span>
        <input
          key={`pct-${fieldKey}`}
          name="reimbursementPct"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="e.g. 70"
          defaultValue={values.reimbursementPct}
          className={inputClass}
        />
        {errors.reimbursementPct && (
          <FieldError message={errors.reimbursementPct} />
        )}
        {item && (
          <span className="text-sm text-muted">
            Expenses already recorded keep the percentage they were created
            with; only new ones use this one.
          </span>
        )}
      </label>

      {state.status === "error" && state.message && (
        <p role="alert" className="text-expense">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="justify-self-start rounded-full bg-accent px-5 py-2 text-page transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving..." : item ? "Save changes" : "Add item"}
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
