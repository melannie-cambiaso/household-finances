"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import {
  validateCategoryName,
  validateItemInput,
  type ItemField,
} from "@/lib/catalog";
import {
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  renameCategory,
  updateItem,
} from "@/lib/catalog-service";
import { UUID_PATTERN } from "@/shared/ids";
import { getAllowedSession } from "@/lib/session";

export type CategoryFormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      message: string;
      // Echoed back so the form keeps what the user typed.
      name: string;
    };

export type ItemFormValues = Record<ItemField, string>;

export type ItemFormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      message?: string;
      errors: Partial<Record<ItemField, string>>;
      values: ItemFormValues;
    };

// A refused delete is an expected answer, not a failure: it explains why.
export type DeleteState =
  | { status: "idle" }
  | { status: "error"; message: string };

const NO_HOUSEHOLD = "Your account is not linked to a household";
const NOT_SAVED = "Could not save the changes. Try again.";

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

// The names appear on every page (expense form, budget, progress, dashboard).
function revalidateAll() {
  for (const path of ["/categories", "/expenses", "/incomes", "/budget", "/"]) {
    revalidatePath(path);
  }
}

// Server Actions can be called with a direct POST, so each one re-checks the
// session. The household comes from the session, never from the form.
async function householdOf(): Promise<string | null> {
  const session = await getAllowedSession();
  if (!session) redirect("/login");
  return session.user.householdId ?? null;
}

export async function createCategoryAction(
  _previous: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const householdId = await householdOf();
  const name = readText(formData, "name");
  if (!householdId) return { status: "error", message: NO_HOUSEHOLD, name };

  const checked = validateCategoryName(name);
  if (!checked.ok) return { status: "error", message: checked.error, name };

  try {
    const result = await createCategory(db, householdId, checked.name);
    if (!result.ok) {
      return {
        status: "error",
        message: "A category with that name already exists",
        name,
      };
    }
  } catch (error) {
    console.error("Failed to create a category", error);
    return { status: "error", message: NOT_SAVED, name };
  }

  revalidateAll();
  return { status: "success" };
}

export async function renameCategoryAction(
  _previous: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const householdId = await householdOf();
  const name = readText(formData, "name");
  if (!householdId) return { status: "error", message: NO_HOUSEHOLD, name };

  const id = readText(formData, "categoryId");
  if (!UUID_PATTERN.test(id)) {
    return { status: "error", message: "That category no longer exists", name };
  }
  const checked = validateCategoryName(name);
  if (!checked.ok) return { status: "error", message: checked.error, name };

  try {
    const result = await renameCategory(db, householdId, id, checked.name);
    if (!result.ok) {
      return {
        status: "error",
        message:
          result.error === "duplicate_name"
            ? "A category with that name already exists"
            : "That category no longer exists",
        name,
      };
    }
  } catch (error) {
    console.error("Failed to rename a category", error);
    return { status: "error", message: NOT_SAVED, name };
  }

  revalidateAll();
  return { status: "success" };
}

export async function deleteCategoryAction(
  _previous: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const householdId = await householdOf();
  if (!householdId) return { status: "error", message: NO_HOUSEHOLD };

  const id = readText(formData, "categoryId");
  if (!UUID_PATTERN.test(id)) {
    return { status: "error", message: "That category no longer exists" };
  }

  try {
    const result = await deleteCategory(db, householdId, id);
    if (!result.ok) {
      return {
        status: "error",
        message:
          result.error === "has_items"
            ? `This category still has ${plural(result.count, "item", "items")}. Move or delete them first.`
            : "That category no longer exists",
      };
    }
  } catch (error) {
    console.error("Failed to delete a category", error);
    return { status: "error", message: "Could not delete it. Try again." };
  }

  revalidateAll();
  return { status: "idle" };
}

function itemErrorMessage(
  error: "item_not_found" | "category_not_found" | "duplicate_name",
): string {
  if (error === "duplicate_name") {
    return "That category already has an item with that name";
  }
  // One message for a missing item or category and one of another household:
  // do not reveal whether an id exists elsewhere.
  return "That item or category is not available";
}

function readItemValues(formData: FormData): ItemFormValues {
  return {
    name: readText(formData, "name"),
    categoryId: readText(formData, "categoryId"),
    reimbursementPct: readText(formData, "reimbursementPct"),
  };
}

export async function createItemAction(
  _previous: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const householdId = await householdOf();
  const values = readItemValues(formData);
  if (!householdId) {
    return { status: "error", message: NO_HOUSEHOLD, errors: {}, values };
  }

  const validation = validateItemInput(values);
  if (!validation.ok) {
    return { status: "error", errors: validation.errors, values };
  }

  try {
    const result = await createItem(db, householdId, validation.value);
    if (!result.ok) {
      return {
        status: "error",
        message: itemErrorMessage(result.error),
        errors: {},
        values,
      };
    }
  } catch (error) {
    console.error("Failed to create an item", error);
    return { status: "error", message: NOT_SAVED, errors: {}, values };
  }

  revalidateAll();
  return { status: "success" };
}

export async function updateItemAction(
  _previous: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const householdId = await householdOf();
  const values = readItemValues(formData);
  if (!householdId) {
    return { status: "error", message: NO_HOUSEHOLD, errors: {}, values };
  }

  const id = readText(formData, "itemId");
  if (!UUID_PATTERN.test(id)) {
    return {
      status: "error",
      message: itemErrorMessage("item_not_found"),
      errors: {},
      values,
    };
  }
  const validation = validateItemInput(values);
  if (!validation.ok) {
    return { status: "error", errors: validation.errors, values };
  }

  try {
    const result = await updateItem(db, householdId, id, validation.value);
    if (!result.ok) {
      return {
        status: "error",
        message: itemErrorMessage(result.error),
        errors: {},
        values,
      };
    }
  } catch (error) {
    console.error("Failed to update an item", error);
    return { status: "error", message: NOT_SAVED, errors: {}, values };
  }

  revalidateAll();
  return { status: "success" };
}

export async function deleteItemAction(
  _previous: DeleteState,
  formData: FormData,
): Promise<DeleteState> {
  const householdId = await householdOf();
  if (!householdId) return { status: "error", message: NO_HOUSEHOLD };

  const id = readText(formData, "itemId");
  if (!UUID_PATTERN.test(id)) {
    return { status: "error", message: "That item no longer exists" };
  }

  try {
    const result = await deleteItem(db, householdId, id);
    if (!result.ok) {
      if (result.error === "in_use") {
        const used = [
          result.expenses > 0 && plural(result.expenses, "expense", "expenses"),
          result.budgetLines > 0 &&
            plural(result.budgetLines, "budget line", "budget lines"),
        ]
          .filter(Boolean)
          .join(" and ");
        return {
          status: "error",
          message: `It is used by ${used}, so it cannot be deleted. Rename it, or edit those expenses to use another item.`,
        };
      }
      return { status: "error", message: "That item no longer exists" };
    }
  } catch (error) {
    console.error("Failed to delete an item", error);
    return { status: "error", message: "Could not delete it. Try again." };
  }

  revalidateAll();
  return { status: "idle" };
}
