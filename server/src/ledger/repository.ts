/**
 * Repository layer for ledger operations.
 * Thin I/O wrapper around Drizzle ORM.
 * REQ-1.1, REQ-1.2, REQ-1.3, REQ-1.4, REQ-2.1, REQ-2.2, REQ-3.1, REQ-3.2, REQ-3.3, REQ-4.1–4.6, REQ-5.1–5.7, REQ-6.1–6.3, REQ-7.1–7.4
 */

import { eq, and } from "drizzle-orm";
import type { DbClient } from "../db/index.js";
import { owners, shops, customers, debts, payments } from "../db/schema.js";
import { normalisePhone } from "./phone.js";
import { computeBalance, validatePayment, defaultDueDate, totalOwed } from "./pure.js";
import {
  Owner,
  Shop,
  Customer,
  Debt,
  Payment,
  Balance,
  LedgerError,
} from "./types.js";

export interface LedgerRepository {
  findOrCreateOwner(phoneE164: string): Promise<Owner>;
  getOwnerShop(ownerId: number): Promise<Shop | null>;
  createShop(ownerId: number, name: string): Promise<Shop>;
  findOrCreateCustomer(
    shopId: number,
    name: string,
    phoneE164: string
  ): Promise<Customer>;
  recordDebt(
    customerId: number,
    amountTzs: number,
    dueDate: Date | null,
    note: string | null
  ): Promise<Debt>;
  recordPayment(customerId: number, amountTzs: number): Promise<Payment>;
  getCustomerBalance(customerId: number): Promise<Balance>;
  listDebtors(
    shopId: number
  ): Promise<{ balances: Balance[]; grandTotalTzs: number }>;
}

export class DrizzleLedgerRepository implements LedgerRepository {
  constructor(private db: DbClient) {}

  /**
   * Find an owner by phone number, or create if not exists.
   * REQ-1.1, REQ-1.2, REQ-1.3, REQ-1.4
   */
  async findOrCreateOwner(phoneE164: string): Promise<Owner> {
    // Validate phone format
    let normalized: string;
    try {
      normalized = normalisePhone(phoneE164);
    } catch (err) {
      // normalisePhone throws LedgerError
      throw err;
    }

    // Try to find existing
    const existing = await this.db.query.owners.findFirst({
      where: eq(owners.phoneE164, normalized),
    });

    if (existing) {
      return {
        id: existing.id,
        phoneE164: existing.phoneE164,
        createdAt: existing.createdAt,
      };
    }

    // Create new
    const [newOwner] = await this.db
      .insert(owners)
      .values({ phoneE164: normalized })
      .returning();

    if (!newOwner) {
      throw new Error("Failed to create owner: .returning() returned undefined");
    }

    return {
      id: newOwner.id,
      phoneE164: newOwner.phoneE164,
      createdAt: newOwner.createdAt,
    };
  }

  /**
   * Get the shop owned by this owner.
   * Returns null if the owner has no shop yet.
   * REQ-2.1, REQ-2.2
   */
  async getOwnerShop(ownerId: number): Promise<Shop | null> {
    const shop = await this.db.query.shops.findFirst({
      where: eq(shops.ownerId, ownerId),
    });

    if (!shop) return null;

    return {
      id: shop.id,
      ownerId: shop.ownerId,
      name: shop.name,
      createdAt: shop.createdAt,
    };
  }

  /**
   * Create a new shop for an owner.
   * REQ-2.1, REQ-2.2, REQ-2.3
   */
  async createShop(ownerId: number, name: string): Promise<Shop> {
    // Validate name length (REQ-2.3)
    if (name.length > 100) {
      throw new LedgerError({
        kind: "SHOP_NAME_TOO_LONG",
        max: 100,
        actual: name.length,
      });
    }

    const [newShop] = await this.db
      .insert(shops)
      .values({ ownerId, name })
      .returning();

    if (!newShop) {
      throw new Error("Failed to create shop: .returning() returned undefined");
    }

    return {
      id: newShop.id,
      ownerId: newShop.ownerId,
      name: newShop.name,
      createdAt: newShop.createdAt,
    };
  }

  /**
   * Find a customer by phone in a shop, or create if not exists.
   * REQ-3.1, REQ-3.2, REQ-3.3, REQ-3.4, REQ-3.5
   */
  async findOrCreateCustomer(
    shopId: number,
    name: string,
    phoneE164: string
  ): Promise<Customer> {
    // Validate phone format (REQ-3.4)
    let normalized: string;
    try {
      normalized = normalisePhone(phoneE164);
    } catch (err) {
      throw err;
    }

    // Validate name length (REQ-3.5)
    if (name.length > 100) {
      throw new LedgerError({
        kind: "NAME_TOO_LONG",
        max: 100,
        actual: name.length,
      });
    }

    // Try to find existing customer in this shop
    const existing = await this.db.query.customers.findFirst({
      where: and(
        eq(customers.shopId, shopId),
        eq(customers.phoneE164, normalized)
      ),
    });

    if (existing) {
      return {
        id: existing.id,
        shopId: existing.shopId,
        name: existing.name,
        phoneE164: existing.phoneE164,
        createdAt: existing.createdAt,
      };
    }

    // Create new
    const [newCustomer] = await this.db
      .insert(customers)
      .values({ shopId, name, phoneE164: normalized })
      .returning();

    if (!newCustomer) {
      throw new Error("Failed to create customer: .returning() returned undefined");
    }

    return {
      id: newCustomer.id,
      shopId: newCustomer.shopId,
      name: newCustomer.name,
      phoneE164: newCustomer.phoneE164,
      createdAt: newCustomer.createdAt,
    };
  }

  /**
   * Record a debt for a customer.
   * REQ-4.1, REQ-4.2, REQ-4.3, REQ-4.4, REQ-4.5, REQ-4.6
   */
  async recordDebt(
    customerId: number,
    amountTzs: number,
    dueDate: Date | null,
    note: string | null
  ): Promise<Debt> {
    // Validate amount (REQ-4.2, REQ-4.3)
    if (!Number.isInteger(amountTzs)) {
      throw new LedgerError({
        kind: "INVALID_AMOUNT",
        amount: amountTzs,
        reason: "Amount must be an integer",
      });
    }

    if (amountTzs <= 0) {
      throw new LedgerError({
        kind: "INVALID_AMOUNT",
        amount: amountTzs,
        reason: "Amount must be positive",
      });
    }

    // Validate note length (REQ-4.5)
    if (note && note.length > 200) {
      throw new LedgerError({
        kind: "NOTE_TOO_LONG",
        max: 200,
        actual: note.length,
      });
    }

    // Compute due date if not provided (REQ-4.4)
    const createdAt = new Date();
    const computedDueDate = dueDate ?? defaultDueDate(createdAt);

    // Insert debt (REQ-4.1, REQ-4.6)
    const [newDebt] = await this.db
      .insert(debts)
      .values({
        customerId,
        amountTzs,
        note,
        dueDate: computedDueDate,
        createdAt,
      })
      .returning();

    if (!newDebt) {
      throw new Error("Failed to create debt: .returning() returned undefined");
    }

    return {
      id: newDebt.id,
      customerId: newDebt.customerId,
      amountTzs: newDebt.amountTzs,
      note: newDebt.note,
      createdAt: newDebt.createdAt,
      dueDate: newDebt.dueDate,
    };
  }

  /**
   * Record a payment for a customer.
   * Uses a transaction with SELECT FOR UPDATE to prevent race conditions.
   * REQ-5.1, REQ-5.2, REQ-5.3, REQ-5.4, REQ-5.5, REQ-5.7
   */
  async recordPayment(customerId: number, amountTzs: number): Promise<Payment> {
    // Validate amount is an integer (REQ-5.2)
    if (!Number.isInteger(amountTzs)) {
      throw new LedgerError({
        kind: "INVALID_AMOUNT",
        amount: amountTzs,
        reason: "Amount must be an integer",
      });
    }

    // Validate amount is positive (REQ-5.3)
    if (amountTzs <= 0) {
      throw new LedgerError({
        kind: "INVALID_AMOUNT",
        amount: amountTzs,
        reason: "Amount must be positive",
      });
    }

    // Use a transaction with SELECT FOR UPDATE (REQ-5.7)
    return await this.db.transaction(async (tx) => {
      // Lock the customer row to prevent concurrent payment races
      const [customer] = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, customerId))
        .for("update");

      if (!customer) {
        throw new LedgerError({
          kind: "NOT_FOUND",
          entity: "customer",
          id: customerId,
        });
      }

      // Fetch all debts and payments for this customer
      const customerDebts = await tx
        .select()
        .from(debts)
        .where(eq(debts.customerId, customerId));

      const customerPayments = await tx
        .select()
        .from(payments)
        .where(eq(payments.customerId, customerId));

      // Compute current balance
      const balance = computeBalance(customerDebts, customerPayments);

      // Validate payment (REQ-5.4, REQ-5.5)
      const validation = validatePayment(amountTzs, balance);
      if (!validation.ok) {
        // Throw appropriate error
        if (balance === 0) {
          throw new LedgerError({
            kind: "PAYMENT_EXCEEDS_BALANCE",
            requested: amountTzs,
            balance: 0,
          });
        }

        if (amountTzs > balance) {
          throw new LedgerError({
            kind: "PAYMENT_EXCEEDS_BALANCE",
            requested: amountTzs,
            balance,
          });
        }

        // Other validation failure
        throw new LedgerError({
          kind: "INVALID_AMOUNT",
          amount: amountTzs,
          reason: validation.reason,
        });
      }

      // Insert payment (REQ-5.1)
      const [newPayment] = await tx
        .insert(payments)
        .values({
          customerId,
          amountTzs,
        })
        .returning();

      if (!newPayment) {
        throw new Error("Failed to create payment: .returning() returned undefined");
      }

      return {
        id: newPayment.id,
        customerId: newPayment.customerId,
        amountTzs: newPayment.amountTzs,
        createdAt: newPayment.createdAt,
      };
    });
  }

  /**
   * Get the balance for a customer.
   * REQ-6.1, REQ-6.2, REQ-6.3
   */
  async getCustomerBalance(customerId: number): Promise<Balance> {
    // Fetch customer
    const customer = await this.db.query.customers.findFirst({
      where: eq(customers.id, customerId),
    });

    if (!customer) {
      throw new LedgerError({
        kind: "NOT_FOUND",
        entity: "customer",
        id: customerId,
      });
    }

    // Fetch all debts and payments
    const customerDebts = await this.db.query.debts.findMany({
      where: eq(debts.customerId, customerId),
    });

    const customerPayments = await this.db.query.payments.findMany({
      where: eq(payments.customerId, customerId),
    });

    // Compute totals
    const debtTotal = customerDebts.reduce((sum, d) => sum + d.amountTzs, 0);
    const paymentTotal = customerPayments.reduce(
      (sum, p) => sum + p.amountTzs,
      0
    );
    const balance = computeBalance(customerDebts, customerPayments);

    return {
      customerId: customer.id,
      customerName: customer.name,
      customerPhoneE164: customer.phoneE164,
      amountTzs: balance,
      debtTotalTzs: debtTotal,
      paymentTotalTzs: paymentTotal,
    };
  }

  /**
   * List all debtors for a shop, sorted by amount owed (desc), excluding zero balances.
   * REQ-7.1, REQ-7.2, REQ-7.3, REQ-7.4
   */
  async listDebtors(
    shopId: number
  ): Promise<{ balances: Balance[]; grandTotalTzs: number }> {
    // Fetch all customers for this shop
    const shopCustomers = await this.db.query.customers.findMany({
      where: eq(customers.shopId, shopId),
    });

    // Compute balance for each customer
    const balances: Balance[] = [];

    for (const customer of shopCustomers) {
      // Fetch debts and payments
      const customerDebts = await this.db.query.debts.findMany({
        where: eq(debts.customerId, customer.id),
      });

      const customerPayments = await this.db.query.payments.findMany({
        where: eq(payments.customerId, customer.id),
      });

      // Compute balance
      const debtTotal = customerDebts.reduce((sum, d) => sum + d.amountTzs, 0);
      const paymentTotal = customerPayments.reduce(
        (sum, p) => sum + p.amountTzs,
        0
      );
      const balance = computeBalance(customerDebts, customerPayments);

      // Include only non-zero balances (REQ-7.2)
      if (balance > 0) {
        balances.push({
          customerId: customer.id,
          customerName: customer.name,
          customerPhoneE164: customer.phoneE164,
          amountTzs: balance,
          debtTotalTzs: debtTotal,
          paymentTotalTzs: paymentTotal,
        });
      }
    }

    // Sort by amount descending (REQ-7.3)
    balances.sort((a, b) => b.amountTzs - a.amountTzs);

    // Compute grand total (REQ-7.4)
    const grandTotalTzs = totalOwed(balances);

    return { balances, grandTotalTzs };
  }
}
