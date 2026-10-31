/**
 * Pure ledger functions. No I/O, no database access.
 * REQ-5.4, REQ-5.5, REQ-6.1, REQ-6.2, REQ-8.1–8.4
 */

import type { Debt, Payment } from "./types.js";

/**
 * Compute a customer's balance from debts and payments.
 * Returns the exact difference: sum(debts) - sum(payments).
 * Non-negativity is guaranteed by validatePayment (REQ-5.4) rejecting over-payments.
 *
 * REQ-6.1: Balance = sum(debts) - sum(payments)
 * REQ-6.2: No clamping to zero; exact difference
 */
export function computeBalance(
  debts: Pick<Debt, "amountTzs">[],
  payments: Pick<Payment, "amountTzs">[]
): number {
  const debtSum = debts.reduce((sum, d) => sum + d.amountTzs, 0);
  const paySum = payments.reduce((sum, p) => sum + p.amountTzs, 0);
  return debtSum - paySum;
}

/**
 * Validate that a payment can be applied without exceeding the outstanding balance.
 *
 * REQ-5.1, REQ-5.2, REQ-5.3: Amount must be positive integer
 * REQ-5.4: Payment cannot exceed outstanding balance
 * REQ-5.5: Cannot pay when balance is zero
 */
export function validatePayment(
  amountTzs: number,
  outstandingBalance: number
):
  | { ok: true }
  | { ok: false; reason: string } {
  // Check integer
  if (!Number.isInteger(amountTzs)) {
    return { ok: false, reason: "Amount must be an integer" };
  }

  // Check positive
  if (amountTzs <= 0) {
    return { ok: false, reason: "Amount must be positive" };
  }

  // Check balance is not zero
  if (outstandingBalance === 0) {
    return { ok: false, reason: "Cannot pay when balance is zero" };
  }

  // Check does not exceed balance
  if (amountTzs > outstandingBalance) {
    return { ok: false, reason: "Payment exceeds outstanding balance" };
  }

  return { ok: true };
}

/**
 * Compute the default due date: created_at + 7 days.
 * REQ-4.4: Default due_date is created_at + 7 days
 */
export function defaultDueDate(createdAt: Date): Date {
  // Add exactly 7 days in milliseconds (7 * 24h * 60m * 60s * 1000ms)
  return new Date(createdAt.getTime() + 7 * 86_400_000);
}

/**
 * Sum balances across customers.
 * REQ-8.3: Total owed = sum of individual balances
 */
export function totalOwed(balances: { amountTzs: number }[]): number {
  return balances.reduce((sum, b) => sum + b.amountTzs, 0);
}

/**
 * Validate that a debt amount is valid.
 * REQ-4.1, REQ-4.2, REQ-4.3: Amount must be positive integer
 */
export function validateDebtAmount(
  amountTzs: number
):
  | { ok: true }
  | { ok: false; reason: string } {
  if (!Number.isInteger(amountTzs)) {
    return { ok: false, reason: "Amount must be an integer" };
  }

  if (amountTzs <= 0) {
    return { ok: false, reason: "Amount must be positive" };
  }

  return { ok: true };
}
