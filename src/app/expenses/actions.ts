"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { createExpense } from "@/lib/expense-service";
import {
  validateExpenseInput,
  type ExpenseField,
} from "@/lib/expenses";
import { getAllowedSession } from "@/lib/session";

export type ExpenseFormValues = Record<ExpenseField, string>;

export type ExpenseFormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      message?: string;
      errors: Partial<Record<ExpenseField, string>>;
      // Echoed back so the form keeps what the user typed.
      values: ExpenseFormValues;
    };

const FIELDS: ExpenseField[] = [
  "itemId",
  "accountId",
  "amount",
  "spentOn",
  "budgetMonth",
  "description",
];

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// Server Actions can be called with a direct POST, so this re-checks the
// session. The household and the author come from the session, never the form.
export async function createExpenseAction(
  _previous: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const session = await getAllowedSession();
  if (!session) redirect("/login");

  const householdId = session.user.householdId;
  if (!householdId) {
    return {
      status: "error",
      message: "Your account is not linked to a household",
      errors: {},
      values: emptyValues(),
    };
  }

  const values = Object.fromEntries(
    FIELDS.map((field) => [field, readText(formData, field)]),
  ) as ExpenseFormValues;

  const validation = validateExpenseInput(values);
  if (!validation.ok) {
    return { status: "error", errors: validation.errors, values };
  }

  const result = await createExpense(
    db,
    { householdId, userId: session.user.id },
    validation.value,
  );
  if (!result.ok) {
    // Same message for a missing item and a missing account: do not reveal
    // whether an id exists in another household.
    return {
      status: "error",
      message: "That item or account is not available",
      errors: {},
      values,
    };
  }

  revalidatePath("/expenses");
  return { status: "success" };
}

function emptyValues(): ExpenseFormValues {
  return {
    itemId: "",
    accountId: "",
    amount: "",
    spentOn: "",
    budgetMonth: "",
    description: "",
  };
}
