# ledger-core — Design

## 1. Architecture overview

The ledger lives entirely in `server/src/ledger/` with a companion schema in `server/src/db/`. The folder follows the steering rule: **keep pure logic separate from I/O**, so that the ledger maths can be property-tested without a database or network.

```
server/src/
  ledger/
    pure.ts        # pure ledger functions (no I/O)
    phone.ts       # phone normalisation (pure)
    repository.ts  # DB access layer (I/O, depends on db + pure)
    types.ts       # shared domain types (Customer, Debt, Payment, Balance)
  db/
    schema.ts      # Drizzle schema definitions
    index.ts        # exports db client + helpers
```

The split enables two test tiers:

1. **Pure tests** (`server/test/ledger/pure.test.ts`) — import only `pure.ts`/`phone.ts`. No database. Run on every CI worker.
2. **DB tests** (`server/test/ledger/repository.test.ts`) — use PGlite in-process so no external Postgres is required.

## 2. Data model

### 2.1 Entity relationships

```
owner (1) ──< shop (1, enforced)
shop (1) ──< customer (n)
customer (1) ──< debt (n)
customer (1) ──< payment (n)
```

One owner has exactly one shop (unique index on `ownerId`). A customer's phone is unique per shop (composite unique index on `shopId + phoneE164`). Debts and payments reference a customer.

### 2.2 Drizzle schema (`server/src/db/schema.ts`)

```ts
import { pgTable, serial, integer, timestamp, uniqueIndex, unique, varchar, foreignKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const owners = pgTable("owners", {
  id: serial("id").primaryKey(),
  phoneE164: varchar("phone_e164", { length: 15 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const shops = pgTable(
  "shops",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerFk: foreignKey({ columns: [t.ownerId], foreignColumns: [owners.id] }),
    ownerUnique: unique("shops_owner_unique").on(t.ownerId),
  }),
);

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    shopId: integer("shop_id").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    phoneE164: varchar("phone_e164", { length: 15 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    shopFk: foreignKey({ columns: [t.shopId], foreignColumns: [shops.id] }),
    // phone unique per shop
    shopPhoneIdx: uniqueIndex("customers_shop_phone_idx").on(t.shopId, t.phoneE164),
  }),
);

export const debts = pgTable(
  "debts",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id").notNull(),
    amountTzs: integer("amount_tzs").notNull(),
    note: varchar("note", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  },
  (t) => ({
    customerFk: foreignKey({ columns: [t.customerId], foreignColumns: [customers.id] }),
    amountCheck: check("debts_amount_positive", sql`${t.amountTzs} > 0`),
  }),
);

export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id").notNull(),
    amountTzs: integer("amount_tzs").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    customerFk: foreignKey({ columns: [t.customerId], foreignColumns: [customers.id] }),
    amountCheck: check("payments_amount_positive", sql`${t.amountTzs} > 0`),
  }),
);
```

Key points:
- Amount columns are `integer` (Postgres 32-bit int, max ~2.1 billion TZS — well above any duka debt). Never use `numeric`/`float`/`real`.
- `due_date` defaults to `created_at + 7 days` at the application layer (computed in `pure.ts`), not via a DB `default`, so the same logic is testable without a DB.
- Foreign keys are declared explicitly: `shops.owner_id → owners.id`, `customers.shop_id → shops.id`, `debts.customer_id → customers.id`, `payments.customer_id → customers.id`.
- `CHECK (amount_tzs > 0)` constraints on `debts` and `payments` enforce positive amounts at the DB level in addition to application-layer validation.

### 2.3 Types (`server/src/ledger/types.ts`)

```ts
export interface Owner {
  id: number;
  phoneE164: string;
  createdAt: Date;
}

export interface Shop {
  id: number;
  ownerId: number;
  name: string;
  createdAt: Date;
}

export interface Customer {
  id: number;
  shopId: number;
  name: string;
  phoneE164: string;
  createdAt: Date;
}

export interface Debt {
  id: number;
  customerId: number;
  amountTzs: number;   // integer > 0
  note: string | null;
  createdAt: Date;
  dueDate: Date;       // createdAt + 7 days by default
}

export interface Payment {
  id: number;
  customerId: number;
  amountTzs: number;   // integer > 0
  createdAt: Date;
}

export interface Balance {
  customerId: number;
  customerName: string;
  customerPhoneE164: string;
  amountTzs: number;   // >= 0
  debtTotalTzs: number;
  paymentTotalTzs: number;
}
```

## 3. Phone normalisation (`server/src/ledger/phone.ts`)

Pure module. Exports `normalisePhone(raw: string): string` and `maskPhone(e164: string): string`.

Rules:
1. Strip whitespace and leading `+`.
2. If the local prefix `0` is present, drop it → `255712345678`.
3. If the number starts with `7` and is 9 digits long, prepend `255` → `255712345678`.
4. If it starts with `255` and is 12 digits long, accept.
5. Prepend `+` → `+255712345678`.
6. Validate: `^\+255[67]\d{8}$` (Tanzanian mobile: prefixes `6` or `7`).
7. `maskPhone` returns `+2557XX XXX 123` style — replace middle digits.

## 4. Pure ledger functions (`server/src/ledger/pure.ts`)

No imports from `db/` or any I/O module. All functions take plain data and return plain data.

```ts
// Compose a customer's balance from its debts and payments.
export function computeBalance(
  debts: Pick<Debt, "amountTzs">[],
  payments: Pick<Payment, "amountTzs">[],
): number

// Validate that a payment can be applied without exceeding outstanding.
export function validatePayment(
  amountTzs: number,
  outstandingBalance: number,
): { ok: true } | { ok: false; reason: string }

// Compute default due date from a created_at.
export function defaultDueDate(createdAt: Date): Date

// Sum balances across customers; assert total == sum of individuals.
export function totalOwed(balances: { amountTzs: number }[]): number
```

`computeBalance`:
```ts
const debtSum = debts.reduce((s, d) => s + d.amountTzs, 0);
const paySum  = payments.reduce((s, p) => s + p.amountTzs, 0);
return debtSum - paySum;   // exact difference; non-negativity guaranteed by validatePayment (REQ-5.4)
```

`validatePayment` rejects when `amountTzs <= 0`, non-integer, or `amountTzs > outstandingBalance`.

## 5. Repository layer (`server/src/ledger/repository.ts`)

Thin I/O wrapper around Drizzle. Each method maps to one DB query and delegates maths to `pure.ts`.

```ts
export interface LedgerRepository {
  findOrCreateOwner(phoneE164: string): Promise<Owner>
  getOwnerShop(ownerId: number): Promise<Shop | null>
  createShop(ownerId: number, name: string): Promise<Shop>
  findOrCreateCustomer(shopId: number, name: string, phoneE164: string): Promise<Customer>
  recordDebt(customerId: number, amountTzs: number, dueDate: Date, note: string | null): Promise<Debt>
  recordPayment(customerId: number, amountTzs: number): Promise<Payment>
  getCustomerBalance(customerId: number): Promise<Balance>
  listDebtors(shopId: number): Promise<{ balances: Balance[]; grandTotalTzs: number }>
}
```

`recordPayment` flow:
1. Begin a database transaction.
2. `SELECT … FOR UPDATE` on the customer row to lock it (prevents concurrent overdraw).
3. Fetch all debts + payments for the customer.
4. `computeBalance` → outstanding.
5. `validatePayment(amount, outstanding)` — if invalid, throw `LedgerError` (transaction rolls back).
6. Insert payment row.
7. Commit the transaction.

`listDebtors`:
1. Query all customers for the shop.
2. For each, compute balance (single query aggregating debts/payments per customer, or fetch all rows and group in JS).
3. Sort by `amountTzs` desc, filter out zero balances.
4. `grandTotalTzs = sum(balances)` via `totalOwed`.

## 6. Error handling

A discriminated union `LedgerError`:

```ts
export type LedgerError =
  | { kind: "INVALID_AMOUNT"; amount: number; reason: string }    // <= 0 or non-integer
  | { kind: "PAYMENT_EXCEEDS_BALANCE"; requested: number; balance: number }
  | { kind: "INVALID_PHONE"; raw: string }
  | { kind: "NAME_TOO_LONG"; max: number; actual: number }
  | { kind: "SHOP_NAME_TOO_LONG"; max: number; actual: number }
  | { kind: "NOT_FOUND"; entity: string; id: number };
```

The repository throws these; Hono routes (later specs) translate them to HTTP 400 with a JSON body. Pure functions return `{ ok: false }` discriminants so they can be property-tested without try/catch.

## 7. Testing strategy

### 7.1 Test runner and layout

- **Runner:** Vitest.
- **Property testing:** fast-check.
- **Layout:** `server/test/ledger/`

```
server/test/
  ledger/
    pure.test.ts          # pure function unit tests + property tests
    phone.test.ts         # phone normalisation tests (table-driven + property)
    repository.test.ts    # DB-backed tests using PGlite
```

### 7.2 DB tests without external Postgres

Use `@electric-sql/pglite` with `drizzle-orm/pglite`. Each test file calls `new PGlite()` in a `beforeAll`, applies the drizzle-kit generated SQL migrations from `server/drizzle/`, and tears down in `afterAll`. No Docker, no network, runs in any CI worker. The schema imports are shared with production (`server/src/db/schema.ts`).

### 7.3 Property tests (fast-check)

These correspond to REQ-8.x and must all pass.

| # | Property | fast-check strategy | Asserts |
|---|----------|---------------------|---------|
| P1 (REQ-8.1) | Balance never negative | Arbitrary sequence of `{kind:'debt', amount}` and `{kind:'payment', amount}` ops; only payments that pass `validatePayment` against the running balance are recorded (invalid ones are dropped, not clamped) | raw `computeBalance(debts, payments) >= 0` after every prefix |
| P2 (REQ-8.2) | Payment order independence | Generate a set of debts and a set of valid payments; shuffle payment order with `fc.shuffle` | Final balance identical for all orderings |
| P3 (REQ-8.3) | Total owed = sum of balances | Generate N customers each with random debts/payments | `totalOwed(balances) === balances.reduce((s,b)=>s+b.amountTzs,0)` |
| P4 (REQ-8.4) | Over-payment always rejected | Generate outstanding balance O and amount A where A > O | `validatePayment(A, O).ok === false` |
| P5 (REQ-8.5) | Repository matches pure model | Random sequence of debt/payment commands (some payments invalid → rejected) run against the real repository on PGlite | `getCustomerBalance` equals pure-model `computeBalance` and is `>= 0`; `numRuns` kept small (25) for speed |

Arbitraries:
```ts
const amountArb = fc.integer({ min: 1, max: 1_000_000 });           // positive TZS
const debtOpArb = fc.record({ kind: fc.constant('debt'), amount: amountArb });
const payOpArb  = fc.record({ kind: fc.constant('payment'), amount: amountArb });
const phoneArb  = fc.stringMatching(/^\+255[67]\d{8}$/);
```

For P1, the arbitrary sequence generator applies debts unconditionally, but for payments it first computes the running balance and skips the payment when it would exceed the balance (invalid payments are dropped, never clamped) — mirroring the repository's `recordPayment` guard. The test then asserts the in-memory ledger's balance equals `computeBalance(debts, payments)` and is `>= 0`.

### 7.4 Unit tests

- Phone normalisation: table-driven cases for local `0`-prefix, bare `7…`, `+255` already present, invalid (too short, wrong prefix, letters).
- `validatePayment`: zero, negative, non-integer, exact balance, over balance.
- `defaultDueDate`: exactly 7 days after `created_at`.
- `computeBalance`: empty, debts only, debts+payments, payments = debts (zero), raw difference with no clamping.
