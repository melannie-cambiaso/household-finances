"use client";

import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
} from "react";

const noop = () => {};
const ModalCloseContext = createContext<() => void>(noop);

/** Lets a form inside a Modal close it after saving. Outside a Modal it does nothing. */
export function useModalClose(): () => void {
  return useContext(ModalCloseContext);
}

// A button that opens a native <dialog>. The content is passed as children, so
// it can be rendered on the server; forms inside call `useModalClose()`.
export function Modal({
  triggerLabel,
  triggerClassName,
  title,
  children,
}: {
  triggerLabel: string;
  triggerClassName: string;
  title: string;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // True only when the press that started a click was on the backdrop. Without
  // it, dragging a text selection out of the modal and releasing over the
  // backdrop counts as a backdrop click and closes the modal.
  const pressStartedOnBackdrop = useRef(false);
  // A new key remounts the content on every open, so a form never shows a stale
  // "saved" message or old errors.
  const [openCount, setOpenCount] = useState(0);

  const close = useCallback(() => dialogRef.current?.close(), []);

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => {
          setOpenCount((count) => count + 1);
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
          <ModalCloseContext.Provider value={close}>
            <div key={openCount}>{children}</div>
          </ModalCloseContext.Provider>
        </div>
      </dialog>
    </>
  );
}
