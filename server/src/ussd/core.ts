// USSD pure state machine: render, step, replay.
// Design §3.  Pure — no db/repository/telecom imports, no Date.now, no randomness.
//
// step and replay never throw: normalisePhone is wrapped in try/catch,
// unexpected nodes/inputs produce an error re-prompt.

import type { UssdState, UssdNode, Language } from "./state.js";
import { initialState } from "./state.js";
import type { UssdContext } from "./context.js";
import type { UssdEffect } from "./effects.js";
import { copy, formatTsh } from "./messages.copy.js";
import { normalisePhone, maskPhone } from "../ledger/phone.js";

// ── re-exports ──────────────────────────────────────────────────────────

export { initialState, formatTsh };

// ── types ───────────────────────────────────────────────────────────────

interface StepResult {
  screen: string;
  state: UssdState;
  effects: UssdEffect[];
}

// ── helpers ─────────────────────────────────────────────────────────────

/** Push current node onto backStack and transition to nextNode. */
function forwardTo(state: UssdState, nextNode: UssdNode): UssdState {
  return {
    ...state,
    node: nextNode,
    backStack: [...state.backStack, state.node],
  };
}

/** Parse a positive integer amount string. Returns null on invalid input. */
function parseAmount(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n <= 0) {
    return null;
  }
  return n;
}

/** Look up a customer's balance from topDebtors by phone. Returns 0 if not found. */
function balanceFromContext(context: UssdContext, phone: string): number {
  const debtor = context.topDebtors.find((d) => d.customerPhoneE164 === phone);
  return debtor ? debtor.amountTzs : 0;
}

/** Map topDebtors to { name, phone, amount } for copy templates that take phone. */
function debtorsWithPhone(
  context: UssdContext,
): { name: string; phone: string; amount: string }[] {
  return context.topDebtors.map((d) => ({
    name: d.customerName,
    phone: maskPhone(d.customerPhoneE164),
    amount: formatTsh(d.amountTzs),
  }));
}

/** Map topDebtors to { name, amount } for copy templates that don't take phone. */
function debtorsNoPhone(
  context: UssdContext,
): { name: string; amount: string }[] {
  return context.topDebtors.map((d) => ({
    name: d.customerName,
    amount: formatTsh(d.amountTzs),
  }));
}

/** Safe END screen for unexpected errors. ≤ 182 chars, starts with "END ". */
function safeEndScreen(language: Language): string {
  return language === "sw"
    ? "END Hitilafu imetokea. Jaribu tena."
    : "END An error occurred. Try again.";
}

/**
 * Shared shop-name input handler for `register_shop` node and `main` node
 * when no shop exists yet.  Validates name length (1–100 chars, REQ-4.4).
 */
function handleRegisterShop(
  state: UssdState,
  input: string,
  context: UssdContext,
): StepResult {
  const name = input.trim();
  if (name.length === 0 || name.length > 100) {
    return {
      screen: copy[state.language].registerShopPrompt(),
      state,
      effects: [],
    };
  }
  const ns = forwardTo({ ...state, shopName: name }, "register_shop_confirm");
  return { screen: render(ns, context), state: ns, effects: [] };
}

// ── render ──────────────────────────────────────────────────────────────

/**
 * Produce the screen for the current state without consuming an input.
 * Design §3.1.  Dispatches on state.node and calls copy[language] templates.
 * Every screen starts with "CON " or "END " and is ≤ 182 chars.
 */
export function render(state: UssdState, context: UssdContext): string {
  const c = copy[state.language];

  switch (state.node) {
    case "main": {
      if (context.shopName === null) {
        return c.registerShopPrompt();
      }
      return c.mainMenu(context.shopName);
    }

    case "register_shop":
      return c.registerShopPrompt();

    case "register_shop_confirm":
      return c.registerShopConfirm(state.shopName ?? "");

    case "add_debt_phone":
      return c.addDebtPhonePrompt();

    case "add_debt_name":
      return c.addDebtNamePrompt();

    case "add_debt_amount":
      return c.addDebtAmountPrompt(state.customerName ?? "");

    case "add_debt_confirm":
      return c.addDebtConfirm(
        state.customerName ?? "",
        formatTsh(state.amount ?? 0),
      );

    case "payment_select":
      return c.paymentSelect(debtorsWithPhone(context));

    case "payment_phone":
      return c.paymentPhonePrompt();

    case "payment_amount":
      return c.paymentAmountPrompt(
        state.customerName ?? "",
        formatTsh(state.customerBalance ?? 0),
      );

    case "payment_confirm":
      return c.paymentConfirm(
        state.customerName ?? "",
        formatTsh(state.amount ?? 0),
      );

    case "who_owes": {
      const total = context.topDebtors.reduce(
        (sum, d) => sum + d.amountTzs,
        0,
      );
      return c.whoOwes(debtorsWithPhone(context), formatTsh(total));
    }

    case "reminder_select":
      return c.reminderSelect(debtorsNoPhone(context));

    case "reminder_confirm":
      return c.reminderConfirm(
        state.customerName ?? "",
        formatTsh(state.customerBalance ?? 0),
      );

    default:
      return safeEndScreen(state.language);
  }
}

// ── step ────────────────────────────────────────────────────────────────

/**
 * Process one input and return the next screen, state, and effects.
 * Design §3.1, §3.3, §3.4.  Never throws for any input.
 *
 * Global inputs (handled before node-specific logic):
 *  - "0"  → pop backStack, go to previous node (or stay if main / empty stack)
 *  - "00" → clear backStack, go to main (or register_shop if no shop)
 */
export function step(
  state: UssdState,
  input: string,
  context: UssdContext,
): StepResult {
  const c = copy[state.language];

  // ── Global: "0" → go back one step ──────────────────────────────────

  if (input === "0") {
    if (state.node === "main") {
      return { screen: render(state, context), state, effects: [] };
    }
    const backStack = [...state.backStack];
    const prevNode = backStack.pop();
    if (prevNode === undefined) {
      return { screen: render(state, context), state, effects: [] };
    }
    const newState: UssdState = { ...state, node: prevNode, backStack };
    return { screen: render(newState, context), state: newState, effects: [] };
  }

  // ── Global: "00" → go to main (or register_shop if no shop) ────────

  if (input === "00") {
    const targetNode: UssdNode =
      context.shopName === null ? "register_shop" : "main";
    const newState: UssdState = { ...state, node: targetNode, backStack: [] };
    return { screen: render(newState, context), state: newState, effects: [] };
  }

  // ── Node-specific logic ───────────────────────────────────────────

  switch (state.node) {
    // ── main ─────────────────────────────────────────────────────────

    case "main": {
      // No shop → registration flow (treat input as shop name)
      if (context.shopName === null) {
        return handleRegisterShop(state, input, context);
      }
      // Shop exists → main menu options
      switch (input) {
        case "1": {
          const ns = forwardTo(state, "add_debt_phone");
          return { screen: render(ns, context), state: ns, effects: [] };
        }
        case "2": {
          const ns = forwardTo(state, "payment_select");
          return { screen: render(ns, context), state: ns, effects: [] };
        }
        case "3": {
          const ns = forwardTo(state, "who_owes");
          return { screen: render(ns, context), state: ns, effects: [] };
        }
        case "4": {
          const ns = forwardTo(state, "reminder_select");
          return { screen: render(ns, context), state: ns, effects: [] };
        }
        case "5": {
          // Toggle language, stay on main (no backStack push)
          const newLang: Language = state.language === "sw" ? "en" : "sw";
          const ns: UssdState = { ...state, language: newLang };
          return { screen: render(ns, context), state: ns, effects: [] };
        }
        default:
          // Invalid menu option → re-prompt
          return { screen: render(state, context), state, effects: [] };
      }
    }

    // ── register_shop ────────────────────────────────────────────────

    case "register_shop":
      return handleRegisterShop(state, input, context);

    // ── register_shop_confirm ────────────────────────────────────────

    case "register_shop_confirm": {
      if (input === "1") {
        // Confirm → createShop effect + END screen
        const effects: UssdEffect[] = [
          {
            kind: "createShop",
            ownerId: context.ownerId,
            name: state.shopName ?? "",
          },
        ];
        return {
          screen: c.registerShopDone(state.shopName ?? ""),
          state,
          effects,
        };
      }
      // Cancel → back to register_shop (no push)
      const ns: UssdState = { ...state, node: "register_shop" };
      return { screen: render(ns, context), state: ns, effects: [] };
    }

    // ── add_debt_phone ───────────────────────────────────────────────

    case "add_debt_phone": {
      let phone: string;
      try {
        phone = normalisePhone(input);
      } catch {
        // Invalid phone format → re-prompt
        return { screen: c.invalidPhone(), state, effects: [] };
      }
      const customer = context.findCustomerByPhone(phone);
      if (customer !== null) {
        // Existing customer → skip name, go to amount
        const ns = forwardTo(
          {
            ...state,
            customerId: customer.id,
            customerName: customer.name,
            customerPhone: phone,
          },
          "add_debt_amount",
        );
        return { screen: render(ns, context), state: ns, effects: [] };
      }
      // New customer → go to name entry
      const ns = forwardTo(
        { ...state, customerPhone: phone },
        "add_debt_name",
      );
      return { screen: render(ns, context), state: ns, effects: [] };
    }

    // ── add_debt_name ────────────────────────────────────────────────

    case "add_debt_name": {
      const name = input.trim();
      if (name.length === 0) {
        return { screen: c.addDebtNamePrompt(), state, effects: [] };
      }
      const ns = forwardTo(
        { ...state, customerName: name },
        "add_debt_amount",
      );
      return { screen: render(ns, context), state: ns, effects: [] };
    }

    // ── add_debt_amount ──────────────────────────────────────────────

    case "add_debt_amount": {
      const amount = parseAmount(input);
      if (amount === null) {
        return { screen: c.invalidAmount(), state, effects: [] };
      }
      const ns = forwardTo({ ...state, amount }, "add_debt_confirm");
      return { screen: render(ns, context), state: ns, effects: [] };
    }

    // ── add_debt_confirm ─────────────────────────────────────────────

    case "add_debt_confirm": {
      if (input === "1") {
        // Confirm → recordDebt effect + END screen
        if (context.shopId === null) {
          return { screen: safeEndScreen(state.language), state, effects: [] };
        }
        const effects: UssdEffect[] = [
          {
            kind: "recordDebt",
            shopId: context.shopId,
            customerPhone: state.customerPhone ?? "",
            customerName: state.customerName ?? "",
            amountTzs: state.amount ?? 0,
          },
        ];
        return {
          screen: c.addDebtDone(
            state.customerName ?? "",
            formatTsh(state.amount ?? 0),
          ),
          state,
          effects,
        };
      }
      // Cancel → back to add_debt_amount (no push)
      const ns: UssdState = { ...state, node: "add_debt_amount" };
      return { screen: render(ns, context), state: ns, effects: [] };
    }

    // ── payment_select ───────────────────────────────────────────────

    case "payment_select": {
      // "6" → manual phone entry
      if (input === "6") {
        const ns = forwardTo(state, "payment_phone");
        return { screen: render(ns, context), state: ns, effects: [] };
      }
      // "1"–"5" → select debtor from topDebtors
      if (!/^\d+$/.test(input)) {
        return { screen: render(state, context), state, effects: [] };
      }
      const n = parseInt(input, 10);
      if (Number.isNaN(n) || n < 1 || n > context.topDebtors.length) {
        return { screen: render(state, context), state, effects: [] };
      }
      const debtor = context.topDebtors[n - 1];
      if (debtor === undefined) {
        return { screen: render(state, context), state, effects: [] };
      }
      const ns = forwardTo(
        {
          ...state,
          customerId: debtor.customerId,
          customerName: debtor.customerName,
          customerBalance: debtor.amountTzs,
          customerPhone: debtor.customerPhoneE164,
        },
        "payment_amount",
      );
      return { screen: render(ns, context), state: ns, effects: [] };
    }

    // ── payment_phone ────────────────────────────────────────────────

    case "payment_phone": {
      let phone: string;
      try {
        phone = normalisePhone(input);
      } catch {
        return { screen: c.invalidPhone(), state, effects: [] };
      }
      const customer = context.findCustomerByPhone(phone);
      if (customer === null) {
        return { screen: c.customerNotFound(), state, effects: [] };
      }
      const balance = balanceFromContext(context, phone);
      const ns = forwardTo(
        {
          ...state,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: phone,
          customerBalance: balance,
        },
        "payment_amount",
      );
      return { screen: render(ns, context), state: ns, effects: [] };
    }

    // ── payment_amount ──────────────────────────────────────────────

    case "payment_amount": {
      const amount = parseAmount(input);
      if (amount === null) {
        return { screen: c.invalidAmount(), state, effects: [] };
      }
      const balance = state.customerBalance ?? 0;
      if (amount > balance) {
        // Over-payment → re-prompt showing current balance
        return {
          screen: c.paymentOverPayment(
            state.customerName ?? "",
            formatTsh(balance),
          ),
          state,
          effects: [],
        };
      }
      const ns = forwardTo({ ...state, amount }, "payment_confirm");
      return { screen: render(ns, context), state: ns, effects: [] };
    }

    // ── payment_confirm ─────────────────────────────────────────────

    case "payment_confirm": {
      if (input === "1") {
        // Confirm → recordPayment effect + END screen
        const customerId = state.customerId;
        if (customerId === undefined) {
          return { screen: safeEndScreen(state.language), state, effects: [] };
        }
        const effects: UssdEffect[] = [
          {
            kind: "recordPayment",
            customerId,
            amountTzs: state.amount ?? 0,
          },
        ];
        return {
          screen: c.paymentDone(
            state.customerName ?? "",
            formatTsh(state.amount ?? 0),
          ),
          state,
          effects,
        };
      }
      // Cancel → back to payment_amount (no push)
      const ns: UssdState = { ...state, node: "payment_amount" };
      return { screen: render(ns, context), state: ns, effects: [] };
    }

    // ── who_owes (terminal — no-op) ──────────────────────────────────

    case "who_owes":
      // Terminal END screen; step should not be reached here.
      return { screen: render(state, context), state, effects: [] };

    // ── reminder_select ──────────────────────────────────────────────

    case "reminder_select": {
      if (!/^\d+$/.test(input)) {
        return { screen: render(state, context), state, effects: [] };
      }
      const n = parseInt(input, 10);
      if (Number.isNaN(n) || n < 1 || n > context.topDebtors.length) {
        return { screen: render(state, context), state, effects: [] };
      }
      const debtor = context.topDebtors[n - 1];
      if (debtor === undefined) {
        return { screen: render(state, context), state, effects: [] };
      }
      const ns = forwardTo(
        {
          ...state,
          customerId: debtor.customerId,
          customerName: debtor.customerName,
          customerPhone: debtor.customerPhoneE164,
          customerBalance: debtor.amountTzs,
        },
        "reminder_confirm",
      );
      return { screen: render(ns, context), state: ns, effects: [] };
    }

    // ── reminder_confirm ─────────────────────────────────────────────

    case "reminder_confirm": {
      if (input === "1") {
        // Confirm → sendReminder effect + END screen
        const phone = state.customerPhone;
        if (phone === undefined || phone === "") {
          return { screen: safeEndScreen(state.language), state, effects: [] };
        }
        const shopName = context.shopName ?? "";
        const amount = formatTsh(state.customerBalance ?? 0);
        const message = c.reminderSms(
          state.customerName ?? "",
          shopName,
          amount,
        );
        const effects: UssdEffect[] = [
          { kind: "sendReminder", to: phone, message },
        ];
        return {
          screen: c.reminderDone(state.customerName ?? ""),
          state,
          effects,
        };
      }
      // Cancel → back to reminder_select (no push)
      const ns: UssdState = { ...state, node: "reminder_select" };
      return { screen: render(ns, context), state: ns, effects: [] };
    }

    // ── unexpected node → safe re-prompt ─────────────────────────────

    default:
      return { screen: render(state, context), state, effects: [] };
  }
}

// ── replay ──────────────────────────────────────────────────────────────

/**
 * Split history on "*", fold through step from initialState, return final result.
 * Design §3.2.  Deterministic: same history + same context → same output.
 *
 * Empty text → no inputs → render(initialState, context).
 * Effects from intermediate steps are discarded; only the final step's
 * effects survive (confirmation screens are END, so no further inputs arrive).
 */
export function replay(
  history: string,
  context: UssdContext,
): StepResult {
  const inputs = history.split("*").filter((s) => s !== "");
  let state = initialState();
  let screen = render(state, context);
  let effects: UssdEffect[] = [];

  for (const input of inputs) {
    const result = step(state, input, context);
    state = result.state;
    screen = result.screen;
    effects = result.effects;
  }

  return { screen, state, effects };
}
