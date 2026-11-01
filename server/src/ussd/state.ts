// USSD state machine types.
// Design §2.1, §2.2.

export type Language = "sw" | "en";

export type UssdNode =
  | "main"
  | "register_shop"
  | "register_shop_confirm"
  | "add_debt_phone"
  | "add_debt_name"
  | "add_debt_amount"
  | "add_debt_confirm"
  | "payment_select"
  | "payment_phone"
  | "payment_amount"
  | "payment_confirm"
  | "who_owes"
  | "reminder_select"
  | "reminder_confirm";

export interface UssdState {
  node: UssdNode;
  language: Language;
  /** Shop name during registration. */
  shopName?: string;
  /** Normalised E.164 customer phone. */
  customerPhone?: string;
  /** Customer name (new customers in add-debt flow). */
  customerName?: string;
  /** Customer id (existing customers for payment / reminder). */
  customerId?: number;
  /** Outstanding balance (payment flow). */
  customerBalance?: number;
  /** Parsed integer TZS amount. */
  amount?: number;
  /** Back-navigation stack of node ids. */
  backStack: UssdNode[];
}

/**
 * Initial USSD state: Swahili, main menu, empty back-stack.
 * The route may override `node` to `register_shop` via context.shopName.
 */
export function initialState(): UssdState {
  return {
    node: "main",
    language: "sw",
    backStack: [],
  };
}
