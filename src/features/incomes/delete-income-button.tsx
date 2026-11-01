"use client";

import { deleteIncomeAction } from "./actions";

export function DeleteIncomeButton({
  incomeId,
  className,
}: {
  incomeId: string;
  className: string;
}) {
  return (
    <form
      action={deleteIncomeAction}
      onSubmit={(event) => {
        // The server action runs only after the browser confirmation.
        const sure = window.confirm(
          "Delete this income? If it covered an expense, that expense becomes pending again.",
        );
        if (!sure) event.preventDefault();
      }}
    >
      <input type="hidden" name="incomeId" value={incomeId} />
      <button type="submit" className={className}>
        Delete
      </button>
    </form>
  );
}
