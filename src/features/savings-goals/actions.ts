"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { UUID_PATTERN } from "@/shared/ids";
import { parseAmount } from "@/shared/money";
import { validateGoalInput } from "@/features/savings-goals/rules";
import {
  archiveGoal,
  createGoal,
  updateGoal,
  type ArchiveGoalResult,
} from "@/features/savings-goals/service";
import { getAllowedSession } from "@/features/auth/session";

export type GoalFormValues = {
  name: string;
  targetAmount: string;
  targetDate: string;
};

export type GoalFormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      message: string;
      // Echoed back so the form keeps what the user typed.
      values: GoalFormValues;
    };

// One message for a missing goal and a goal of another household: do not reveal
// whether an id exists elsewhere. Any other error is a validation message meant
// for the user as it is.
const NOT_AVAILABLE = "That goal is not available";

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readValues(formData: FormData): GoalFormValues {
  return {
    name: readText(formData, "name"),
    targetAmount: readText(formData, "targetAmount"),
    targetDate: readText(formData, "targetDate"),
  };
}

// The browser sends text, so the amount is parsed before the shared rules see
// it. A zero keeps the rules' own message for an unusable amount.
function readGoal(raw: GoalFormValues) {
  const targetDate = raw.targetDate.trim();
  return validateGoalInput({
    name: raw.name,
    targetAmount: parseAmount(raw.targetAmount) ?? 0,
    targetDate: targetDate === "" ? null : targetDate,
  });
}

// A goal's name and progress live on /savings, and the transfer form offers the
// active goals on /transfers.
function revalidateGoals() {
  revalidatePath("/savings");
  revalidatePath("/transfers");
}

// Server Actions can be called with a direct POST, so each one re-checks the
// session. The household comes from the session, never from the form.
export async function createGoalAction(
  _previous: GoalFormState,
  formData: FormData,
): Promise<GoalFormState> {
  const session = await getAllowedSession();
  if (!session) redirect("/login");

  const values = readValues(formData);
  const householdId = session.user.householdId;
  if (!householdId) {
    return {
      status: "error",
      message: "Your account is not linked to a household",
      values,
    };
  }

  const checked = readGoal(values);
  if (!checked.ok) return { status: "error", message: checked.error, values };

  try {
    const result = await createGoal(db, householdId, checked.value);
    if (!result.ok) {
      return { status: "error", message: result.error, values };
    }
  } catch (error) {
    // A database failure should show a message in the form, not an error page,
    // and keep what the user typed.
    console.error("Failed to create a savings goal", error);
    return {
      status: "error",
      message: "Could not save the goal. Try again.",
      values,
    };
  }

  revalidateGoals();
  return { status: "success" };
}

export async function updateGoalAction(
  _previous: GoalFormState,
  formData: FormData,
): Promise<GoalFormState> {
  const session = await getAllowedSession();
  if (!session) redirect("/login");

  const values = readValues(formData);
  const householdId = session.user.householdId;
  if (!householdId) {
    return {
      status: "error",
      message: "Your account is not linked to a household",
      values,
    };
  }

  // The goal id comes from the form, so the service only touches it when it is
  // a goal of the household.
  const id = readText(formData, "goalId");
  if (!UUID_PATTERN.test(id)) {
    return { status: "error", message: NOT_AVAILABLE, values };
  }

  const checked = readGoal(values);
  if (!checked.ok) return { status: "error", message: checked.error, values };

  try {
    const result = await updateGoal(db, householdId, id, checked.value);
    if (!result.ok) {
      return {
        status: "error",
        message:
          result.error === "goal_not_found" ? NOT_AVAILABLE : result.error,
        values,
      };
    }
  } catch (error) {
    console.error("Failed to update a savings goal", error);
    return {
      status: "error",
      message: "Could not save the changes. Try again.",
      values,
    };
  }

  revalidateGoals();
  return { status: "success" };
}

export async function archiveGoalAction(formData: FormData): Promise<void> {
  const session = await getAllowedSession();
  if (!session) redirect("/login");
  const householdId = session.user.householdId;
  if (!householdId) return;

  const id = readText(formData, "goalId");
  if (!UUID_PATTERN.test(id)) return;

  let result: ArchiveGoalResult;
  try {
    result = await archiveGoal(db, householdId, id);
  } catch (error) {
    console.error("Failed to archive a savings goal", error);
    return;
  }
  if (!result.ok) return;

  revalidateGoals();
}
