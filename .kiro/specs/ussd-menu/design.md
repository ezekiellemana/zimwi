# ussd-menu — Design

## 1. Architecture overview

The USSD menu lives in `server/src/ussd/` with a companion telecom module in `server/src/telecom/`. The folder follows the steering rule: **keep pure logic separate from I/O**, so the state machine can be property-tested without a database or network.

```
server/src/
  ussd/
    state.ts          # UssdState, UssdNode, Language types
    context.ts        # UssdContext interface (data + lookup injected by route)
    effects.ts        # UssdEffect discriminated union
    core.ts           # step, replay, render, initialState (pure, no I/O imports)
    messages.copy.ts  # sw + en copy templates (pure)
  telecom/
    telecom.ts        # Telecom interface
    fake.ts           # FakeTelecom (records messages in memory)
  index.ts            # Hono app (exports app, no server binding)
  main.ts             # starts the Hono app on a port
server/test/
  ussd/
    core.test.ts          # unit tests for step / replay / render
    messages.test.ts     # copy length and format tests
    property.test.ts      # fast-check property tests
    route.test.ts         # route integration tests (app.request + PGlite)
  telecom/
    fake.test.ts          # FakeTelecom unit tests
```

The split enables three test tiers:

1. **Pure tests** (`server/test/ussd/core.test.ts`, `property.test.ts`) — import only `core.ts`, `state.ts`, `context.ts`, `effects.ts`, `messages.copy.ts`. No database, no network.
2. **Copy tests** (`server/test/ussd/messages.test.ts`) — verify screen templates respect the 182-char limit and format.
3. **Route tests** (`server/test/ussd/route.test.ts`) — use PGlite + `app.request()` so no external Postgres or Africa's Talking is required.

## 2. Types

### 2.1 Language and nodes (`server/src/ussd/state.ts`)

```ts
export type Language = "sw" | "en";

export type UssdNode =
  | "main"                   // main menu (shop exists)
  | "register_shop"           // prompt for shop name (first dial, no shop)
  | "register_shop_confirm"  // confirm shop name before creating
  | "add_debt_phone"          // prompt for customer phone
  | "add_debt_name"           // prompt for customer name (new customer only)
  | "add_debt_amount"         // prompt for debt amount
  | "add_debt_confirm"        // confirm debt details
  | "payment_select"          // choose from top 5 debtors or enter phone
  | "payment_phone"           // prompt for phone (user chose manual entry)
  | "payment_amount"          // prompt for payment amount
  | "payment_confirm"         // confirm payment
  | "who_owes"                // terminal: top 5 + grand total
  | "reminder_select"         // choose debtor to remind
  | "reminder_confirm";       // confirm reminder before sending
```

### 2.2 State

```ts
export interface UssdState {
  node: UssdNode;
  language: Language;
  // Flow data (populated as inputs are collected)
  shopName?: string;           // during registration
  customerPhone?: string;      // normalised E.164
  customerName?: string;       // for new customers in add-debt
  customerId?: number;         // for existing customers (payment/reminder)
  customerBalance?: number;    // outstanding balance (payment flow)
  amount?: number;             // parsed integer TZS
  // Back navigation
  backStack: UssdNode[];
}
```

`backStack` records the node path so `0` can go back one step and `00` can reset to main. Every forward transition pushes the current node; `0` pops; `00` clears.

### 2.3 Context (`server/src/ussd/context.ts`)

```ts
import type { Balance, Customer } from "../ledger/types.js";

export interface UssdContext {
  // Shop info (pre-loaded by route)
  shopName: string | null;     // null = no shop yet → registration flow
  ownerId: number;
  shopId: number | null;
  // Top 5 debtors by balance (pre-loaded by route via listDebtors)
  topDebtors: Balance[];
  // Customer lookup by normalised phone (for add-debt and payment flows)
  // Route pre-loads all shop customers into a Map; tests provide a simple lookup.
  findCustomerByPhone: (phoneE164: string) => Customer | null;
}
```

The context is a plain data object plus one lookup function. The core never imports `db/` or `repository.ts`; it receives everything it needs through this interface. In tests, `findCustomerByPhone` is backed by a `Map<string, Customer>`. In production, the route pre-loads all customers for the shop (duka customer lists are small) and wraps the Map in a closure.

### 2.4 Effects (`server/src/ussd/effects.ts`)

```ts
export type UssdEffect =
  | { kind: "createShop"; ownerId: number; name: string }
  | { kind: "recordDebt"; shopId: number; customerPhone: string; customerName: string; amountTzs: number }
  | { kind: "recordPayment"; customerId: number; amountTzs: number }
  | { kind: "sendReminder"; to: string; message: string };
```

Effects are returned by the core **only on the final confirming input**. The route iterates the effects list and calls the appropriate repository or telecom method. Each effect carries all data needed so the route doesn't need to re-derive anything.

## 3. Pure state machine (`server/src/ussd/core.ts`)

No imports from `db/`, `repository.ts`, or `telecom/`. May import `phone.ts` (normalisePhone, maskPhone), `types.ts` (Balance, Customer), `state.ts`, `context.ts`, `effects.ts`, and `messages.copy.ts` — all pure.

### 3.1 Signatures

```ts
import type { UssdState, Language } from "./state.js";
import type { UssdContext } from "./context.js";
import type { UssdEffect } from "./effects.js";

// Process one input and return the next screen, state, and effects.
export function step(
  state: UssdState,
  input: string,
  context: UssdContext,
): { screen: string; state: UssdState; effects: UssdEffect[] }

// Produce the screen for the current state without consuming an input.
export function render(
  state: UssdState,
  context: UssdContext,
): string

// Split history on "*", fold through step from initialState, return final result.
export function replay(
  history: string,
  context: UssdContext,
): { screen: string; state: UssdState; effects: UssdEffect[] }

export function initialState(): UssdState
```

### 3.2 replay

```ts
export function replay(history: string, context: UssdContext) {
  const inputs = history.split("*").filter((s) => s !== "");
  let state = initialState();
  let screen = render(state, context);   // initial screen (first dial)
  let effects: UssdEffect[] = [];

  for (const input of inputs) {
    const result = step(state, input, context);
    state = result.state;
    screen = result.screen;
    effects = result.effects;             // only last step's effects survive
  }

  return { screen, state, effects };
}
```

Key points:
- Empty `text` → `[""]` → filtered to `[]` → no steps → `render(initialState, context)`.
- Effects from intermediate steps are discarded; only the final step's effects are returned. This is safe because confirmation screens are `END` (session ends), so there are no further inputs after an effect is produced.
- The function is deterministic: same history + same context → same output.

### 3.3 step — global input handling

Before node-specific logic, `step` handles three global inputs:

| Input | Behaviour |
|-------|-----------|
| `0`   | Pop `backStack`; transition to previous node. If `backStack` is empty, stay on current node. If current node is `main`, stay on `main`. |
| `00`  | Clear `backStack`; set node to `main` (or `register_shop` if `context.shopName` is null). |
| anything else | Proceed to node-specific logic. |

Language toggle (option 5 on main menu) is handled in the `main` node logic, not as a global input.

### 3.4 step — node logic

Each node processes its expected input and transitions to the next node, pushing the current node onto `backStack`. The table below summarises transitions; see §4 for full flow diagrams.

| Current node | Input | Next node | Notes |
|---|---|---|---|
| `main` | `1` | `add_debt_phone` | |
| `main` | `2` | `payment_select` | |
| `main` | `3` | `who_owes` | Terminal `END` screen |
| `main` | `4` | `reminder_select` | |
| `main` | `5` | `main` | Toggle language (`sw`↔`en`) |
| `register_shop` | text (name) | `register_shop_confirm` | Store name in state |
| `register_shop_confirm` | `1` (confirm) | — | `END` screen, `createShop` effect |
| `register_shop_confirm` | other | `register_shop` | Re-prompt (cancel) |
| `add_debt_phone` | phone string | `add_debt_name` or `add_debt_amount` | Normalise phone; if `findCustomerByPhone` returns null → `add_debt_name`; else → `add_debt_amount` (skip name) |
| `add_debt_name` | text (name) | `add_debt_amount` | |
| `add_debt_amount` | integer string | `add_debt_confirm` | Parse to int; validate > 0 |
| `add_debt_confirm` | `1` (confirm) | — | `END` screen, `recordDebt` effect |
| `add_debt_confirm` | other | `add_debt_amount` | Re-prompt (cancel) |
| `payment_select` | `1`–`5` | `payment_amount` | Select debtor from `context.topDebtors[idx]` |
| `payment_select` | `6` (or next) | `payment_phone` | Manual phone entry |
| `payment_phone` | phone string | `payment_amount` | Normalise; look up; error if not found |
| `payment_amount` | integer string | `payment_confirm` | Parse; validate > 0; check ≤ balance |
| `payment_confirm` | `1` (confirm) | — | `END` screen, `recordPayment` effect |
| `payment_confirm` | other | `payment_amount` | Re-prompt (cancel) |
| `who_owes` | — | — | Terminal: `END` screen with top 5 + total |
| `reminder_select` | `1`–`5` | `reminder_confirm` | Select debtor |
| `reminder_confirm` | `1` (confirm) | — | `END` screen, `sendReminder` effect |
| `reminder_confirm` | other | `reminder_select` | Re-prompt (cancel) |

Invalid inputs (bad phone, non-integer amount, over-payment) do **not** transition the node. Instead, `step` returns a screen with a short error prefix and re-prompts for the same input.

## 4. Menu flows

### 4.1 First dial — unknown number (shop registration)

```
text=""  →  render(initialState)
           context.shopName is null  →  register_shop
           Screen (sw): CON Karibu ZIMWI! Andika jina la duka lako:
           Screen (en): CON Welcome to ZIMWI! Enter your shop name:

text="Duka la Mama Asha"
           →  register_shop_confirm
           Screen (sw): CON Thibitisha: Duka la Mama Asha
                        1. Ndiyo
                        2. Hapana
           Screen (en): CON Confirm: Duka la Mama Asha
                        1. Yes
                        2. No

text="Duka la Mama Asha*1"
           →  END screen, effect: createShop
           Screen (sw): END Duka lako limeongezwa. Karibu!
           Screen (en): END Your shop is registered. Welcome!
```

### 4.2 Main menu

```
text=""  →  context.shopName = "Duka la Mama Asha"
           Screen (sw): CON ZIMWI - Duka la Mama Asha
                        1. Ongeza deni
                        2. Pokea malipo
                        3. Nani anadaiwa?
                        4. Tuma kumbusho sasa
                        5. English / Kiswahili
```

### 4.3 Add debt — existing customer

```
text="1"
           →  add_debt_phone
           Screen (sw): CON Andika namba ya simu ya mteja:

text="1*0712345678"
           →  normalisePhone → +255712345678
           →  findCustomerByPhone returns existing customer "Juma"
           →  add_debt_amount (skip name)
           Screen (sw): CON Mteja: Juma
                        Andika kiasi (TSh):

text="1*0712345678*5000"
           →  add_debt_confirm
           Screen (sw): CON Ongeza deni:
                        Juma — TSh 5,000
                        1. Thibitisha
                        2. Ghairi

text="1*0712345678*5000*1"
           →  END screen, effect: recordDebt
           Screen (sw): END Deni la TSh 5,000 limeongezwa kwa Juma.
```

### 4.4 Add debt — new customer

```
text="1*0712345678"
           →  findCustomerByPhone returns null
           →  add_debt_name
           Screen (sw): CON Mteja mpya. Andika jina:

text="1*0712345678*Asha"
           →  add_debt_amount
           Screen (sw): CON Mteja: Asha
                        Andika kiasi (TSh):

text="1*0712345678*Asha*3000*1"
           →  END screen, effect: recordDebt { customerPhone, customerName: "Asha", amountTzs: 3000 }
```

### 4.5 Record payment — from debtor list

```
text="2"
           →  payment_select
           Screen (sw): CON Chagua mteja:
                        1. Juma — +2557XX XXX 678 — TSh 5,000
                        2. Asha — +2557XX XXX 234 — TSh 3,000
                        ...
                        6. Andika namba ya simu

text="2*1"
           →  select debtor 1 (Juma, balance 5000)
           →  payment_amount
           Screen (sw): CON Mteja: Juma (TSh 5,000)
                        Andika kiasi cha malipo (TSh):

text="2*1*2000"
           →  payment_confirm
           Screen (sw): CON Malipo:
                        Juma — TSh 2,000
                        1. Thibitisha
                        2. Ghairi

text="2*1*2000*1"
           →  END screen, effect: recordPayment { customerId, amountTzs: 2000 }
           Screen (sw): END Malipo ya TSh 2,000 yamepokelewa.
```

### 4.6 Record payment — over-payment rejection

```
text="2*1*6000"
           →  6000 > 5000 (balance)
           →  stay on payment_amount, show error
           Screen (sw): CON Mteja: Juma (TSh 5,000)
                        Kiasi kikubwa! Deni ni TSh 5,000 pekee.
                        Andika kiasi cha malipo (TSh):
```

### 4.7 Record payment — manual phone entry

```
text="2*6"
           →  payment_phone
           Screen (sw): CON Andika namba ya simu ya mteja:

text="2*6*0712345678"
           →  normalise, findCustomerByPhone → Juma
           →  payment_amount (same as list selection)
```

### 4.8 Who owes

```
text="3"
           →  who_owes (terminal)
           Screen (sw): END Wanaodaiwa:
                        1. Juma — TSh 5,000
                        2. Asha — TSh 3,000
                        ...
                        Jumla: TSh 8,000
```

### 4.9 Send reminder now

```
text="4"
           →  reminder_select
           Screen (sw): CON Tuma kumbusho kwa:
                        1. Juma — TSh 5,000
                        2. Asha — TSh 3,000
                        ...

text="4*1"
           →  reminder_confirm
           Screen (sw): CON Kutuma kumbusho kwa:
                        Juma — TSh 5,000
                        1. Thibitisha
                        2. Ghairi

text="4*1*1"
           →  END screen, effect: sendReminder
           Screen (sw): END Kumbusho limetumwa kwa Juma.
```

The `sendReminder` effect carries the full SMS message built by the core using `messages.copy.ts` tone-1 (Rafiki) template, in the current session language.

### 4.10 Language toggle

```
text="5"
           →  toggle language sw → en
           →  stay on main, re-render in English
           Screen (en): CON ZIMWI - Duka la Mama Asha
                        1. Add debt
                        2. Record payment
                        3. Who owes?
                        4. Send reminder now
                        5. English / Kiswahili
```

All subsequent screens in this session use English until the owner toggles back.

### 4.11 Back navigation

```
text="1*0712345678*Asha*0"
           →  At add_debt_amount, input "0"
           →  Pop backStack → add_debt_name
           →  Re-render add_debt_name prompt

text="1*0712345678*Asha*00"
           →  Input "00"
           →  Clear backStack → main
           →  Re-render main menu
```

## 5. Screen formatting and constraints

### 5.1 CON / END prefix

Every screen starts with `CON ` (continue, session stays open) or `END ` (final, session closes). The prefix is 4 characters and counts toward the 182-character limit.

### 5.2 182-character limit

`render` and `step` must never produce a screen longer than 182 characters. The copy templates are designed to stay within this limit. The property tests verify this invariant with random input sequences.

If a dynamically constructed screen (e.g., debtor list with long names) risks exceeding 182 characters, the core truncates names or limits the list. The `topDebtors` array is already capped at 5 by the route.

### 5.3 Amount formatting

Amounts are formatted as `TSh {amount}` with thousands separators: `TSh 5,000`, `TSh 1,200,000`. The formatting function is pure and lives in `core.ts` or `messages.copy.ts`.

### 5.4 Phone masking

Phone numbers displayed on screens (debtor lists, payment selection) are masked using `maskPhone` from `server/src/ledger/phone.ts`. Example: `+255712345678` → `+2557XX XXX 678`.

### 5.5 Error re-prompting

When input is invalid (bad phone, non-integer amount, over-payment), `step` does not transition nodes. It returns a screen that prepends a short error line to the current prompt:

```
CON Namba si sahihi. Andika namba ya simu ya mteja:
```

The error message is drawn from `messages.copy.ts` in the current language.

## 6. Copy templates (`server/src/ussd/messages.copy.ts`)

Pure module. Exports a structured object with Swahili (`sw`) and English (`en`) versions of every screen template and the reminder SMS template.

```ts
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
  // Reminder SMS (tone 1, Rafiki — from zimwi-voice.md)
  reminderSms: (customerName: string, shopName: string, amount: string) => string;
}

export const copy: Record<Language, Copy>;
```

Each function returns the full screen text **including** the `CON ` or `END ` prefix. This keeps all formatting in one place and makes the 182-char limit easy to test.

The reminder SMS template follows `zimwi-voice.md` tone-1 (Rafiki):

- **Swahili:** `Habari {jina}! Kumbusho dogo: deni lako kwa {duka} ni TSh {kiasi}. Jibu LIPA au TAREHE dd/mm.`
- **English:** `Hi {name}! Friendly reminder: your debt at {shop} is TSh {amount}. Reply LIPA or TAREHE dd/mm.`

SMS templates must be ≤ 160 GSM-7 characters.

## 7. Telecom interface (`server/src/telecom/`)

### 7.1 Interface (`telecom.ts`)

```ts
export interface Telecom {
  sendSms(to: string, message: string): Promise<void>;
}
```

### 7.2 FakeTelecom (`fake.ts`)

```ts
export class FakeTelecom implements Telecom {
  messages: { to: string; message: string; timestamp: Date }[] = [];

  async sendSms(to: string, message: string): Promise<void> {
    this.messages.push({ to, message, timestamp: new Date() });
  }

  clear(): void {
    this.messages = [];
  }
}
```

`FakeTelecom` records all sent messages in memory. It is used by tests and the web simulator. No Africa's Talking client is implemented in this spec.

## 8. Route handler

### 8.1 App export (`server/src/index.ts`)

```ts
import { Hono } from "hono";
import { replay } from "./ussd/core.js";
import type { UssdContext } from "./ussd/context.js";
import { normalisePhone } from "./ledger/phone.js";
import type { LedgerRepository } from "./ledger/repository.js";
import type { Telecom } from "./telecom/telecom.js";

export function createApp(repo: LedgerRepository, telecom: Telecom) {
  const app = new Hono();

  app.post("/ussd", async (c) => {
    const body = await c.req.parseBody();
    const phoneNumber = body.phoneNumber as string;
    const text = (body.text as string) ?? "";

    // Normalise caller phone
    const normalisedPhone = normalisePhone(phoneNumber);

    // Find or create owner
    const owner = await repo.findOrCreateOwner(normalisedPhone);
    const shop = await repo.getOwnerShop(owner.id);

    // Pre-load context data
    const topDebtors = shop
      ? (await repo.listDebtors(shop.id)).balances.slice(0, 5)
      : [];

    // Pre-load customer lookup (all shop customers into a Map)
    const customerMap = new Map<string, Customer>();
    if (shop) {
      // Load all customers for this shop (duka lists are small)
      // and build a phone→customer map
      // (repository may need a listCustomers method, or we reuse listDebtors
      // and add a lightweight query — see tasks)
    }

    const context: UssdContext = {
      shopName: shop?.name ?? null,
      ownerId: owner.id,
      shopId: shop?.id ?? null,
      topDebtors,
      findCustomerByPhone: (phoneE164) => customerMap.get(phoneE164) ?? null,
    };

    // Run pure core
    const { screen, effects } = replay(text, context);

    // Execute effects
    for (const effect of effects) {
      switch (effect.kind) {
        case "createShop":
          await repo.createShop(effect.ownerId, effect.name);
          break;
        case "recordDebt":
          const customer = await repo.findOrCreateCustomer(
            effect.shopId, effect.customerName, effect.customerPhone
          );
          await repo.recordDebt(customer.id, effect.amountTzs, null, null);
          break;
        case "recordPayment":
          await repo.recordPayment(effect.customerId, effect.amountTzs);
          break;
        case "sendReminder":
          await telecom.sendSms(effect.to, effect.message);
          break;
      }
    }

    return c.text(screen, 200, { "Content-Type": "text/plain" });
  });

  return app;
}
```

The app is created via a factory function `createApp(repo, telecom)` so tests can inject PGlite-backed repositories and `FakeTelecom`. The exported app is wired with real (or test) dependencies.

### 8.2 Server start (`server/src/main.ts`)

```ts
import { serve } from "@hono/node-server";
import { createApp } from "./index.js";
// import { createDb } from "./db/index.js";
// import { DrizzleLedgerRepository } from "./ledger/repository.js";
// import { FakeTelecom } from "./telecom/fake.js";

const app = createApp(/* repo, telecom */);

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) });
```

`main.ts` wires production dependencies and binds the port. `index.ts` exports the app factory, which tests import without starting a server.

### 8.3 Context building strategy

The route builds `UssdContext` before calling `replay`:

1. `normalisePhone(phoneNumber)` → E.164
2. `findOrCreateOwner(phone)` → owner (creates owner row if first dial)
3. `getOwnerShop(owner.id)` → shop or null
4. If shop exists: `listDebtors(shop.id)` → top 5 debtors (already sorted desc, zero-balance excluded by repository)
5. If shop exists: load all customers for the shop into a `Map<phoneE164, Customer>` for `findCustomerByPhone`

Step 5 may require a `listCustomers(shopId)` method on `LedgerRepository` that is not in the current interface. If so, a task will add it with a note explaining why. Alternatively, the route can query customers directly via the db client. The design prefers adding a repository method to keep the data access pattern consistent.

## 9. Error handling

The pure core does not throw on invalid input. Instead, it returns a screen with an error message and re-prompts (see §5.5). This ensures the property tests' "never throws" invariant holds.

Repository errors (`LedgerError`) can still occur when effects are executed (e.g., a race condition causes over-payment at the DB level). The route catches these and returns a generic error `END` screen. This is an edge case because the core pre-validates amounts and balances using the context data.

`normalisePhone` throws `LedgerError` on invalid input. The core calls it inside a try/catch and converts the error to a re-prompt screen, so the property tests never see a throw.

## 10. Testing strategy

### 10.1 Test runner and layout

- **Runner:** Vitest.
- **Property testing:** fast-check.
- **Layout:** `server/test/ussd/` and `server/test/telecom/`.

### 10.2 Pure unit tests (`core.test.ts`)

Test `step`, `render`, and `replay` with hand-crafted inputs and contexts:

- First dial with shop → main menu in Swahili.
- First dial without shop → registration prompt.
- Full add-debt flow (new and existing customer).
- Full payment flow (list selection, phone entry, over-payment rejection).
- Who owes screen.
- Send reminder flow.
- Language toggle (sw → en → sw).
- Back navigation (`0`) and main menu (`00`).
- Invalid phone, invalid amount, customer not found → error re-prompt.

Context is built with a simple `Map<string, Customer>` for `findCustomerByPhone`.

### 10.3 Copy tests (`messages.test.ts`)

- Assert every template function in `copy.sw` and `copy.en` produces output starting with `CON ` or `END `.
- Assert every screen template is ≤ 182 characters with representative inputs (long shop name, long customer name, 5 debtors with long names).
- Assert reminder SMS templates are ≤ 160 characters with representative inputs.

### 10.4 Property tests (`property.test.ts`)

| # | Property | fast-check strategy | Asserts |
|---|----------|---------------------|---------|
| P1 (REQ-12.1) | Never throws | `fc.array(fc.oneof(fc.string({ maxLength: 50 }), fc.constant("0"), fc.constant("00"), fc.constant("*"), fc.constant(""), fc.unicodeString({ maxLength: 20 })))` joined with `"*"` | `replay(history, context)` does not throw for any history |
| P2 (REQ-12.2) | Screen ≤ 182 and starts with CON/END | Same arbitrary as P1 | `screen.length <= 182 && (screen.startsWith("CON ") \|\| screen.startsWith("END "))` |
| P3 (REQ-12.3) | Determinism | Same history run twice | `replay(h, ctx)` deep-equals `replay(h, ctx)` |

The context for property tests uses a fixed shop with a small set of pre-loaded customers. The arbitrary input sequences include digits, `*`, empty strings, long strings, and unicode — exercising all edge cases.

### 10.5 Route integration tests (`route.test.ts`)

Use `createApp(repo, telecom)` with a PGlite-backed `DrizzleLedgerRepository` and `FakeTelecom`. Call `app.request("/ussd", { method: "POST", ... })` with form-encoded bodies.

Test scenarios:
1. **First dial registration:** empty text → registration prompt; submit name + confirm → shop created in DB, `END` screen returned.
2. **Add debt — new customer:** dial main, enter phone, enter name, enter amount, confirm → debt recorded in DB.
3. **Add debt — existing customer:** second session, same phone → name skipped, amount prompt shown.
4. **Record payment — list selection:** select debtor 1, enter amount, confirm → payment recorded, balance updated in DB.
5. **Record payment — over-payment:** enter amount > balance → error re-prompt, payment not recorded.
6. **Record payment — manual phone:** enter phone, amount, confirm → payment recorded.
7. **Who owes:** verify top 5 + grand total on `END` screen.
8. **Send reminder:** select debtor, confirm → `FakeTelecom.messages` contains the SMS, verify content.
9. **Language toggle:** dial 5 → subsequent screens in English.
10. **Back / main menu:** enter `0` and `00` at various points → correct navigation.

### 10.6 Telecom tests (`fake.test.ts`)

- `sendSms` appends to `messages` array.
- `clear` empties the array.
- Multiple sends accumulate correctly.

### 10.7 No external services

All tests run without:
- Africa's Talking (FakeTelecom replaces it).
- Neon Postgres (PGlite runs in-process).
- Docker or network.
