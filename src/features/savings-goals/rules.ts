import { isValidDate } from "../../shared/dates.ts";

// Same convention as the catalog: names are trimmed and at most 60 characters.
export const NAME_MAX_LENGTH = 60;

export type GoalInput = {
  name: string;
  targetAmount: number;
  targetDate: string | null;
};

/** A goal worth saving toward: a name, a target amount and an optional date. */
export type GoalValidationError =
  | "Enter a name"
  | `Use at most ${typeof NAME_MAX_LENGTH} characters`
  | "Enter an amount greater than zero"
  | "Enter a valid date";

/** Trims and checks a goal's fields before anything touches the database. */
export function validateGoalInput(raw: {
  name: string;
  targetAmount: number;
  targetDate: string | null;
}): { ok: true; value: GoalInput } | { ok: false; error: GoalValidationError } {
  const name = raw.name.trim();
  if (name === "") return { ok: false, error: "Enter a name" };
  if (name.length > NAME_MAX_LENGTH) {
    return { ok: false, error: `Use at most ${NAME_MAX_LENGTH} characters` };
  }
  if (!Number.isInteger(raw.targetAmount) || raw.targetAmount <= 0) {
    return { ok: false, error: "Enter an amount greater than zero" };
  }
  if (raw.targetDate !== null && !isValidDate(raw.targetDate)) {
    return { ok: false, error: "Enter a valid date" };
  }
  return {
    ok: true,
    value: { name, targetAmount: raw.targetAmount, targetDate: raw.targetDate },
  };
}

export type GoalProgress = {
  /** Whole CLP contributed so far, from transfers linked to the goal. */
  contributed: number;
  /** What is still missing; never below zero. */
  remaining: number;
  /** How much the contributions passed the target by; zero unless achieved. */
  overshoot: number;
  /** 0 to 100, capped once the goal is achieved. */
  pct: number;
  /** True when contributions reached the target. Derived, never stored. */
  achieved: boolean;
};

/** Progress toward a goal, derived from its target and what was contributed. */
export function goalProgress(targetAmount: number, contributed: number): GoalProgress {
  const achieved = contributed >= targetAmount;
  return {
    contributed,
    remaining: achieved ? 0 : targetAmount - contributed,
    overshoot: achieved ? contributed - targetAmount : 0,
    pct: Math.min(100, Math.floor((contributed / targetAmount) * 100)),
    achieved,
  };
}

/**
 * What to put aside per month to close `remaining` by the end of the target
 * month, counting it. Null when the date has already passed.
 */
export function perMonthNeeded(
  today: string,
  targetDate: string,
  remaining: number,
): number | null {
  if (remaining <= 0) return 0;
  const targetMonth = targetDate.slice(0, 7);
  const thisMonth = today.slice(0, 7);
  if (targetMonth < thisMonth) return null;

  const [ty, tm] = targetMonth.split("-").map(Number);
  const [yy, ym] = thisMonth.split("-").map(Number);
  const monthsLeft = (ty - yy) * 12 + (tm - ym) + 1;
  return Math.ceil(remaining / monthsLeft);
}
