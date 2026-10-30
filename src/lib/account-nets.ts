// Pure helper for the accounts page. No database or framework imports, so it
// can be unit tested with Node's built-in runner.

export type AccountFlows = {
  /** Incomes received into the account. */
  incomes: number;
  /** Transfers into the account. */
  transfersIn: number;
  /** Transfers out of the account. */
  transfersOut: number;
  /** Expenses paid from the account. */
  expenses: number;
};

/** Net of an account over a period: what came in minus what left. */
export function accountNet(flows: AccountFlows): number {
  return flows.incomes + flows.transfersIn - flows.transfersOut - flows.expenses;
}
