// USSD context: data + lookup injected by the route.
// Design §2.3.
// Pure interface — no db / repository imports.

import type { Balance, Customer } from "../ledger/types.js";

export interface UssdContext {
  /** Shop name (null = no shop yet -> registration flow). */
  shopName: string | null;
  /** Owner id (caller). */
  ownerId: number;
  /** Shop id (null until shop created). */
  shopId: number | null;
  /** Top 5 debtors by balance (pre-loaded by route). */
  topDebtors: Balance[];
  /** Customer lookup by normalised E.164 phone. */
  findCustomerByPhone: (phoneE164: string) => Customer | null;
}
