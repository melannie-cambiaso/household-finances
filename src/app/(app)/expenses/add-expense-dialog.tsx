"use client";

import { useCallback, useRef, useState } from "react";

import { ExpenseForm } from "./expense-form";

type Props = React.ComponentProps<typeof ExpenseForm>;

export function AddExpenseDialog({ items, accounts, today }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // True only when the press that started a click was on the backdrop. Without
  // it, dragging a text selection out of the modal and releasing over the
  // backdrop counts as a backdrop click and closes the modal.
  const pressStartedOnBackdrop = useRef(false);
  // A new key remounts the form on every open, so it never shows a stale
  // "Expense saved" message or old errors.
  const [formKey, setFormKey] = useState(0);

  const close = useCallback(() => dialogRef.current?.close(), []);

  return (
    <>
      <button
        type="button"
        className="rounded-full bg-accent px-5 py-2 text-page transition-opacity hover:opacity-90"
        onClick={() => {
          setFormKey((key) => key + 1);
          dialogRef.current?.showModal();
        }}
      >
        + Add expense
      </button>

      {/* The native dialog gives focus trapping, Esc to close and a backdrop.
          Padding lives on the inner div so a click on the backdrop is the only
          click whose target is the dialog itself. */}
      <dialog
        ref={dialogRef}
        aria-labelledby="add-expense-title"
        className="m-auto max-h-[90vh] w-[min(32rem,92vw)] overflow-y-auto rounded-card border border-line bg-surface p-0 text-text backdrop:bg-black/60"
        onMouseDown={(event) => {
          pressStartedOnBackdrop.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          if (pressStartedOnBackdrop.current && event.target === event.currentTarget) {
            close();
          }
        }}
      >
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="add-expense-title" className="text-xl">
              Add an expense
            </h2>
            <button
              type="button"
              aria-label="Close"
              className="rounded-full border border-line px-3 py-1 text-muted transition-colors hover:bg-page hover:text-text"
              onClick={close}
            >
              ✕
            </button>
          </div>
          <ExpenseForm
            key={formKey}
            items={items}
            accounts={accounts}
            today={today}
            onSuccess={close}
          />
        </div>
      </dialog>
    </>
  );
}
