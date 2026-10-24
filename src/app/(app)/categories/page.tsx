import { redirect } from "next/navigation";
import { Suspense } from "react";

import { db } from "@/db";
import { listCatalog } from "@/lib/catalog-service";
import { getAllowedSession } from "@/lib/session";

import { deleteCategoryAction, deleteItemAction } from "./actions";
import { CategoryForm } from "./category-form";
import { DeleteButton } from "./delete-button";
import { ItemForm } from "./item-form";
import { Modal } from "../modal";

const rowButtonClass =
  "rounded-full border border-line px-3 py-0.5 text-sm text-muted transition-colors hover:bg-page hover:text-text";

const primaryButtonClass =
  "rounded-full bg-accent px-4 py-1 text-sm text-page transition-opacity hover:opacity-90";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export default function CategoriesPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading...</p>}>
      <CategoriesContent />
    </Suspense>
  );
}

async function CategoriesContent() {
  const session = await getAllowedSession();
  if (!session) redirect("/login");

  const householdId = session.user.householdId;
  if (!householdId) {
    return <p className="p-8">Your account is not linked to a household.</p>;
  }

  const catalog = await listCatalog(db, householdId);
  const categoryOptions = catalog.map(({ id, name }) => ({ id, name }));

  return (
    <>
      <header className="border-b border-line px-8 py-6">
        <h1 className="text-3xl">Categories</h1>
        <p className="text-sm text-muted">
          What the household plans and spends against
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
        <section className="rounded-card border border-line bg-surface p-6">
          <CategoryForm />
        </section>

        {catalog.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-6 text-muted">
            There are no categories yet. Add the first one above, then add the
            items you spend on.
          </p>
        ) : (
          catalog.map((category) => (
            <section
              key={category.id}
              className="rounded-card border border-line bg-surface p-6"
            >
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-xl">{category.name}</h2>
                <div className="flex items-start gap-2">
                  <Modal
                    triggerLabel="Rename"
                    triggerClassName={rowButtonClass}
                    title="Rename category"
                  >
                    <CategoryForm
                      category={{ id: category.id, name: category.name }}
                    />
                  </Modal>
                  <DeleteButton
                    action={deleteCategoryAction}
                    fieldName="categoryId"
                    id={category.id}
                    confirmText={`Delete the category "${category.name}"?`}
                    className={rowButtonClass}
                  />
                </div>
              </div>

              {category.items.length === 0 ? (
                <p className="mb-4 text-muted">No items in this category.</p>
              ) : (
                <ul className="mb-4 flex flex-col gap-3">
                  {category.items.map((item) => {
                    const used = [
                      item.expenseCount > 0 &&
                        plural(item.expenseCount, "expense", "expenses"),
                      item.budgetLineCount > 0 &&
                        plural(item.budgetLineCount, "budget line", "budget lines"),
                    ].filter(Boolean);
                    return (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p>{item.name}</p>
                          <p className="text-sm text-muted">
                            {item.reimbursementPct === null
                              ? "Not reimbursable"
                              : `${item.reimbursementPct}% reimbursable`}
                            {" · "}
                            {used.length > 0
                              ? `used by ${used.join(" and ")}`
                              : "not used yet"}
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <Modal
                            triggerLabel="Edit"
                            triggerClassName={rowButtonClass}
                            title="Edit item"
                          >
                            <ItemForm
                              categories={categoryOptions}
                              defaultCategoryId={category.id}
                              item={{
                                id: item.id,
                                values: {
                                  name: item.name,
                                  categoryId: category.id,
                                  reimbursementPct:
                                    item.reimbursementPct === null
                                      ? ""
                                      : String(item.reimbursementPct),
                                },
                              }}
                            />
                          </Modal>
                          <DeleteButton
                            action={deleteItemAction}
                            fieldName="itemId"
                            id={item.id}
                            confirmText={`Delete the item "${item.name}"?`}
                            className={rowButtonClass}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <Modal
                triggerLabel="+ Add item"
                triggerClassName={primaryButtonClass}
                title={`Add an item to ${category.name}`}
              >
                <ItemForm
                  categories={categoryOptions}
                  defaultCategoryId={category.id}
                />
              </Modal>
            </section>
          ))
        )}

        <p className="text-sm text-muted">
          An item that has expenses or budget lines cannot be deleted, so the
          history stays complete: rename it, or edit those expenses to use
          another item. A category can be deleted once it has no items.
        </p>
      </main>
    </>
  );
}
