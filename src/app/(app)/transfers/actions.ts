"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { UUID_PATTERN } from "@/lib/expenses";
import {
  createTransfer,
  deleteTransfer,
  updateTransfer,
  type CreateTransferResult,
  type UpdateTransferResult,
} from "@/lib/transfer-service";
import { validateTransferInput, type TransferField } from "@/lib/transfers";
import { getAllowedSession } from "@/lib/session";

export type TransferFormValues = Record<TransferField, string>;

export type TransferFormState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      message?: string;
      errors: Partial<Record<TransferField, string>>;
      // Echoed back so the form keeps what the user typed.
      values: TransferFormValues;
    };

const FIELDS: TransferField[] = [
  "fromAccountId",
  "toAccountId",
  "amount",
  "madeOn",
  "kind",
];

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function emptyValues(): TransferFormValues {
  return { fromAccountId: "", toAccountId: "", amount: "", madeOn: "", kind: "" };
}

function readValues(formData: FormData): TransferFormValues {
  return Object.fromEntries(
    FIELDS.map((field) => [field, readText(formData, field)]),
  ) as TransferFormValues;
}

const MESSAGES: Record<
  | Extract<CreateTransferResult, { ok: false }>["error"]
  | Extract<UpdateTransferResult, { ok: false }>["error"],
  string
> = {
  // One message for a missing account and an account of another household: do
  // not reveal whether an id exists elsewhere.
  account_not_found: "That account is not available",
  repayment_must_go_to_savings:
    "A repayment must go into a savings account, because that is what it pays back",
  transfer_not_found: "That transfer no longer exists",
};

// The savings debt is derived from transfers, and the dashboard shows it.
function revalidateAll() {
  revalidatePath("/transfers");
  revalidatePath("/");
}

// Server Actions can be called with a direct POST, so each one re-checks the
// session. The household comes from the session, never from the form.
export async function createTransferAction(
  _previous: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
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

  const values = readValues(formData);
  const validation = validateTransferInput(values);
  if (!validation.ok) {
    return { status: "error", errors: validation.errors, values };
  }

  let result: CreateTransferResult;
  try {
    result = await createTransfer(db, householdId, validation.value);
  } catch (error) {
    // A database failure should show a message in the form, not an error page,
    // and keep what the user typed.
    console.error("Failed to save a transfer", error);
    return {
      status: "error",
      message: "Could not save the transfer. Try again.",
      errors: {},
      values,
    };
  }
  if (!result.ok) {
    return { status: "error", message: MESSAGES[result.error], errors: {}, values };
  }

  revalidateAll();
  return { status: "success" };
}

export async function updateTransferAction(
  _previous: TransferFormState,
  formData: FormData,
): Promise<TransferFormState> {
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

  const values = readValues(formData);
  // The transfer id comes from the form, so the service only touches it when it
  // belongs to the household.
  const id = readText(formData, "transferId");
  if (!UUID_PATTERN.test(id)) {
    return {
      status: "error",
      message: MESSAGES.transfer_not_found,
      errors: {},
      values,
    };
  }

  const validation = validateTransferInput(values);
  if (!validation.ok) {
    return { status: "error", errors: validation.errors, values };
  }

  let result: UpdateTransferResult;
  try {
    result = await updateTransfer(db, householdId, id, validation.value);
  } catch (error) {
    console.error("Failed to update a transfer", error);
    return {
      status: "error",
      message: "Could not save the changes. Try again.",
      errors: {},
      values,
    };
  }
  if (!result.ok) {
    return { status: "error", message: MESSAGES[result.error], errors: {}, values };
  }

  revalidateAll();
  return { status: "success" };
}

export async function deleteTransferAction(formData: FormData): Promise<void> {
  const session = await getAllowedSession();
  if (!session) redirect("/login");
  const householdId = session.user.householdId;
  if (!householdId) return;

  const id = readText(formData, "transferId");
  if (!UUID_PATTERN.test(id)) return;

  try {
    await deleteTransfer(db, householdId, id);
  } catch (error) {
    console.error("Failed to delete a transfer", error);
  }
  revalidateAll();
}
