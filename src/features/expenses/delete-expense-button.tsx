"use client";

import { deleteExpenseAction } from "./actions";

export function DeleteExpenseButton({
  expenseId,
  className,
}: {
  expenseId: string;
  className: string;
}) {
  return (
    <form
      action={deleteExpenseAction}
      onSubmit={(event) => {
        // The server action runs only after the browser confirmation.
        const sure = window.confirm(
          "Delete this expense? Reimbursements linked to it stay as incomes.",
        );
        if (!sure) event.preventDefault();
      }}
    >
      <input type="hidden" name="expenseId" value={expenseId} />
      <button type="submit" className={className}>
        Delete
      </button>
    </form>
  );
}
