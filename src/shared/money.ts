// Money helpers shared by every feature. Amounts are whole CLP, stored as
// integers. No database or framework imports, so they can be unit tested with
// Node's built-in runner.

const POSTGRES_INTEGER_MAX = 2_147_483_647;

// Digits only, or groups of three separated by dots (Chilean thousands format).
const AMOUNT_PATTERN = /^(\d+|\d{1,3}(\.\d{3})+)$/;


/** Parses a CLP amount. Returns null for anything that is not a positive integer. */
export function parseAmount(raw: string): number | null {
  const text = raw.trim();
  if (!AMOUNT_PATTERN.test(text)) return null;
  const value = Number(text.replaceAll(".", ""));
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  if (value > POSTGRES_INTEGER_MAX) return null;
  return value;
}

const clpFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function formatClp(amount: number): string {
  return clpFormatter.format(amount);
}
