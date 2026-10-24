"use client";

import { useCallback, useId, useRef, useState } from "react";

import { TransferForm } from "./transfer-form";

type FormProps = React.ComponentProps<typeof TransferForm>;

type Props = Omit<FormProps, "onSuccess"> & {
  // Text and look of the button that opens the modal.
  triggerLabel: string;
  triggerClassName: string;
  title: string;
};

// One modal for adding and for editing: passing `transfer` turns it into an
// edit, pre-filled with that transfer.
export function TransferDialog({
  triggerLabel,
  triggerClassName,
  title,
  ...formProps
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Several dialogs live on the same page (one per row), so ids must be unique.
  const titleId = useId();
  // True only when the press that started a click was on the backdrop. Without
  // it, dragging a text selection out of the modal and releasing over the
  // backdrop counts as a backdrop click and closes the modal.
  const pressStartedOnBackdrop = useRef(false);
  // A new key remounts the form on every open, so it never shows a stale
  // "Transfer saved" message or old errors.
  const [formKey, setFormKey] = useState(0);

  const close = useCallback(() => dialogRef.current?.close(), []);

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => {
          setFormKey((key) => key + 1);
          dialogRef.current?.showModal();
        }}
      >
        {triggerLabel}
      </button>

      {/* The native dialog gives focus trapping, Esc to close and a backdrop.
          Padding lives on the inner div so a click on the backdrop is the only
          click whose target is the dialog itself. */}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
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
            <h2 id={titleId} className="text-xl">
              {title}
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
          <TransferForm key={formKey} {...formProps} onSuccess={close} />
        </div>
      </dialog>
    </>
  );
}
