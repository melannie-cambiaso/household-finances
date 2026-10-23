// Sample data. Amounts are integer CLP and only illustrative; edit them in the app.

type AccountKind = "salary" | "savings" | "utilities";
type IncomeSourceKind = "fixed" | "per_friday" | "reimbursement";

export type SeedAccount = { name: string; kind: AccountKind };

export type SeedIncomeSource = {
  name: string;
  kind: IncomeSourceKind;
  // Fixed amount, or rate per Friday. Null for reimbursements.
  defaultAmount: number | null;
  // Matched by account name.
  defaultAccount: string;
};

export type SeedItem = {
  name: string;
  // Null = not reimbursable.
  reimbursementPct: number | null;
};

export type SeedCategory = { name: string; items: SeedItem[] };

const accounts: SeedAccount[] = [
  { name: "Salary", kind: "salary" },
  { name: "Savings", kind: "savings" },
  { name: "Utilities", kind: "utilities" },
];

const incomeSources: SeedIncomeSource[] = [
  {
    name: "Salary (me)",
    kind: "fixed",
    defaultAmount: 1_500_000,
    defaultAccount: "Salary",
  },
  {
    name: "Salary (partner)",
    kind: "fixed",
    defaultAmount: 1_200_000,
    defaultAccount: "Salary",
  },
  {
    name: "Friday income",
    kind: "per_friday",
    defaultAmount: 50_000,
    defaultAccount: "Salary",
  },
  {
    name: "Health reimbursement",
    kind: "reimbursement",
    defaultAmount: null,
    defaultAccount: "Salary",
  },
];

const categories: SeedCategory[] = [
  {
    name: "Subscriptions",
    items: [
      { name: "Claude", reimbursementPct: null },
      { name: "Streaming", reimbursementPct: null },
    ],
  },
  {
    name: "Groceries",
    items: [{ name: "Groceries", reimbursementPct: null }],
  },
  {
    name: "Health",
    items: [
      { name: "Medical consultations", reimbursementPct: 70 },
      { name: "Pharmacy", reimbursementPct: 30 },
    ],
  },
  {
    name: "Utilities",
    items: [
      { name: "Electricity", reimbursementPct: null },
      { name: "Water", reimbursementPct: null },
      { name: "Internet", reimbursementPct: null },
    ],
  },
  {
    name: "Transport",
    items: [{ name: "Public transport", reimbursementPct: null }],
  },
];

export const seedData = { accounts, incomeSources, categories };
