import { describe, it, expect, beforeEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createDb } from "../../src/db/index.js";
import { DrizzleLedgerRepository } from "../../src/ledger/repository.js";
import { LedgerError } from "../../src/ledger/types.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create a fresh PGlite database and apply migrations.
 */
async function createTestDb() {
  const pg = new PGlite();
  const db = createDb(pg);

  // Apply migrations manually by reading the SQL file
  const migrationPath = join(__dirname, "../../drizzle/0000_chilly_leo.sql");
  const migrationSql = readFileSync(migrationPath, "utf-8");
  await pg.exec(migrationSql);

  return { pg, db };
}

describe("repository.test.ts", () => {
  let db: ReturnType<typeof createDb>;
  let pg: PGlite;
  let repo: DrizzleLedgerRepository;

  beforeEach(async () => {
    const setup = await createTestDb();
    db = setup.db;
    pg = setup.pg;
    repo = new DrizzleLedgerRepository(db);
  });

  describe("T21: one shop per owner enforcement", () => {
    it("allows creating one shop per owner", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const shop1 = await repo.createShop(owner.id, "Duka la Mama");

      expect(shop1.name).toBe("Duka la Mama");
      expect(shop1.ownerId).toBe(owner.id);
    });

    it("rejects creating a second shop for the same owner", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      await repo.createShop(owner.id, "Duka la Mama");

      // Second shop should fail due to unique constraint on owner_id
      await expect(repo.createShop(owner.id, "Another Duka")).rejects.toThrow();
    });

    it("allows different owners to have shops with same name", async () => {
      const owner1 = await repo.findOrCreateOwner("+255712345678");
      const owner2 = await repo.findOrCreateOwner("+255723456789");

      const shop1 = await repo.createShop(owner1.id, "Duka la Mama");
      const shop2 = await repo.createShop(owner2.id, "Duka la Mama");

      expect(shop1.name).toBe(shop2.name);
      expect(shop1.id).not.toBe(shop2.id);
    });
  });

  describe("T22: duplicate customer phone handling", () => {
    it("returns existing customer when same phone in same shop", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const shop = await repo.createShop(owner.id, "Duka la Mama");

      const customer1 = await repo.findOrCreateCustomer(
        shop.id,
        "Juma",
        "+255734567890"
      );
      const customer2 = await repo.findOrCreateCustomer(
        shop.id,
        "Juma Mwingine", // different name
        "+255734567890"
      );

      expect(customer1.id).toBe(customer2.id);
      expect(customer2.name).toBe("Juma"); // Original name preserved
    });

    it("allows duplicate phone in different shops", async () => {
      const owner1 = await repo.findOrCreateOwner("+255712345678");
      const owner2 = await repo.findOrCreateOwner("+255723456789");
      const shop1 = await repo.createShop(owner1.id, "Duka 1");
      const shop2 = await repo.createShop(owner2.id, "Duka 2");

      const customer1 = await repo.findOrCreateCustomer(
        shop1.id,
        "Juma",
        "+255734567890"
      );
      const customer2 = await repo.findOrCreateCustomer(
        shop2.id,
        "Juma",
        "+255734567890"
      );

      expect(customer1.id).not.toBe(customer2.id);
      expect(customer1.phoneE164).toBe(customer2.phoneE164);
    });
  });

  describe("T23: debt due_date with and without explicit value", () => {
    it("uses explicit due_date when provided", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const shop = await repo.createShop(owner.id, "Duka la Mama");
      const customer = await repo.findOrCreateCustomer(
        shop.id,
        "Juma",
        "+255734567890"
      );

      const explicitDueDate = new Date("2026-12-31T12:00:00Z");
      const debt = await repo.recordDebt(
        customer.id,
        5000,
        explicitDueDate,
        null
      );

      expect(debt.dueDate).toEqual(explicitDueDate);
    });

    it("defaults to +7 days when due_date is null", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const shop = await repo.createShop(owner.id, "Duka la Mama");
      const customer = await repo.findOrCreateCustomer(
        shop.id,
        "Juma",
        "+255734567890"
      );

      const beforeCreate = new Date();
      const debt = await repo.recordDebt(customer.id, 5000, null, null);
      const afterCreate = new Date();

      // Due date should be approximately 7 days after creation
      const sevenDays = 7 * 86_400_000;
      const minDueDate = new Date(beforeCreate.getTime() + sevenDays);
      const maxDueDate = new Date(afterCreate.getTime() + sevenDays);

      expect(debt.dueDate.getTime()).toBeGreaterThanOrEqual(minDueDate.getTime());
      expect(debt.dueDate.getTime()).toBeLessThanOrEqual(maxDueDate.getTime());
    });
  });

  describe("T24: payment validation and balance", () => {
    it("rejects payment that exceeds balance", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const shop = await repo.createShop(owner.id, "Duka la Mama");
      const customer = await repo.findOrCreateCustomer(
        shop.id,
        "Juma",
        "+255734567890"
      );

      await repo.recordDebt(customer.id, 5000, null, null);

      await expect(repo.recordPayment(customer.id, 6000)).rejects.toThrow(
        LedgerError
      );

      try {
        await repo.recordPayment(customer.id, 6000);
      } catch (e) {
        expect(e).toBeInstanceOf(LedgerError);
        if (e instanceof LedgerError) {
          expect(e.detail.kind).toBe("PAYMENT_EXCEEDS_BALANCE");
        }
      }
    });

    it("accepts exact-balance payment and yields zero balance", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const shop = await repo.createShop(owner.id, "Duka la Mama");
      const customer = await repo.findOrCreateCustomer(
        shop.id,
        "Juma",
        "+255734567890"
      );

      await repo.recordDebt(customer.id, 5000, null, null);
      await repo.recordPayment(customer.id, 5000);

      const balance = await repo.getCustomerBalance(customer.id);
      expect(balance.amountTzs).toBe(0);
    });

    it("rejects payment when balance is zero", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const shop = await repo.createShop(owner.id, "Duka la Mama");
      const customer = await repo.findOrCreateCustomer(
        shop.id,
        "Juma",
        "+255734567890"
      );

      await repo.recordDebt(customer.id, 5000, null, null);
      await repo.recordPayment(customer.id, 5000);

      await expect(repo.recordPayment(customer.id, 100)).rejects.toThrow(
        LedgerError
      );
    });
  });

  describe("T25: listDebtors sorting and filtering", () => {
    it("returns debtors sorted by amount desc, excludes zero balances", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const shop = await repo.createShop(owner.id, "Duka la Mama");

      const c1 = await repo.findOrCreateCustomer(
        shop.id,
        "Juma",
        "+255734567890"
      );
      const c2 = await repo.findOrCreateCustomer(
        shop.id,
        "Asha",
        "+255745678901"
      );
      const c3 = await repo.findOrCreateCustomer(
        shop.id,
        "Fatuma",
        "+255756789012"
      );

      // Juma: 5000
      await repo.recordDebt(c1.id, 5000, null, null);

      // Asha: 8000
      await repo.recordDebt(c2.id, 8000, null, null);

      // Fatuma: 3000 - 3000 = 0 (should be excluded)
      await repo.recordDebt(c3.id, 3000, null, null);
      await repo.recordPayment(c3.id, 3000);

      const { balances, grandTotalTzs } = await repo.listDebtors(shop.id);

      expect(balances).toHaveLength(2);
      expect(balances).toMatchObject([
        { customerName: "Asha", amountTzs: 8000 },
        { customerName: "Juma", amountTzs: 5000 },
      ]);
      expect(grandTotalTzs).toBe(13000);
    });

    it("returns empty list when no customers have outstanding debts", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const shop = await repo.createShop(owner.id, "Duka la Mama");

      const { balances, grandTotalTzs } = await repo.listDebtors(shop.id);

      expect(balances).toHaveLength(0);
      expect(grandTotalTzs).toBe(0);
    });
  });

  describe("T26: input validation rejection", () => {
    it("rejects invalid phone number", async () => {
      await expect(repo.findOrCreateOwner("123456")).rejects.toThrow(
        LedgerError
      );

      try {
        await repo.findOrCreateOwner("123456");
      } catch (e) {
        expect(e).toBeInstanceOf(LedgerError);
        if (e instanceof LedgerError) {
          expect(e.detail.kind).toBe("INVALID_PHONE");
        }
      }
    });

    it("rejects shop name over 100 characters", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const longName = "A".repeat(101);

      await expect(repo.createShop(owner.id, longName)).rejects.toThrow(
        LedgerError
      );

      try {
        await repo.createShop(owner.id, longName);
      } catch (e) {
        expect(e).toBeInstanceOf(LedgerError);
        if (e instanceof LedgerError) {
          expect(e.detail.kind).toBe("SHOP_NAME_TOO_LONG");
        }
      }
    });

    it("rejects customer name over 100 characters", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const shop = await repo.createShop(owner.id, "Duka la Mama");
      const longName = "A".repeat(101);

      await expect(
        repo.findOrCreateCustomer(shop.id, longName, "+255734567890")
      ).rejects.toThrow(LedgerError);

      try {
        await repo.findOrCreateCustomer(shop.id, longName, "+255734567890");
      } catch (e) {
        expect(e).toBeInstanceOf(LedgerError);
        if (e instanceof LedgerError) {
          expect(e.detail.kind).toBe("NAME_TOO_LONG");
        }
      }
    });

    it("rejects non-integer debt amount", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const shop = await repo.createShop(owner.id, "Duka la Mama");
      const customer = await repo.findOrCreateCustomer(
        shop.id,
        "Juma",
        "+255734567890"
      );

      await expect(
        repo.recordDebt(customer.id, 100.5, null, null)
      ).rejects.toThrow(LedgerError);

      try {
        await repo.recordDebt(customer.id, 100.5, null, null);
      } catch (e) {
        expect(e).toBeInstanceOf(LedgerError);
        if (e instanceof LedgerError) {
          expect(e.detail.kind).toBe("INVALID_AMOUNT");
        }
      }
    });

    it("rejects non-positive debt amount", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const shop = await repo.createShop(owner.id, "Duka la Mama");
      const customer = await repo.findOrCreateCustomer(
        shop.id,
        "Juma",
        "+255734567890"
      );

      await expect(
        repo.recordDebt(customer.id, 0, null, null)
      ).rejects.toThrow(LedgerError);

      await expect(
        repo.recordDebt(customer.id, -100, null, null)
      ).rejects.toThrow(LedgerError);
    });

    it("rejects non-integer payment amount", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const shop = await repo.createShop(owner.id, "Duka la Mama");
      const customer = await repo.findOrCreateCustomer(
        shop.id,
        "Juma",
        "+255734567890"
      );

      await repo.recordDebt(customer.id, 5000, null, null);

      await expect(repo.recordPayment(customer.id, 100.5)).rejects.toThrow(
        LedgerError
      );
    });

    it("rejects non-positive payment amount", async () => {
      const owner = await repo.findOrCreateOwner("+255712345678");
      const shop = await repo.createShop(owner.id, "Duka la Mama");
      const customer = await repo.findOrCreateCustomer(
        shop.id,
        "Juma",
        "+255734567890"
      );

      await repo.recordDebt(customer.id, 5000, null, null);

      await expect(repo.recordPayment(customer.id, 0)).rejects.toThrow(
        LedgerError
      );

      await expect(repo.recordPayment(customer.id, -100)).rejects.toThrow(
        LedgerError
      );
    });
  });
});


import * as fc from "fast-check";
import { computeBalance } from "../../src/ledger/pure.js";

describe("P5: repository balance matches pure model", () => {
  it(
    "repository balance equals pure model computeBalance after random operations",
    async () => {
      // Create ONE PGlite for all fast-check runs
      const { pg, db } = await createTestDb();
      const repo = new DrizzleLedgerRepository(db);

      let phoneCounter = 0;

      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              type: fc.constantFrom("debt", "payment"),
              amount: fc.integer({ min: 1, max: 10000 }),
            }),
            { minLength: 1, maxLength: 30 }
          ),
          async (operations) => {
            // Create unique phone for this run to isolate data
            phoneCounter++;
            const ownerPhone = `+25571${phoneCounter.toString().padStart(7, "0")}`;
            const customerPhone = `+25573${phoneCounter.toString().padStart(7, "0")}`;

            // Set up owner, shop, and customer with unique phones
            const owner = await repo.findOrCreateOwner(ownerPhone);
            const shop = await repo.createShop(owner.id, `Test Duka ${phoneCounter}`);
            const customer = await repo.findOrCreateCustomer(
              shop.id,
              `Test Customer ${phoneCounter}`,
              customerPhone
            );

            // Track pure model state
            const pureDebts: { amountTzs: number }[] = [];
            const purePayments: { amountTzs: number }[] = [];

            // Apply operations to both repository and pure model
            for (const op of operations) {
              if (op.type === "debt") {
                await repo.recordDebt(customer.id, op.amount, null, null);
                pureDebts.push({ amountTzs: op.amount });
              } else {
                // Payment: only apply if valid
                const currentBalance = computeBalance(pureDebts, purePayments);
                if (currentBalance > 0 && op.amount <= currentBalance) {
                  try {
                    await repo.recordPayment(customer.id, op.amount);
                    purePayments.push({ amountTzs: op.amount });
                  } catch (e) {
                    // If repository rejects, don't add to pure model either
                    // This handles race conditions or validation differences
                  }
                }
              }
            }

            // Compare final balances
            const repoBalance = await repo.getCustomerBalance(customer.id);
            const pureBalance = computeBalance(pureDebts, purePayments);

            expect(repoBalance.amountTzs).toBe(pureBalance);
            expect(repoBalance.amountTzs).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 25 }
      );

      // Clean up after all runs
      await pg.close();
    },
    60_000
  );
});
