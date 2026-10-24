"use client";

import { useActionState } from "react";

import type { DeleteState } from "./actions";

// A delete that can be refused: the reason is shown under the button, because
// an item or category with history is never deleted and the user must know why.
export function DeleteButton({
  action,
  fieldName,
  id,
  confirmText,
  className,
}: {
  action: (previous: DeleteState, formData: FormData) => Promise<DeleteState>;
  // Name of the hidden field that carries the id: "categoryId" or "itemId".
  fieldName: string;
  id: string;
  confirmText: string;
  className: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    status: "idle",
  } as DeleteState);

  return (
    <form
      action={formAction}
      className="grid justify-items-end gap-1"
      onSubmit={(event) => {
        // The server action runs only after the browser confirmation.
        if (!window.confirm(confirmText)) event.preventDefault();
      }}
    >
      <input type="hidden" name={fieldName} value={id} />
      <button type="submit" disabled={pending} className={className}>
        {pending ? "Deleting..." : "Delete"}
      </button>
      {state.status === "error" && (
        <p role="alert" className="max-w-xs text-right text-sm text-expense">
          {state.message}
        </p>
      )}
    </form>
  );
}
