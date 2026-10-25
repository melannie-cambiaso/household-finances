"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { UUID_PATTERN } from "@/shared/ids";
import { todayIn } from "@/shared/dates";
import { validateOpeningBalance, type OpeningBalanceField } from "@/lib/savings";
import {
  setOpeningBalance,
  type SetOpeningBalanceResult,
} from "@/lib/savings-service";
import { getAllowedSession } from "@/lib/session";

const TIME_ZONE = "America/Santiago";

export type OpeningBalanceValues = Record<OpeningBalanceField, string>;

export type OpeningBalanceFormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      message?: string;
      errors: Partial<Record<OpeningBalanceField, string>>;
      // Echoed back so the form keeps what the user typed.
      values: OpeningBalanceValues;
    };

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const MESSAGES: Record<
  Extract<SetOpeningBalanceResult, { ok: false }>["error"],
  string
> = {
  // One message for a missing account and an account of another household: do
  // not reveal whether an id exists elsewhere.
  account_not_found: "That account is not available",
  not_savings_account: "Only a savings account has a savings balance",
};

// Server Actions can be called with a direct POST, so this re-checks the
// session. The household comes from the session, never from the form.
export async function setOpeningBalanceAction(
  _previous: OpeningBalanceFormState,
  formData: FormData,
): Promise<OpeningBalanceFormState> {
  const session = await getAllowedSession();
  if (!session) redirect("/login");

  const values: OpeningBalanceValues = {
    amount: readText(formData, "amount"),
    on: readText(formData, "on"),
  };

  const householdId = session.user.householdId;
  if (!householdId) {
    return {
      status: "error",
      message: "Your account is not linked to a household",
      errors: {},
      values,
    };
  }

  // The account id comes from the form, so the service only touches it when it
  // is a savings account of the household.
  const accountId = readText(formData, "accountId");
  if (!UUID_PATTERN.test(accountId)) {
    return {
      status: "error",
      message: MESSAGES.account_not_found,
      errors: {},
      values,
    };
  }

  const validation = validateOpeningBalance(values, todayIn(TIME_ZONE));
  if (!validation.ok) {
    return { status: "error", errors: validation.errors, values };
  }

  let result: SetOpeningBalanceResult;
  try {
    result = await setOpeningBalance(db, householdId, accountId, validation.value);
  } catch (error) {
    // A database failure should show a message in the form, not an error page,
    // and keep what the user typed.
    console.error("Failed to save an opening balance", error);
    return {
      status: "error",
      message: "Could not save the opening balance. Try again.",
      errors: {},
      values,
    };
  }
  if (!result.ok) {
    return { status: "error", message: MESSAGES[result.error], errors: {}, values };
  }

  revalidatePath("/savings");
  return { status: "success" };
}
