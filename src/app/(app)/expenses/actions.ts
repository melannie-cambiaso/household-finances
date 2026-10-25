"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  createExpense,
  deleteExpense,
  updateExpense,
  type CreateExpenseResult,
  type UpdateExpenseResult,
} from "@/lib/expense-service";
import { UUID_PATTERN } from "@/shared/ids";
import { validateExpenseInput, type ExpenseField } from "@/lib/expenses";
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

  let result: CreateExpenseResult;
  try {
    result = await createExpense(
      db,
      { householdId, userId: session.user.id },
      validation.value,
    );
  } catch (error) {
    // A database failure should show a message in the form, not an error page,
    // and keep what the user typed.
    console.error("Failed to save an expense", error);
    return {
      status: "error",
      message: "Could not save the expense. Try again.",
      errors: {},
      values,
    };
  }
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

const UPDATE_MESSAGES: Record<
  Extract<UpdateExpenseResult, { ok: false }>["error"],
  string
> = {
  expense_not_found: "That expense no longer exists",
  // Same message for a missing item and a missing account: do not reveal
  // whether an id exists in another household.
  item_not_found: "That item or account is not available",
  account_not_found: "That item or account is not available",
  has_linked_incomes:
    "This expense has reimbursements linked to it, so it must keep an item with a reimbursement percentage. Unlink those incomes first.",
};

// Same checks as creating: the session is re-verified and the household comes
// from it. The expense id comes from the form, so the service only touches it
// when it belongs to the household.
export async function updateExpenseAction(
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

  const id = readText(formData, "expenseId");
  if (!UUID_PATTERN.test(id)) {
    return {
      status: "error",
      message: UPDATE_MESSAGES.expense_not_found,
      errors: {},
      values,
    };
  }

  const validation = validateExpenseInput(values);
  if (!validation.ok) {
    return { status: "error", errors: validation.errors, values };
  }

  let result: UpdateExpenseResult;
  try {
    result = await updateExpense(
      db,
      { householdId, userId: session.user.id },
      id,
      validation.value,
    );
  } catch (error) {
    console.error("Failed to update an expense", error);
    return {
      status: "error",
      message: "Could not save the changes. Try again.",
      errors: {},
      values,
    };
  }
  if (!result.ok) {
    return {
      status: "error",
      message: UPDATE_MESSAGES[result.error],
      errors: {},
      values,
    };
  }

  // The pending-reimbursement view and the budget progress read expenses too.
  revalidatePath("/expenses");
  revalidatePath("/incomes");
  revalidatePath("/budget");
  return { status: "success" };
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const session = await getAllowedSession();
  if (!session) redirect("/login");
  const householdId = session.user.householdId;
  if (!householdId) return;

  const id = readText(formData, "expenseId");
  if (!UUID_PATTERN.test(id)) return;

  try {
    await deleteExpense(db, householdId, id);
  } catch (error) {
    console.error("Failed to delete an expense", error);
  }
  revalidatePath("/expenses");
  revalidatePath("/incomes");
  revalidatePath("/budget");
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
