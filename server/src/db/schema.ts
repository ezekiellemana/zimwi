/**
 * Drizzle ORM schema for ZIMWI ledger.
 * REQ-1.2, REQ-2.2, REQ-3.2, REQ-3.3, REQ-4.1, REQ-5.1
 */

import {
  pgTable,
  serial,
  integer,
  timestamp,
  varchar,
  foreignKey,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const owners = pgTable("owners", {
  id: serial("id").primaryKey(),
  phoneE164: varchar("phone_e164", { length: 15 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const shops = pgTable(
  "shops",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    ownerFk: foreignKey({
      columns: [t.ownerId],
      foreignColumns: [owners.id],
    }),
    // One shop per owner
    ownerUnique: unique("shops_owner_unique").on(t.ownerId),
  })
);

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    shopId: integer("shop_id").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    phoneE164: varchar("phone_e164", { length: 15 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    shopFk: foreignKey({
      columns: [t.shopId],
      foreignColumns: [shops.id],
    }),
    // Phone unique per shop (composite unique)
    shopPhoneUnique: unique("customers_shop_phone_unique").on(
      t.shopId,
      t.phoneE164
    ),
  })
);

export const debts = pgTable(
  "debts",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id").notNull(),
    amountTzs: integer("amount_tzs").notNull(),
    note: varchar("note", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  },
  (t) => ({
    customerFk: foreignKey({
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }),
    // Amount must be positive
    amountCheck: check("debts_amount_positive", sql`${t.amountTzs} > 0`),
  })
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id").notNull(),
    amountTzs: integer("amount_tzs").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    customerFk: foreignKey({
      columns: [t.customerId],
      foreignColumns: [customers.id],
    }),
    // Amount must be positive
    amountCheck: check("payments_amount_positive", sql`${t.amountTzs} > 0`),
  })
);
