"use client";

import { deleteTransferAction } from "./actions";

export function DeleteTransferButton({
  transferId,
  className,
}: {
  transferId: string;
  className: string;
}) {
  return (
    <form
      action={deleteTransferAction}
      onSubmit={(event) => {
        // The server action runs only after the browser confirmation.
        const sure = window.confirm(
          "Delete this transfer? If it was a repayment, the savings debt goes back up.",
        );
        if (!sure) event.preventDefault();
      }}
    >
      <input type="hidden" name="transferId" value={transferId} />
      <button type="submit" className={className}>
        Delete
      </button>
    </form>
  );
}
