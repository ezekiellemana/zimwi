# ussd-menu — Tasks

Ordered implementation checklist. Each task references the requirement(s) it satisfies.

## Phase 1 — Scaffolding and types

- [ ] **T1** Create `server/src/ussd/` directory. Write `state.ts` with `Language`, `UssdNode`, `UssdState`, `initialState()`. — *(design §2.1, §2.2, §3.1)*
- [ ] **T2** Write `server/src/ussd/context.ts` with the `UssdContext` interface (shopName, ownerId, shopId, topDebtors, findCustomerByPhone). Import `Balance` and `Customer` types from `../ledger/types.js`. — **REQ-2.5**
- [ ] **T3** Write `server/src/ussd/effects.ts` with the `UssdEffect` discriminated union (createShop, recordDebt, recordPayment, sendReminder). — **REQ-2.6**

## Phase 2 — Copy templates

- [ ] **T4** Write `server/src/ussd/messages.copy.ts` with `Copy` interface and `copy: Record<Language, Copy>` object. Implement all Swahili screen templates: mainMenu, registerShopPrompt, registerShopConfirm, registerShopDone, addDebtPhonePrompt, addDebtNamePrompt, addDebtAmountPrompt, addDebtConfirm, addDebtDone, paymentSelect, paymentPhonePrompt, paymentAmountPrompt, paymentOverPayment, paymentConfirm, paymentDone, whoOwes, reminderSelect, reminderConfirm, reminderDone, invalidPhone, invalidAmount, customerNotFound. Each returns full screen text with `CON `/`END ` prefix. — **REQ-10.1, REQ-10.2, REQ-3.1, REQ-3.2**
- [ ] **T5** Implement the English (`en`) versions of all templates in `messages.copy.ts`, matching the Swahili structure. — **REQ-10.1, REQ-10.3**
- [ ] **T6** Implement the reminder SMS template (tone 1, Rafiki) in both `sw` and `en` in `messages.copy.ts`, following `zimwi-voice.md`: include customer first name, shop name, amount in `TSh` format, and reply instruction (`Jibu LIPA au TAREHE dd/mm`). — **REQ-8.4, REQ-10.4**
- [ ] **T7** Write `server/test/ussd/messages.test.ts`: assert every template starts with `CON ` or `END `, every screen template ≤ 182 chars with representative inputs (long shop name, 5 debtors with long names), reminder SMS ≤ 160 chars. — **REQ-9.1, REQ-9.2, REQ-8.5, REQ-10.1**

## Phase 3 — Telecom interface

- [ ] **T8** Create `server/src/telecom/` directory. Write `server/src/telecom/telecom.ts` with the `Telecom` interface (`sendSms(to: string, message: string): Promise<void>`). — **REQ-11.1**
- [ ] **T9** Write `server/src/telecom/fake.ts` with `FakeTelecom` class implementing `Telecom`: records messages in `messages: { to, message, timestamp }[]`, provides `clear()` method. — **REQ-11.2, REQ-11.3**
- [ ] **T10** Write `server/test/telecom/fake.test.ts`: assert `sendSms` appends to array, `clear` empties, multiple sends accumulate. — **REQ-11.2**

## Phase 4 — Pure state machine

- [ ] **T11** Write `server/src/ussd/core.ts` with `initialState()`, `render(state, context)`, and the amount formatting helper (`TSh {n}` with thousands separators). `render` dispatches on `state.node` and calls `copy[state.language]` template functions. No I/O imports. — **REQ-2.7, REQ-9.1, REQ-9.2, REQ-9.3**
- [ ] **T12** Implement `render` for: `main` (main menu with shop name, or redirect to register_shop if `context.shopName` is null), `register_shop`, `register_shop_confirm`, `add_debt_phone`, `add_debt_name`, `add_debt_amount`, `add_debt_confirm`, `payment_select` (top 5 debtors + manual phone option), `payment_phone`, `payment_amount`, `payment_confirm`, `who_owes` (terminal), `reminder_select`, `reminder_confirm`. — **REQ-3.1, REQ-3.2, REQ-4.1, REQ-5.1, REQ-5.5, REQ-6.1, REQ-7.1–7.4, REQ-8.1, REQ-9.4**
- [ ] **T13** Implement `step(state, input, context)` with global input handling: `0` → pop backStack (go back one step), `00` → clear backStack and go to main (or register_shop if no shop). If at main, `0` and `00` stay on main. — **REQ-9.6, REQ-9.7, REQ-9.8**
- [ ] **T14** Implement `step` node logic for `main`: `1` → add_debt_phone, `2` → payment_select, `3` → who_owes (terminal END), `4` → reminder_select, `5` → toggle language and stay on main. Push current node to backStack on forward transitions. — **REQ-3.2, REQ-3.3, REQ-3.4**
- [ ] **T15** Implement `step` for `register_shop`: store input as shop name, validate length ≤ 100 (REQ-4.4), transition to `register_shop_confirm`. Implement `register_shop_confirm`: `1` → produce `createShop` effect + END screen; other → back to `register_shop`. — **REQ-4.1, REQ-4.2, REQ-4.3, REQ-4.4, REQ-2.6**
- [ ] **T16** Implement `step` for `add_debt_phone`: call `normalisePhone(input)` in try/catch; on error → error re-prompt (REQ-5.9). On success: call `context.findCustomerByPhone(phone)`; if found → transition to `add_debt_amount` (store customerId, name); if null → transition to `add_debt_name` (store phone). — **REQ-5.1, REQ-5.2, REQ-5.3, REQ-5.9**
- [ ] **T17** Implement `step` for `add_debt_name`: store input as customer name, transition to `add_debt_amount`. — **REQ-5.3**
- [ ] **T18** Implement `step` for `add_debt_amount`: parse input as integer; validate > 0 (REQ-5.6); on invalid → error re-prompt; on valid → store amount, transition to `add_debt_confirm`. — **REQ-5.5, REQ-5.6**
- [ ] **T19** Implement `step` for `add_debt_confirm`: `1` → produce `recordDebt` effect (shopId, customerPhone, customerName, amountTzs) + END screen; other → back to `add_debt_amount`. — **REQ-5.7, REQ-5.8, REQ-2.6**
- [ ] **T20** Implement `step` for `payment_select`: `1`–`5` → select debtor from `context.topDebtors[idx-1]`, store customerId/name/balance, transition to `payment_amount`; `6` (or next option) → transition to `payment_phone`. — **REQ-6.1, REQ-6.2**
- [ ] **T21** Implement `step` for `payment_phone`: call `normalisePhone`; look up via `context.findCustomerByPhone`; if not found → error re-prompt (REQ-6.3); if found → store customer, transition to `payment_amount`. — **REQ-6.3**
- [ ] **T22** Implement `step` for `payment_amount`: parse input as integer; validate > 0 (REQ-6.5); check `amount > customerBalance` (REQ-6.6); if over → error re-prompt showing current balance; if valid → store amount, transition to `payment_confirm`. — **REQ-6.4, REQ-6.5, REQ-6.6**
- [ ] **T23** Implement `step` for `payment_confirm`: `1` → produce `recordPayment` effect (customerId, amountTzs) + END screen; other → back to `payment_amount`. — **REQ-6.7, REQ-6.8, REQ-2.6**
- [ ] **T24** Implement `step` for `who_owes`: terminal — `render` already produces the END screen; `step` should not be reached for this node (or is a no-op). — **REQ-7.1–7.4**
- [ ] **T25** Implement `step` for `reminder_select`: `1`–`5` → select debtor, transition to `reminder_confirm`. — **REQ-8.1, REQ-8.2**
- [ ] **T26** Implement `step` for `reminder_confirm`: `1` → build SMS message using `copy[language].reminderSms(name, shopName, amount)`, produce `sendReminder` effect (to = customer phone E.164, message) + END screen; other → back to `reminder_select`. — **REQ-8.3, REQ-8.4, REQ-8.5, REQ-2.6**
- [ ] **T27** Implement `replay(history, context)`: split history on `"*"`, filter empty strings, fold through `step` from `initialState()`, return final `{ screen, state, effects }`. Initial screen via `render(initialState, context)` when no inputs. — **REQ-2.2, REQ-2.3, REQ-2.4**

## Phase 5 — Pure unit tests

- [ ] **T28** Write `server/test/ussd/core.test.ts` with hand-crafted tests: first dial with shop → main menu (sw); first dial without shop → registration prompt. — **REQ-3.1, REQ-4.1**
- [ ] **T29** Add tests: full add-debt flow (new customer: phone → name → amount → confirm; existing customer: phone → amount → confirm). Verify effects and END screens. — **REQ-5.1–5.9**
- [ ] **T30** Add tests: full payment flow (list selection → amount → confirm; manual phone → amount → confirm; over-payment → error re-prompt, no state transition). — **REQ-6.1–6.8**
- [ ] **T31** Add tests: who owes (END screen with top 5 + grand total); send reminder (select → confirm → effect with SMS message). — **REQ-7.1–7.4, REQ-8.1–8.5**
- [ ] **T32** Add tests: language toggle (5 → sw to en, 5 → en to sw); back navigation (`0` at various nodes); main menu (`00` from deep nodes). — **REQ-3.4, REQ-9.6, REQ-9.7, REQ-9.8**
- [ ] **T33** Add tests: invalid phone (normalisePhone throws → error re-prompt); invalid amount (non-integer, ≤ 0 → error re-prompt); customer not found (payment_phone → error re-prompt). — **REQ-5.9, REQ-5.6, REQ-6.5, REQ-6.3, REQ-9.5**

## Phase 6 — Property tests

- [ ] **T34** Write `server/test/ussd/property.test.ts` with P1 (never throws): generate random histories via `fc.array(fc.oneof(fc.string({ maxLength: 50 }), fc.constant("0"), fc.constant("00"), fc.constant("*"), fc.constant(""), fc.unicodeString({ maxLength: 20 })))` joined with `"*"`, assert `replay(history, context)` never throws. — **REQ-12.1, REQ-12.4**
- [ ] **T35** Add P2 (screen constraints): for every `replay` result, assert `screen.length <= 182` and `screen.startsWith("CON ") || screen.startsWith("END ")`. — **REQ-12.2, REQ-9.1, REQ-9.2**
- [ ] **T36** Add P3 (determinism): run `replay(history, context)` twice, assert deep equality of `{ screen, state, effects }`. — **REQ-12.3**

## Phase 7 — Route handler

- [ ] **T37** Write `server/src/index.ts` with `createApp(repo, telecom)` factory function. Implement `POST /ussd` route: parse form fields (sessionId, phoneNumber, serviceCode, text), normalise phone, find-or-create owner, get shop, build context (topDebtors, customerMap), call `replay`, execute effects, return `text/plain`. — **REQ-1.1, REQ-1.3, REQ-1.4, REQ-1.5, REQ-1.6, REQ-2.5, REQ-2.6**
- [ ] **T38** If `LedgerRepository` lacks a `listCustomers(shopId)` method needed to build the customer lookup Map, add it to the interface and `DrizzleLedgerRepository` (query customers by shopId, return `Customer[]`). Note: this is the only ledger API change; it adds a read-only query. — *(design §8.3; REQ-2.5)*
- [ ] **T39** Write `server/src/main.ts` that imports `createApp` from `./index.js`, wires production dependencies (db client, DrizzleLedgerRepository, FakeTelecom for now), and starts the server via `@hono/node-server` `serve()`. — **REQ-1.2**
- [ ] **T40** Install `@hono/node-server` as a dependency in `server/package.json`. — *(tech.md)*

## Phase 8 — Route integration tests

- [ ] **T41** Write `server/test/ussd/route.test.ts` harness: spin up PGlite, apply migrations, create `DrizzleLedgerRepository`, create `FakeTelecom`, call `createApp(repo, telecom)`. Tear down after suite. — **REQ-13.1, REQ-13.4**
- [ ] **T42** Add route test: first dial from unknown number → registration prompt; submit name + confirm → shop created in DB, END screen. — **REQ-4.1–4.3, REQ-13.2, REQ-13.3**
- [ ] **T43** Add route test: add debt (new customer) → debt recorded in DB; second session same phone → name skipped (existing customer). — **REQ-5.1–5.8, REQ-13.2, REQ-13.3**
- [ ] **T44** Add route test: record payment via list selection → payment recorded, balance updated; over-payment → error re-prompt, no payment recorded. — **REQ-6.1–6.8, REQ-13.2, REQ-13.3**
- [ ] **T45** Add route test: record payment via manual phone entry → payment recorded. — **REQ-6.3, REQ-13.2**
- [ ] **T46** Add route test: who owes → END screen with top 5 + grand total; verify amounts match DB. — **REQ-7.1–7.4, REQ-13.2**
- [ ] **T47** Add route test: send reminder → `FakeTelecom.messages` contains SMS; verify message content includes name, shop, amount, reply instruction. — **REQ-8.1–8.5, REQ-13.2, REQ-13.3**
- [ ] **T48** Add route test: language toggle → subsequent screens in English; back (`0`) and main menu (`00`) navigation. — **REQ-3.4, REQ-9.6, REQ-9.7, REQ-9.8, REQ-13.2**
- [ ] **T49** Run full suite (`npm test`), confirm all pure + property + route + telecom tests pass without external services. — **REQ-12.4, REQ-13.4**
