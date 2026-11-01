// USSD copy templates: Swahili + English screen text and reminder SMS.
// Design §6.  Pure module — no I/O imports.
//
// Every screen function returns the full text including the "CON " or "END "
// prefix.  Names are truncated inside the templates so screens never exceed
// the 182-char USSD limit.  Amounts arrive pre-formatted as "TSh 5,000".

import type { Language } from "./state.js";

// ── constants ──────────────────────────────────────────────────────────

const MAX_SCREEN = 182;
const MAX_SMS = 160;

// ── truncation helpers ──────────────────────────────────────────────────

function truncate(name: string, max: number): string {
  return name.length <= max ? name : name.slice(0, max);
}

/** Shop names truncated to 20 chars on single-customer screens. */
function truncShop(name: string): string {
  return truncate(name, 20);
}

/** Customer names truncated to 12 chars on single-customer screens. */
function truncCustomer(name: string): string {
  return truncate(name, 12);
}

/** Customer names truncated to 10 chars in list views (5 entries). */
function truncListName(name: string): string {
  return truncate(name, 10);
}

// ── amount formatting (integer-only, no toLocaleString) ──────────────────

export function formatTsh(amount: number): string {
  const digits = String(Math.trunc(Math.abs(amount)));
  let result = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) {
      result += ",";
    }
    result += digits[i] ?? "";
  }
  return `TSh ${result}`;
}

// ── list-screen builder (dynamically limits entries to ≤ 182 chars) ─────

function buildListScreen(
  prefix: string,
  header: string,
  entries: string[],
  footer: string,
): string {
  let screen = `${prefix}${header}\n`;
  for (const entry of entries) {
    const candidate = screen + entry + "\n";
    if (candidate.length + footer.length > MAX_SCREEN) break;
    screen = candidate;
  }
  if (footer === "") {
    // Strip trailing newline when there is no footer line.
    return screen.endsWith("\n") ? screen.slice(0, -1) : screen;
  }
  return screen + footer;
}

// ── Copy interface ──────────────────────────────────────────────────────

export interface Copy {
  mainMenu: (shopName: string) => string;
  registerShopPrompt: () => string;
  registerShopConfirm: (name: string) => string;
  registerShopDone: (name: string) => string;
  addDebtPhonePrompt: () => string;
  addDebtNamePrompt: () => string;
  addDebtAmountPrompt: (customerName: string) => string;
  addDebtConfirm: (customerName: string, amount: string) => string;
  addDebtDone: (customerName: string, amount: string) => string;
  paymentSelect: (debtors: { name: string; phone: string; amount: string }[]) => string;
  paymentPhonePrompt: () => string;
  paymentAmountPrompt: (customerName: string, balance: string) => string;
  paymentOverPayment: (customerName: string, balance: string) => string;
  paymentConfirm: (customerName: string, amount: string) => string;
  paymentDone: (customerName: string, amount: string) => string;
  whoOwes: (debtors: { name: string; phone: string; amount: string }[], total: string) => string;
  reminderSelect: (debtors: { name: string; amount: string }[]) => string;
  reminderConfirm: (customerName: string, amount: string) => string;
  reminderDone: (customerName: string) => string;
  invalidPhone: () => string;
  invalidAmount: () => string;
  customerNotFound: () => string;
  /** Reminder SMS (tone 1, Rafiki).  ≤ 160 GSM-7 chars, no curly quotes or emoji. */
  reminderSms: (customerName: string, shopName: string, amount: string) => string;
}

// ── Swahili copy ────────────────────────────────────────────────────────

const swCopy: Copy = {
  mainMenu: (shopName) =>
    `CON ZIMWI - ${truncShop(shopName)}\n` +
    "1. Ongeza deni\n" +
    "2. Pokea malipo\n" +
    "3. Nani anadaiwa?\n" +
    "4. Tuma kumbusho sasa\n" +
    "5. English / Kiswahili",

  registerShopPrompt: () => "CON Karibu ZIMWI! Andika jina la duka lako:",

  registerShopConfirm: (name) =>
    `CON Thibitisha: ${truncShop(name)}\n1. Ndiyo\n2. Hapana`,

  registerShopDone: (_name) => "END Duka lako limeongezwa. Karibu!",

  addDebtPhonePrompt: () => "CON Andika namba ya simu ya mteja:",

  addDebtNamePrompt: () => "CON Mteja mpya. Andika jina:",

  addDebtAmountPrompt: (customerName) =>
    `CON Mteja: ${truncCustomer(customerName)}\nAndika kiasi (TSh):`,

  addDebtConfirm: (customerName, amount) =>
    `CON Ongeza deni:\n${truncCustomer(customerName)} \u2014 ${amount}\n1. Thibitisha\n2. Ghairi`,

  addDebtDone: (customerName, amount) =>
    `END Deni la ${amount} limeongezwa kwa ${truncCustomer(customerName)}.`,

  paymentSelect: (debtors) => {
    const entries = debtors.map((d, i) => `${i + 1}. ${truncListName(d.name)} \u2014 ${d.amount}`);
    return buildListScreen("CON ", "Chagua mteja:", entries, "6. Andika simu");
  },

  paymentPhonePrompt: () => "CON Andika namba ya simu ya mteja:",

  paymentAmountPrompt: (customerName, balance) =>
    `CON Mteja: ${truncCustomer(customerName)} (${balance})\nAndika kiasi cha malipo (TSh):`,

  paymentOverPayment: (customerName, balance) =>
    `CON Mteja: ${truncCustomer(customerName)} (${balance})\n` +
    `Kiasi kikubwa! Deni ni ${balance} pekee.\n` +
    "Andika kiasi cha malipo (TSh):",

  paymentConfirm: (customerName, amount) =>
    `CON Malipo:\n${truncCustomer(customerName)} \u2014 ${amount}\n1. Thibitisha\n2. Ghairi`,

  paymentDone: (_customerName, amount) => `END Malipo ya ${amount} yamepokelewa.`,

  whoOwes: (debtors, total) => {
    const entries = debtors.map((d, i) => `${i + 1}. ${truncListName(d.name)} \u2014 ${d.amount}`);
    return buildListScreen("END ", "Wanaodaiwa:", entries, `Jumla: ${total}`);
  },

  reminderSelect: (debtors) => {
    const entries = debtors.map((d, i) => `${i + 1}. ${truncListName(d.name)} \u2014 ${d.amount}`);
    return buildListScreen("CON ", "Tuma kumbusho kwa:", entries, "");
  },

  reminderConfirm: (customerName, amount) =>
    `CON Kutuma kumbusho kwa:\n${truncCustomer(customerName)} \u2014 ${amount}\n1. Thibitisha\n2. Ghairi`,

  reminderDone: (customerName) => `END Kumbusho limetumwa kwa ${truncCustomer(customerName)}.`,

  invalidPhone: () => "CON Namba si sahihi. Andika namba ya simu ya mteja:",

  invalidAmount: () => "CON Kiasi si sahihi. Andika kiasi (TSh):",

  customerNotFound: () => "CON Mteja hayupo. Andika namba ya simu ya mteja:",

  reminderSms: (customerName, shopName, amount) =>
    `Habari ${truncCustomer(customerName)}! Kumbusho dogo: deni lako kwa ${truncShop(shopName)} ni ${amount}. Jibu LIPA au TAREHE dd/mm.`,
};

// ── English copy ────────────────────────────────────────────────────────

const enCopy: Copy = {
  mainMenu: (shopName) =>
    `CON ZIMWI - ${truncShop(shopName)}\n` +
    "1. Add debt\n" +
    "2. Record payment\n" +
    "3. Who owes?\n" +
    "4. Send reminder now\n" +
    "5. English / Kiswahili",

  registerShopPrompt: () => "CON Welcome to ZIMWI! Enter your shop name:",

  registerShopConfirm: (name) => `CON Confirm: ${truncShop(name)}\n1. Yes\n2. No`,

  registerShopDone: (_name) => "END Your shop is registered. Welcome!",

  addDebtPhonePrompt: () => "CON Enter customer phone number:",

  addDebtNamePrompt: () => "CON New customer. Enter name:",

  addDebtAmountPrompt: (customerName) =>
    `CON Customer: ${truncCustomer(customerName)}\nEnter amount (TSh):`,

  addDebtConfirm: (customerName, amount) =>
    `CON Add debt:\n${truncCustomer(customerName)} \u2014 ${amount}\n1. Confirm\n2. Cancel`,

  addDebtDone: (customerName, amount) =>
    `END Debt of ${amount} added for ${truncCustomer(customerName)}.`,

  paymentSelect: (debtors) => {
    const entries = debtors.map((d, i) => `${i + 1}. ${truncListName(d.name)} \u2014 ${d.amount}`);
    return buildListScreen("CON ", "Select customer:", entries, "6. Enter phone");
  },

  paymentPhonePrompt: () => "CON Enter customer phone number:",

  paymentAmountPrompt: (customerName, balance) =>
    `CON Customer: ${truncCustomer(customerName)} (${balance})\nEnter payment amount (TSh):`,

  paymentOverPayment: (customerName, balance) =>
    `CON Customer: ${truncCustomer(customerName)} (${balance})\n` +
    `Too much! Debt is ${balance} only.\n` +
    "Enter payment amount (TSh):",

  paymentConfirm: (customerName, amount) =>
    `CON Payment:\n${truncCustomer(customerName)} \u2014 ${amount}\n1. Confirm\n2. Cancel`,

  paymentDone: (_customerName, amount) => `END Payment of ${amount} received.`,

  whoOwes: (debtors, total) => {
    const entries = debtors.map((d, i) => `${i + 1}. ${truncListName(d.name)} \u2014 ${d.amount}`);
    return buildListScreen("END ", "Who owes:", entries, `Total: ${total}`);
  },

  reminderSelect: (debtors) => {
    const entries = debtors.map((d, i) => `${i + 1}. ${truncListName(d.name)} \u2014 ${d.amount}`);
    return buildListScreen("CON ", "Send reminder to:", entries, "");
  },

  reminderConfirm: (customerName, amount) =>
    `CON Send reminder to:\n${truncCustomer(customerName)} \u2014 ${amount}\n1. Confirm\n2. Cancel`,

  reminderDone: (customerName) => `END Reminder sent to ${truncCustomer(customerName)}.`,

  invalidPhone: () => "CON Invalid number. Enter customer phone number:",

  invalidAmount: () => "CON Invalid amount. Enter amount (TSh):",

  customerNotFound: () => "CON Customer not found. Enter customer phone number:",

  reminderSms: (customerName, shopName, amount) =>
    `Hi ${truncCustomer(customerName)}! Friendly reminder: your debt at ${truncShop(shopName)} is ${amount}. Reply LIPA or TAREHE dd/mm.`,
};

// ── Exported copy object ─────────────────────────────────────────────────

export const copy: Record<Language, Copy> = {
  sw: swCopy,
  en: enCopy,
};
