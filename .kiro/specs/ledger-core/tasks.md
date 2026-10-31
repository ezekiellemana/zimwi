# ledger-core — Tasks

Ordered implementation checklist. Each task references the requirement(s) it satisfies.

## Phase 1 — Server scaffolding

- [ ] **T1** Initialise the `server/` package: `package.json` with `"type": "module"`, TypeScript strict config (`tsconfig.json`), Node 24 engine field. — *(supports all REQs)*
- [ ] **T2** Install dependencies: `hono`, `drizzle-orm`, `@electric-sql/pglite`, `pglite` adapter for drizzle, `vitest`, `fast-check`, `drizzle-kit` (dev), `@types/node`, `tsx` (dev). Add `.env.example` listing `DATABASE_URL`. — *(tech.md)*
- [ ] **T3** Create directory skeleton: `server/src/db/`, `server/src/ledger/`, `server/test/ledger/`. Add `vitest.config.ts` with `test/` glob. — *(structure.md)*
- [ ] **T4** Add npm scripts: `test` → `vitest run`, `test:watch` → `vitest`, `db:generate` → `drizzle-kit generate`, `db:migrate` → `drizzle-kit migrate`. — *(tech.md)*

## Phase 2 — Pure domain layer

- [ ] **T5** Write `server/src/ledger/types.ts` with `Owner`, `Shop`, `Customer`, `Debt`, `Payment`, `Balance` interfaces. — *(design §2.3)*
- [ ] **T6** Write `server/src/ledger/phone.ts`: `normalisePhone(raw)` and `maskPhone(e164)`. — **REQ-9.1, REQ-9.2, REQ-9.3, REQ-9.4**
- [ ] **T7** Write `server/test/ledger/phone.test.ts`: table-driven normalisation cases + invalid-number rejection. — **REQ-9.1–9.4**
- [ ] **T8** Write `server/src/ledger/pure.ts`: `computeBalance`, `validatePayment`, `defaultDueDate`, `totalOwed`. — **REQ-5.4, REQ-5.5, REQ-6.1, REQ-6.2, REQ-8.1–8.4**
- [ ] **T9** Write `server/test/ledger/pure.test.ts`: unit tests for each pure function (empty, debts-only, debts+payments, raw difference with no clamping, due date exactly +7d). — **REQ-6.1, REQ-6.2, REQ-8.1–8.4**

## Phase 3 — Database schema and migrations

- [ ] **T10** Write `server/src/db/schema.ts` with Drizzle `pgTable` definitions for `owners`, `shops`, `customers`, `debts`, `payments`. Add unique index on `owners.phone_e164`, `unique` constraint on `shops.owner_id` (one shop per owner), composite unique index on `customers.shop_id + phone_e164`. Add foreign keys: `shops.owner_id → owners.id`, `customers.shop_id → shops.id`, `debts.customer_id → customers.id`, `payments.customer_id → customers.id`. Add `CHECK (amount_tzs > 0)` constraints on `debts` and `payments`. Amounts are `integer`. — **REQ-1.2, REQ-2.2, REQ-3.2, REQ-3.3, REQ-4.1, REQ-5.1**
- [ ] **T11** Set up Drizzle migration config (`drizzle.config.ts`) and generate the initial migration SQL into `server/drizzle/`. — *(tech.md)*
- [ ] **T12** Write `server/src/db/index.ts` exporting a helper to build a Drizzle client from a PGlite instance (for tests) or a connection string (for production Neon). — *(design §7.2)*

## Phase 4 — Repository layer

- [ ] **T13** Write `server/src/ledger/repository.ts`: `LedgerRepository` interface and Drizzle-backed implementation. Implement `findOrCreateOwner`, `getOwnerShop`, `createShop`, `findOrCreateCustomer`. — **REQ-1.1, REQ-1.2, REQ-1.3, REQ-1.4, REQ-2.1, REQ-2.2, REQ-3.1, REQ-3.2, REQ-3.3**
- [ ] **T14** Implement input validation in repository: reject shop names > 100 chars, customer names > 100 chars, invalid phones (delegate to `phone.ts`). — **REQ-2.3, REQ-3.4, REQ-3.5**
- [ ] **T15** Implement `recordDebt`: validate amount is positive integer (REQ-4.2, REQ-4.3), compute `dueDate` via `defaultDueDate` if not provided (REQ-4.4), truncate/validate note length (REQ-4.5), insert row. — **REQ-4.1–4.6**
- [ ] **T16** Implement `recordPayment`: open a DB transaction, `SELECT … FOR UPDATE` on the customer row, fetch debts+payments, `computeBalance`, `validatePayment`, reject if invalid (REQ-5.4, REQ-5.5, REQ-5.7), insert row, commit. — **REQ-5.1–5.7**
- [ ] **T17** Implement `getCustomerBalance`: fetch all debts and payments for a customer, return `Balance` with computed amounts. — **REQ-6.1, REQ-6.2, REQ-6.3**
- [ ] **T18** Implement `listDebtors`: fetch all customers for shop, compute each balance, sort desc, filter zero balances, compute grand total via `totalOwed`. — **REQ-7.1, REQ-7.2, REQ-7.3, REQ-7.4**
- [ ] **T19** Write `LedgerError` discriminated union and ensure repository throws `LedgerError` on all validation failures. — *(design §6)*

## Phase 5 — DB-backed tests with PGlite

- [ ] **T20** Write `server/test/ledger/repository.test.ts` harness: spin up PGlite, apply drizzle-kit generated SQL migrations from `server/drizzle/`, tear down after suite. — *(design §7.2)*
- [ ] **T21** Add DB test: create owner + shop, assert one shop per owner enforcement. — **REQ-1.1, REQ-1.2, REQ-1.3, REQ-1.4, REQ-2.2**
- [ ] **T22** Add DB test: add duplicate customer phone in same shop returns existing, duplicate phone in different shop is allowed. — **REQ-3.2, REQ-3.3**
- [ ] **T23** Add DB test: record debt with and without explicit due_date, assert default is +7 days. — **REQ-4.1, REQ-4.2, REQ-4.4, REQ-4.6**
- [ ] **T24** Add DB test: record payment that exceeds balance is rejected; exact-balance payment succeeds and yields zero balance. — **REQ-5.1, REQ-5.4, REQ-5.5, REQ-6.1, REQ-6.2**
- [ ] **T25** Add DB test: listDebtors returns sorted, zero-balance excluded, grand total correct. — **REQ-7.1, REQ-7.2, REQ-7.3, REQ-7.4**
- [ ] **T26** Add DB test: reject invalid phone, over-long names, non-integer amounts. — **REQ-2.3, REQ-3.4, REQ-3.5, REQ-4.2, REQ-4.3, REQ-5.2, REQ-5.3**

## Phase 6 — Property-based tests

- [ ] **T27** Add property test P1 to `pure.test.ts`: generate random valid debt+payment sequences, assert balance never negative after every prefix. — **REQ-8.1**
- [ ] **T28** Add property test P2 to `pure.test.ts`: shuffle payment order, assert final balance unchanged. — **REQ-8.2**
- [ ] **T29** Add property test P3 to `pure.test.ts`: generate N customers, assert totalOwed equals sum of individual balances. — **REQ-8.3**
- [ ] **T30** Add property test P4 to `pure.test.ts`: generate outstanding O and amount A > O, assert validatePayment rejects. — **REQ-8.4, REQ-5.4**
- [ ] **T31** Add property test P5 to `repository.test.ts`: generate a random sequence of debt/payment commands (some payments invalid → rejected), run against the real repository on PGlite, assert `getCustomerBalance` equals pure-model `computeBalance` and is `>= 0`. Keep `numRuns` small (25) for speed. — **REQ-8.5**
- [ ] **T32** Run full suite (`npm test`), confirm all unit + property + DB tests pass. — *(tech.md)*
