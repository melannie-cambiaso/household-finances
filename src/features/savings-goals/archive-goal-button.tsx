"use client";

import { archiveGoalAction } from "./actions";

// Archiving keeps every contribution: the goal stops counting as active and can
// no longer receive new ones.
export function ArchiveGoalButton({
  goalId,
  className,
}: {
  goalId: string;
  className: string;
}) {
  return (
    <form
      action={archiveGoalAction}
      onSubmit={(event) => {
        // The server action runs only after the browser confirmation.
        const sure = window.confirm(
          "Archive this goal? It keeps its contributions, stops counting as active and cannot receive new ones.",
        );
        if (!sure) event.preventDefault();
      }}
    >
      <input type="hidden" name="goalId" value={goalId} />
      <button type="submit" className={className}>
        Archive
      </button>
    </form>
  );
}
