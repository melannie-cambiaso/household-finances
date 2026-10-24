"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { parseBudgetForm } from "@/lib/budget";
import {
  confirmBudgetMonth,
  createBudgetMonth,
  saveBudgetLines,
  type SaveBudgetLinesResult,
} from "@/lib/budget-service";
import { isValidDate } from "@/lib/expenses";
import { getAllowedSession } from "@/lib/session";

export type BudgetFormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      message?: string;
      // Keyed by the field name (`item:<id>` / `source:<id>`).
      errors: Record<string, string>;
      // Echoed back so the form keeps what the user typed.
      values: Record<string, string>;
    };

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readMonth(formData: FormData): string | null {
  const month = readText(formData, "month");
  return isValidDate(month) && month.endsWith("-01") ? month : null;
}

async function requireHousehold(): Promise<string> {
  const session = await getAllowedSession();
  if (!session) redirect("/login");
  const householdId = session.user.householdId;
  if (!householdId) redirect("/");
  return householdId;
}

// Server Actions can be called with a direct POST, so each one re-checks the
// session. The household comes from the session, never from the form.
export async function createBudgetAction(formData: FormData): Promise<void> {
  const householdId = await requireHousehold();
  const month = readMonth(formData);
  if (!month) return;

  try {
    await createBudgetMonth(db, householdId, month);
  } catch (error) {
    console.error("Failed to create a budget month", error);
  }
  revalidatePath("/budget");
}

export async function confirmBudgetAction(formData: FormData): Promise<void> {
  const householdId = await requireHousehold();
  const month = readMonth(formData);
  // The checkbox is also required in the browser; this is the server's check.
  if (!month || readText(formData, "understood") !== "on") return;

  try {
    await confirmBudgetMonth(db, householdId, month);
  } catch (error) {
    console.error("Failed to confirm a budget month", error);
  }
  revalidatePath("/budget");
}

const SAVE_MESSAGES: Record<
  Extract<SaveBudgetLinesResult, { ok: false }>["error"],
  string
> = {
  month_not_found: "There is no budget for this month yet",
  month_locked: "This budget is confirmed and can no longer be changed",
  // One message for an item or source that is missing or belongs to another
  // household: do not reveal whether an id exists elsewhere.
  target_not_found: "One of the lines is not available",
  duplicate_target: "One of the lines was sent twice",
};

export async function saveBudgetAction(
  _previous: BudgetFormState,
  formData: FormData,
): Promise<BudgetFormState> {
  const householdId = await requireHousehold();

  const entries: [string, string][] = [];
  const values: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    entries.push([name, value]);
    if (name.startsWith("item:") || name.startsWith("source:")) {
      values[name] = value;
    }
  }

  const month = readMonth(formData);
  if (!month) {
    return { status: "error", message: "Invalid month", errors: {}, values };
  }

  const parsed = parseBudgetForm(entries);
  if (!parsed.ok) {
    return { status: "error", errors: parsed.errors, values };
  }

  let result: SaveBudgetLinesResult;
  try {
    result = await saveBudgetLines(db, householdId, month, parsed.lines);
  } catch (error) {
    // A database failure should show a message in the form, not an error page,
    // and keep what the user typed.
    console.error("Failed to save the budget", error);
    return {
      status: "error",
      message: "Could not save the budget. Try again.",
      errors: {},
      values,
    };
  }
  if (!result.ok) {
    return {
      status: "error",
      message: SAVE_MESSAGES[result.error],
      errors: {},
      values,
    };
  }

  revalidatePath("/budget");
  return { status: "success" };
}
