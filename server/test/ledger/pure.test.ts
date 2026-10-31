import { describe, it, expect } from "vitest";
import {
  computeBalance,
  validatePayment,
  defaultDueDate,
  totalOwed,
  validateDebtAmount,
} from "../../src/ledger/pure.js";

describe("computeBalance", () => {
  it("returns 0 for empty debts and payments", () => {
    expect(computeBalance([], [])).toBe(0);
  });

  it("returns debt total when no payments", () => {
    const debts = [{ amountTzs: 5000 }, { amountTzs: 3000 }];
    expect(computeBalance(debts, [])).toBe(8000);
  });

  it("returns 0 when payments equal debts", () => {
    const debts = [{ amountTzs: 5000 }];
    const payments = [{ amountTzs: 5000 }];
    expect(computeBalance(debts, payments)).toBe(0);
  });

  it("returns correct balance with multiple debts and payments", () => {
    const debts = [{ amountTzs: 10000 }, { amountTzs: 5000 }];
    const payments = [{ amountTzs: 3000 }, { amountTzs: 2000 }];
    expect(computeBalance(debts, payments)).toBe(10000);
  });

  it("returns exact difference without clamping (REQ-6.2)", () => {
    const debts = [{ amountTzs: 1000 }];
    const payments = [{ amountTzs: 400 }];
    expect(computeBalance(debts, payments)).toBe(600);
  });
});

describe("validatePayment", () => {
  it("accepts valid payment within balance", () => {
    expect(validatePayment(1000, 5000)).toEqual({ ok: true });
  });

  it("accepts payment equal to exact balance", () => {
    expect(validatePayment(5000, 5000)).toEqual({ ok: true });
  });

  it("rejects payment of zero", () => {
    const result = validatePayment(0, 5000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("positive");
    }
  });

  it("rejects negative payment", () => {
    const result = validatePayment(-100, 5000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("positive");
    }
  });

  it("rejects non-integer payment", () => {
    const result = validatePayment(100.5, 5000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("integer");
    }
  });

  it("rejects payment exceeding balance", () => {
    const result = validatePayment(6000, 5000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("exceeds");
    }
  });

  it("rejects payment when balance is zero", () => {
    const result = validatePayment(100, 0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("zero");
    }
  });
});

describe("validateDebtAmount", () => {
  it("accepts positive integer", () => {
    expect(validateDebtAmount(5000)).toEqual({ ok: true });
  });

  it("rejects zero", () => {
    const result = validateDebtAmount(0);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("positive");
    }
  });

  it("rejects negative", () => {
    const result = validateDebtAmount(-100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("positive");
    }
  });

  it("rejects non-integer", () => {
    const result = validateDebtAmount(100.5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("integer");
    }
  });
});

describe("defaultDueDate", () => {
  it("returns exactly 7 days after created_at", () => {
    const createdAt = new Date("2026-10-31T12:00:00Z");
    const expected = new Date("2026-11-07T12:00:00Z");
    expect(defaultDueDate(createdAt)).toEqual(expected);
  });

  it("handles month boundaries correctly", () => {
    const createdAt = new Date("2026-10-28T12:00:00Z");
    const expected = new Date("2026-11-04T12:00:00Z");
    expect(defaultDueDate(createdAt)).toEqual(expected);
  });

  it("handles year boundaries correctly", () => {
    const createdAt = new Date("2026-12-28T12:00:00Z");
    const expected = new Date("2027-01-04T12:00:00Z");
    expect(defaultDueDate(createdAt)).toEqual(expected);
  });
});

describe("totalOwed", () => {
  it("returns 0 for empty balances", () => {
    expect(totalOwed([])).toBe(0);
  });

  it("sums single balance", () => {
    expect(totalOwed([{ amountTzs: 5000 }])).toBe(5000);
  });

  it("sums multiple balances", () => {
    const balances = [
      { amountTzs: 5000 },
      { amountTzs: 3000 },
      { amountTzs: 2000 },
    ];
    expect(totalOwed(balances)).toBe(10000);
  });

  it("handles zero balances", () => {
    const balances = [
      { amountTzs: 5000 },
      { amountTzs: 0 },
      { amountTzs: 3000 },
    ];
    expect(totalOwed(balances)).toBe(8000);
  });
});


import * as fc from "fast-check";

// P1: Property test - balance never negative
describe("P1: balance never negative", () => {
  it("balance remains non-negative after any valid sequence of debts and payments", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom("debt", "payment"),
            amount: fc.integer({ min: 1, max: 100000 }),
          }),
          { minLength: 1, maxLength: 50 }
        ),
        (operations) => {
          const debts: { amountTzs: number }[] = [];
          const payments: { amountTzs: number }[] = [];

          // Apply operations, only accepting valid payments
          for (const op of operations) {
            if (op.type === "debt") {
              debts.push({ amountTzs: op.amount });
            } else {
              // Payment: only apply if it doesn't exceed current balance
              const currentBalance = computeBalance(debts, payments);
              const validation = validatePayment(op.amount, currentBalance);
              if (validation.ok) {
                payments.push({ amountTzs: op.amount });
              }
            }

            // Assert balance is never negative after each operation
            const balance = computeBalance(debts, payments);
            expect(balance).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 25 }
    );
  });
});

// P2: Property test - payment order independence
describe("P2: payment order independence", () => {
  it("final balance is unchanged regardless of payment order", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 10000 }), { minLength: 1, maxLength: 10 }),
        fc.array(fc.integer({ min: 1, max: 5000 }), { minLength: 1, maxLength: 10 }),
        (debtAmounts, paymentAmounts) => {
          const debts = debtAmounts.map((a) => ({ amountTzs: a }));
          
          // Filter payments to only include those that don't exceed total debt
          const totalDebt = debts.reduce((sum, d) => sum + d.amountTzs, 0);
          const validPayments: number[] = [];
          let runningSum = 0;
          for (const amt of paymentAmounts) {
            if (runningSum + amt <= totalDebt) {
              validPayments.push(amt);
              runningSum += amt;
            }
          }

          if (validPayments.length === 0) return true;

          const payments1 = validPayments.map((a) => ({ amountTzs: a }));
          const balance1 = computeBalance(debts, payments1);

          // Shuffle the payments
          const shuffled = [...validPayments].sort(() => Math.random() - 0.5);
          const payments2 = shuffled.map((a) => ({ amountTzs: a }));
          const balance2 = computeBalance(debts, payments2);

          expect(balance1).toBe(balance2);
        }
      ),
      { numRuns: 25 }
    );
  });
});

// P3: Property test - totalOwed equals sum
describe("P3: totalOwed equals sum of individual balances", () => {
  it("totalOwed returns the correct sum across multiple customers", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            debts: fc.array(fc.integer({ min: 1, max: 10000 }), { maxLength: 5 }),
            payments: fc.array(fc.integer({ min: 1, max: 5000 }), { maxLength: 5 }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (customers) => {
          const balances = customers.map((customer) => {
            const debts = customer.debts.map((a) => ({ amountTzs: a }));
            const totalDebt = debts.reduce((sum, d) => sum + d.amountTzs, 0);

            // Filter payments to not exceed total debt
            const validPayments: number[] = [];
            let runningSum = 0;
            for (const amt of customer.payments) {
              if (runningSum + amt <= totalDebt) {
                validPayments.push(amt);
                runningSum += amt;
              }
            }

            const payments = validPayments.map((a) => ({ amountTzs: a }));
            const balance = computeBalance(debts, payments);

            return { amountTzs: balance };
          });

          const total = totalOwed(balances);
          const manualSum = balances.reduce((sum, b) => sum + b.amountTzs, 0);

          expect(total).toBe(manualSum);
        }
      ),
      { numRuns: 25 }
    );
  });
});

// P4: Property test - validatePayment rejects overpayment
describe("P4: validatePayment rejects overpayment", () => {
  it("rejects any payment amount greater than outstanding balance", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100000 }),
        fc.integer({ min: 1, max: 1000 }),
        (outstandingBalance, excess) => {
          const paymentAmount = outstandingBalance + excess;
          const result = validatePayment(paymentAmount, outstandingBalance);

          if (outstandingBalance === 0) {
            // Special case: cannot pay when balance is zero
            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.reason).toContain("zero");
            }
          } else {
            // Payment exceeds balance
            expect(result.ok).toBe(false);
            if (!result.ok) {
              expect(result.reason).toContain("exceeds");
            }
          }
        }
      ),
      { numRuns: 25 }
    );
  });
});
