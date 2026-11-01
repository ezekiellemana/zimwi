// Property-based tests for the USSD state machine (T34-T36).
// Uses fast-check to verify universal properties over random histories.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { replay } from "../../src/ussd/core.js";
import type { UssdContext } from "../../src/ussd/context.js";
import type { Balance, Customer } from "../../src/ledger/types.js";

// ── Fake context builders ─────────────────────────────────────────────

function mkCustomer(id: number, name: string, phone: string): Customer {
  return {
    id,
    shopId: 1,
    name,
    phoneE164: phone,
    createdAt: new Date("2026-01-01"),
  };
}

function mkBalance(id: number, name: string, phone: string, amount: number): Balance {
  return {
    customerId: id,
    customerName: name,
    customerPhoneE164: phone,
    amountTzs: amount,
    debtTotalTzs: amount,
    paymentTotalTzs: 0,
  };
}

/** Context with no shop — minimal, tests the registration / no-shop paths. */
function noShopContext(): UssdContext {
  return {
    shopName: null,
    ownerId: 1,
    shopId: null,
    topDebtors: [],
    findCustomerByPhone: () => null,
  };
}

/**
 * Worst-case context: 100-char shop name, 5 debtors with long names and
 * 7-digit balances.  Exercises the longest possible screens.
 */
function worstCaseContext(): UssdContext {
  const longShopName = "A".repeat(100);
  const customers: Customer[] = [];
  const debtors: Balance[] = [];
  const phones = [
    "+255712345601",
    "+255712345602",
    "+255712345603",
    "+255712345604",
    "+255712345605",
  ];
  const names = [
    "MwakikagileMzee",
    "MasharubuJabari",
    "Supercalifragilis",
    "MamaAshaNyamaza",
    "BabaJumaMkubwaS",
  ];
  const amounts = [9_999_999, 8_888_888, 7_777_777, 6_666_666, 5_555_555];

  for (let i = 0; i < 5; i++) {
    const phone = phones[i]!;
    const name = names[i]!;
    const amount = amounts[i]!;
    customers.push(mkCustomer(i + 1, name, phone));
    debtors.push(mkBalance(i + 1, name, phone, amount));
  }

  const customerMap = new Map<string, Customer>();
  for (const c of customers) {
    customerMap.set(c.phoneE164, c);
  }

  return {
    shopName: longShopName,
    ownerId: 1,
    shopId: 1,
    topDebtors: debtors,
    findCustomerByPhone(phone: string): Customer | null {
      return customerMap.get(phone) ?? null;
    },
  };
}

// ── History generator ──────────────────────────────────────────────────

/**
 * Generates a USSD history string as the AT gateway would deliver it:
 * inputs joined by "*".  Includes navigation keys, empty segments, and
 * arbitrary unicode to stress the state machine.
 */
const historyArb = fc.array(
  fc.oneof(
    fc.string({ maxLength: 50 }),
    fc.constant("0"),
    fc.constant("00"),
    fc.constant("*"),
    fc.constant(""),
    fc.unicodeString({ maxLength: 20 }),
  ),
).map((parts) => parts.join("*"));

// ── Contexts to test against ────────────────────────────────────────────

const contexts: { name: string; ctx: () => UssdContext }[] = [
  { name: "no shop", ctx: noShopContext },
  { name: "worst-case shop", ctx: worstCaseContext },
];

// ── T34: P1 — never throws ──────────────────────────────────────────────

for (const { name, ctx } of contexts) {
  describe(`T34 — P1 never throws (${name})`, () => {
    it("replay(history, context) never throws for any random history", () => {
      fc.assert(
        fc.property(historyArb, (history) => {
          // Must not throw — no assertion on output shape here.
          replay(history, ctx());
        }),
        { numRuns: 500 },
      );
    });
  });
}

// ── T35: P2 — screen constraints ───────────────────────────────────────

for (const { name, ctx } of contexts) {
  describe(`T35 — P2 screen constraints (${name})`, () => {
    it("every screen <= 182 chars and starts with CON or END", () => {
      fc.assert(
        fc.property(historyArb, (history) => {
          const result = replay(history, ctx());
          expect(result.screen.length).toBeLessThanOrEqual(182);
          const ok =
            result.screen.startsWith("CON ") ||
            result.screen.startsWith("END ");
          expect(ok).toBe(true);
        }),
        { numRuns: 500 },
      );
    });
  });
}

// ── T36: P3 — determinism ──────────────────────────────────────────────

for (const { name, ctx } of contexts) {
  describe(`T36 — P3 determinism (${name})`, () => {
    it("replay(history, context) is deterministic (same input → same output)", () => {
      fc.assert(
        fc.property(historyArb, (history) => {
          const a = replay(history, ctx());
          const b = replay(history, ctx());
          expect(a.screen).toBe(b.screen);
          expect(a.state).toEqual(b.state);
          expect(a.effects).toEqual(b.effects);
        }),
        { numRuns: 500 },
      );
    });
  });
}
