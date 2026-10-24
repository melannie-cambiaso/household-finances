"use client";

import { useActionState, useEffect } from "react";

import {
  createCategoryAction,
  renameCategoryAction,
  type CategoryFormState,
} from "./actions";
import { useModalClose } from "./modal";

const initialState: CategoryFormState = { status: "idle" };

const inputClass =
  "w-full rounded-xl border border-line bg-page px-3 py-2 text-text";

// Adds a category, or renames one when `category` is given.
export function CategoryForm({
  category,
}: {
  category?: { id: string; name: string };
}) {
  const [state, formAction, pending] = useActionState(
    category ? renameCategoryAction : createCategoryAction,
    initialState,
  );
  const close = useModalClose();

  useEffect(() => {
    if (state.status === "success") close();
  }, [state, close]);

  // After a failed save the field shows what was typed, not the stored name.
  const typed = state.status === "error" ? state.name : null;

  return (
    <form action={formAction} className="grid gap-3">
      {category && <input type="hidden" name="categoryId" value={category.id} />}
      <label className="grid gap-1">
        <span className="text-muted">
          {category ? "New name" : "Name of the new category"}
        </span>
        <input
          // Remount so a failed save shows what was typed.
          key={typed === null ? "stored" : "typed"}
          name="name"
          type="text"
          required
          maxLength={60}
          autoComplete="off"
          defaultValue={typed ?? category?.name ?? ""}
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
        {pending ? "Saving..." : category ? "Rename" : "Add category"}
      </button>
    </form>
  );
}
