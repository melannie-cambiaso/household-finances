"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { UUID_PATTERN } from "@/lib/expenses";
import {
  createIncome,
  deleteIncome,
  updateIncome,
  type CreateIncomeResult,
  type UpdateIncomeResult,
} from "@/lib/income-service";
import { validateIncomeInput, type IncomeField } from "@/lib/incomes";
import { getAllowedSession } from "@/lib/session";

export type IncomeFormValues = Record<IncomeField, string>;

export type IncomeFormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      message?: string;
      errors: Partial<Record<IncomeField, string>>;
      // Echoed back so the form keeps what the user typed.
      values: IncomeFormValues;
    };

const FIELDS: IncomeField[] = [
  "incomeSourceId",
  "accountId",
  "amount",
  "receivedOn",
  "budgetMonth",
  "relatedExpenseId",
];

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function emptyValues(): IncomeFormValues {
  return {
    incomeSourceId: "",
    accountId: "",
    amount: "",
    receivedOn: "",
    budgetMonth: "",
    relatedExpenseId: "",
  };
}

const ERROR_MESSAGES: Record<
  Extract<CreateIncomeResult, { ok: false }>["error"],
  string
> = {
  // One message for a missing source, account or expense: do not reveal
  // whether an id exists in another household.
  source_not_found: "That source, account or expense is not available",
  account_not_found: "That source, account or expense is not available",
  expense_not_found: "That source, account or expense is not available",
  source_not_reimbursement:
    "Only a reimbursement source can be linked to an expense",
  expense_not_reimbursable: "That expense is not reimbursable",
};

const UPDATE_MESSAGES: Record<
  Extract<UpdateIncomeResult, { ok: false }>["error"],
  string
> = {
  ...ERROR_MESSAGES,
  income_not_found: "That income no longer exists",
};

// Server Actions can be called with a direct POST, so this re-checks the
// session. The household and the author come from the session, never the form.
export async function createIncomeAction(
  _previous: IncomeFormState,
  formData: FormData,
): Promise<IncomeFormState> {
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
  ) as IncomeFormValues;

  const validation = validateIncomeInput(values);
  if (!validation.ok) {
    return { status: "error", errors: validation.errors, values };
  }

  let result: CreateIncomeResult;
  try {
    result = await createIncome(
      db,
      { householdId, userId: session.user.id },
      validation.value,
    );
  } catch (error) {
    // A database failure should show a message in the form, not an error page,
    // and keep what the user typed.
    console.error("Failed to save an income", error);
    return {
      status: "error",
      message: "Could not save the income. Try again.",
      errors: {},
      values,
    };
  }
  if (!result.ok) {
    return {
      status: "error",
      message: ERROR_MESSAGES[result.error],
      errors: {},
      values,
    };
  }

  revalidatePath("/incomes");
  return { status: "success" };
}

// Same checks as creating. The income id comes from the form, so the service
// only touches it when it belongs to the household.
export async function updateIncomeAction(
  _previous: IncomeFormState,
  formData: FormData,
): Promise<IncomeFormState> {
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
  ) as IncomeFormValues;

  const id = readText(formData, "incomeId");
  if (!UUID_PATTERN.test(id)) {
    return {
      status: "error",
      message: UPDATE_MESSAGES.income_not_found,
      errors: {},
      values,
    };
  }

  const validation = validateIncomeInput(values);
  if (!validation.ok) {
    return { status: "error", errors: validation.errors, values };
  }

  let result: UpdateIncomeResult;
  try {
    result = await updateIncome(
      db,
      { householdId, userId: session.user.id },
      id,
      validation.value,
    );
  } catch (error) {
    console.error("Failed to update an income", error);
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

  // Pending reimbursements and the budget progress read incomes too.
  revalidatePath("/incomes");
  revalidatePath("/budget");
  return { status: "success" };
}

export async function deleteIncomeAction(formData: FormData): Promise<void> {
  const session = await getAllowedSession();
  if (!session) redirect("/login");
  const householdId = session.user.householdId;
  if (!householdId) return;

  const id = readText(formData, "incomeId");
  if (!UUID_PATTERN.test(id)) return;

  try {
    await deleteIncome(db, householdId, id);
  } catch (error) {
    console.error("Failed to delete an income", error);
  }
  revalidatePath("/incomes");
  revalidatePath("/budget");
}
