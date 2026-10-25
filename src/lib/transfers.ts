// Pure helpers for transfers. No database or framework imports, so they can be
// unit tested with Node's built-in runner.

import { UUID_PATTERN } from "../shared/ids.ts";
import { parseAmount } from "../shared/money.ts";
import { isValidDate } from "../shared/dates.ts";

export const TRANSFER_KINDS = ["repayment", "funding", "other"] as const;
export type TransferKind = (typeof TRANSFER_KINDS)[number];

const KIND_LABELS: Record<TransferKind, string> = {
  repayment: "Repayment to savings",
  funding: "Funding",
  other: "Other",
};

export function transferKindLabel(kind: TransferKind): string {
  return KIND_LABELS[kind];
}

function isTransferKind(value: string): value is TransferKind {
  return (TRANSFER_KINDS as readonly string[]).includes(value);
}

export type TransferInput = {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  madeOn: string;
  kind: TransferKind;
};

export type TransferField = keyof TransferInput;

export type TransferValidation =
  | { ok: true; value: TransferInput }
  | { ok: false; errors: Partial<Record<TransferField, string>> };

/** Validates raw form strings and returns a normalized transfer input. */
export function validateTransferInput(
  raw: Record<TransferField, string>,
): TransferValidation {
  const errors: Partial<Record<TransferField, string>> = {};

  const fromAccountId = raw.fromAccountId.trim();
  if (!UUID_PATTERN.test(fromAccountId)) {
    errors.fromAccountId = "Choose the account the money leaves";
  }

  const toAccountId = raw.toAccountId.trim();
  if (!UUID_PATTERN.test(toAccountId)) {
    errors.toAccountId = "Choose the account the money goes to";
  } else if (toAccountId === fromAccountId) {
    errors.toAccountId = "Choose a different account than the source";
  }

  const amount = parseAmount(raw.amount);
  if (amount === null) {
    errors.amount = "Enter a whole amount greater than zero";
  }

  const madeOn = raw.madeOn.trim();
  if (!isValidDate(madeOn)) errors.madeOn = "Enter a valid date";

  const kind = raw.kind.trim();
  if (!isTransferKind(kind)) errors.kind = "Choose a kind";

  if (Object.keys(errors).length > 0 || amount === null || !isTransferKind(kind)) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: { fromAccountId, toAccountId, amount, madeOn, kind },
  };
}

export type DebtStanding =
  | { kind: "debt"; amount: number }
  | { kind: "credit"; amount: number }
  | { kind: "even" };

/**
 * What to show for the savings debt. It is negative when more was repaid into
 * savings than was spent from them: that is a credit, shown as a positive amount.
 */
export function debtStanding(debt: number): DebtStanding {
  if (debt > 0) return { kind: "debt", amount: debt };
  if (debt < 0) return { kind: "credit", amount: -debt };
  return { kind: "even" };
}
