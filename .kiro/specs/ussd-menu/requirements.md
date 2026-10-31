# ussd-menu — Requirements

> Source: `docs/brief.md` § "Spec 2: ussd-menu" + steering files (`product.md`, `tech.md`, `structure.md`, `zimwi-voice.md`).

## Overview

The shop owner interacts with ZIMWI through Africa's Talking USSD callbacks. This spec covers the USSD callback route, the pure state-machine core, the copy templates, the Telecom interface for sending SMS reminders, and all tests. It reuses the ledger-core data model, repository, phone normalisation, and error types without changing them (unless a task explicitly says why).

---

## REQ-1 — USSD callback endpoint

- **REQ-1.1** — THE SYSTEM SHALL expose a `POST /ussd` route on the Hono app exported from `server/src/index.ts`.
- **REQ-1.2** — A separate `server/src/main.ts` SHALL start the Hono app; the app itself SHALL be importable for tests without binding a port.
- **REQ-1.3** — WHEN Africa's Talking sends a `POST /ussd` request THE SYSTEM SHALL read the form fields `sessionId`, `phoneNumber`, `serviceCode`, and `text`.
- **REQ-1.4** — THE SYSTEM SHALL treat the `text` field as a `"*"`-joined history of all inputs the user has entered during the current session; it SHALL be empty on the first dial.
- **REQ-1.5** — THE SYSTEM SHALL respond with `text/plain` content type.
- **REQ-1.6** — THE SYSTEM SHALL normalise `phoneNumber` to E.164 (`+255…`) using `normalisePhone` from `server/src/ledger/phone.ts` before any lookup.

## REQ-2 — Stateless session model

- **REQ-2.1** — THE SYSTEM SHALL NOT store USSD session state in a database table or any persistent store.
- **REQ-2.2** — THE SYSTEM SHALL derive the entire menu state by splitting the `text` field on `"*"` and replaying the resulting input sequence through a pure function.
- **REQ-2.3** — THE SYSTEM SHALL expose a pure function `step(state, input, context) → { screen, state, effects }` that processes one input and returns the next screen, the new state, and a list of side effects to execute.
- **REQ-2.4** — THE SYSTEM SHALL expose a pure function `replay(history, context) → { screen, state, effects }` that splits `history` on `"*"`, folds through `step` from an initial state, and returns the final screen, state, and effects.
- **REQ-2.5** — DB lookups (shop name, customer by phone, top 5 debtors) SHALL be supplied to the pure core as a pre-loaded `UssdContext` object so that the core remains pure and testable without a database or network.
- **REQ-2.6** — Side effects (create shop, record debt, record payment, send reminder) SHALL only be produced by the core when the final input confirms an action, and SHALL be returned as an effects list that the route executes after computing the screen.
- **REQ-2.7** — The pure core (`step` and `replay`) SHALL have no imports from `db/`, `repository.ts`, or any I/O module.

## REQ-3 — Main menu

- **REQ-3.1** — WHEN an owner with an existing shop dials in THE SYSTEM SHALL show a main menu with the shop name in the header: `CON ZIMWI - {shopName}`.
- **REQ-3.2** — THE SYSTEM SHALL show five options:
  1. Ongeza deni (Add debt)
  2. Pokea malipo (Record payment)
  3. Nani anadaiwa? (Who owes?)
  4. Tuma kumbusho sasa (Send reminder now)
  5. English / Kiswahili
- **REQ-3.3** — THE SYSTEM SHALL default to Swahili for all screens.
- **REQ-3.4** — WHEN the owner selects option 5 THE SYSTEM SHALL toggle the language between English and Kiswahili for the remainder of the session and return to the main menu.

## REQ-4 — Shop registration (unknown number)

- **REQ-4.1** — WHEN an owner dials in for the first time and no shop exists for their phone number THE SYSTEM SHALL prompt for a shop name.
- **REQ-4.2** — THE SYSTEM SHALL ask the owner to confirm the shop name before creating it.
- **REQ-4.3** — WHEN the owner confirms the shop name THE SYSTEM SHALL produce a `createShop` effect, show a final `END` screen confirming registration, and end the session.
- **REQ-4.4** — IF the shop name exceeds 100 characters THE SYSTEM SHALL reject it with a short error and re-prompt.

## REQ-5 — Add debt flow

- **REQ-5.1** — WHEN the owner selects "Add debt" THE SYSTEM SHALL prompt for a customer phone number.
- **REQ-5.2** — AFTER a phone is entered THE SYSTEM SHALL look up the customer by phone in the owner's shop using the pre-loaded context.
- **REQ-5.3** — IF the customer does not exist THE SYSTEM SHALL prompt for the customer's name, then prompt for the amount.
- **REQ-5.4** — IF the customer already exists THE SYSTEM SHALL skip the name prompt and proceed directly to the amount prompt.
- **REQ-5.5** — THE SYSTEM SHALL prompt for the debt amount as a whole number in TZS.
- **REQ-5.6** — IF the amount is not a positive integer THE SYSTEM SHALL show a short error and re-prompt for the amount.
- **REQ-5.7** — THE SYSTEM SHALL show a confirmation screen summarising the customer name (or phone) and the amount, and ask the owner to confirm.
- **REQ-5.8** — WHEN the owner confirms THE SYSTEM SHALL produce a `recordDebt` effect (find-or-create customer, then record debt), show a final `END` screen, and end the session.
- **REQ-5.9** — IF the phone does not normalise to a valid E.164 number THE SYSTEM SHALL show a short error and re-prompt for the phone.

## REQ-6 — Record payment flow

- **REQ-6.1** — WHEN the owner selects "Record payment" THE SYSTEM SHALL show the top 5 debtors by balance as numbered options, plus an option to enter a phone number directly.
- **REQ-6.2** — WHEN the owner selects a debtor from the list THE SYSTEM SHALL use that customer's ID and current balance from the pre-loaded context.
- **REQ-6.3** — WHEN the owner enters a phone number THE SYSTEM SHALL look up the customer by phone in the owner's shop using the pre-loaded context; IF the customer is not found THE SYSTEM SHALL show a short error and re-prompt.
- **REQ-6.4** — AFTER a customer is selected THE SYSTEM SHALL prompt for the payment amount as a whole number in TZS.
- **REQ-6.5** — IF the amount is not a positive integer THE SYSTEM SHALL show a short error and re-prompt for the amount.
- **REQ-6.6** — IF the payment amount exceeds the customer's outstanding balance THE SYSTEM SHALL reject it with a friendly message showing the current balance and re-prompt for the amount.
- **REQ-6.7** — THE SYSTEM SHALL show a confirmation screen summarising the customer name and the amount, and ask the owner to confirm.
- **REQ-6.8** — WHEN the owner confirms THE SYSTEM SHALL produce a `recordPayment` effect, show a final `END` screen, and end the session.

## REQ-7 — Who owes screen

- **REQ-7.1** — WHEN the owner selects "Who owes?" THE SYSTEM SHALL display the top 5 customers by balance descending.
- **REQ-7.2** — THE SYSTEM SHALL show each customer's name, masked phone number, and balance formatted as `TSh {amount with thousands separators}`.
- **REQ-7.3** — THE SYSTEM SHALL show the grand total owed across all customers as `TSh {total}`.
- **REQ-7.4** — THE SYSTEM SHALL show this as a final `END` screen and end the session.

## REQ-8 — Send reminder now

- **REQ-8.1** — WHEN the owner selects "Send reminder now" THE SYSTEM SHALL show the top 5 debtors as numbered options.
- **REQ-8.2** — WHEN the owner selects a debtor THE SYSTEM SHALL show a confirmation screen with the customer name and amount.
- **REQ-8.3** — WHEN the owner confirms THE SYSTEM SHALL produce a `sendReminder` effect that sends an SMS to the customer via the `Telecom` interface, show a final `END` screen, and end the session.
- **REQ-8.4** — THE SYSTEM SHALL use the tone-1 (Rafiki) reminder template from `zimwi-voice.md`, in the current session language, including customer first name, shop name, amount in `TSh` format, and a reply instruction.
- **REQ-8.5** — THE reminder SMS SHALL be at most 160 GSM-7 characters.

## REQ-9 — Screen constraints

- **REQ-9.1** — EVERY screen the system returns SHALL start with `CON ` (continue) or `END ` (final).
- **REQ-9.2** — EVERY screen SHALL be at most 182 characters including the `CON `/`END ` prefix.
- **REQ-9.3** — THE SYSTEM SHALL format all amounts as `TSh {amount}` with thousands separators (e.g. `TSh 5,000`).
- **REQ-9.4** — THE SYSTEM SHALL mask phone numbers using `maskPhone` from `server/src/ledger/phone.ts` whenever a phone is displayed on a screen (e.g. debtor lists).
- **REQ-9.5** — WHEN the owner enters invalid input THE SYSTEM SHALL show a short error message on the same screen and re-prompt.
- **REQ-9.6** — WHEN the owner enters `0` THE SYSTEM SHALL go back one step in the current flow.
- **REQ-9.7** — WHEN the owner enters `00` THE SYSTEM SHALL return to the main menu.
- **REQ-9.8** — IF the owner is at the main menu and enters `0` or `00` THE SYSTEM SHALL stay on the main menu.

## REQ-10 — Copy templates

- **REQ-10.1** — All user-facing USSD copy SHALL live in `server/src/ussd/messages.copy.ts` with Swahili (`sw`) and English (`en`) versions.
- **REQ-10.2** — THE SYSTEM SHALL default to Swahili copy.
- **REQ-10.3** — THE SYSTEM SHALL switch to English copy when the owner toggles language via option 5.
- **REQ-10.4** — The reminder SMS template (tone 1, Rafiki) SHALL also live in `messages.copy.ts` with `sw` and `en` versions.

## REQ-11 — Telecom interface

- **REQ-11.1** — THE SYSTEM SHALL define a `Telecom` interface in `server/src/telecom/` with a method `sendSms(to: string, message: string): Promise<void>`.
- **REQ-11.2** — THE SYSTEM SHALL provide a `FakeTelecom` implementation that records all sent messages in an in-memory array for testing and the simulator.
- **REQ-11.3** — THE SYSTEM SHALL NOT implement the Africa's Talking client in this spec; `FakeTelecom` is the only implementation.

## REQ-12 — Property-based tests (fast-check)

- **REQ-12.1** — WHILE any random input sequence (digits, `*`, empty strings, long strings, unicode characters) is replayed through the pure core THE SYSTEM SHALL never throw an exception.
- **REQ-12.2** — FOR EVERY screen produced by replaying any random input sequence THE SYSTEM SHALL ensure the screen is at most 182 characters and starts with `CON ` or `END `.
- **REQ-12.3** — WHEN the same input history is replayed multiple times THE SYSTEM SHALL produce identical results (determinism).
- **REQ-12.4** — THE property tests SHALL run without a database, network, or any external service.

## REQ-13 — Route integration tests

- **REQ-13.1** — THE SYSTEM SHALL include route integration tests that call the Hono app via `app.request()` with PGlite as the database.
- **REQ-13.2** — The route tests SHALL cover: first-dial registration, add debt (existing and new customer), record payment (list selection and phone entry, over-payment rejection), who owes, send reminder, and language toggle.
- **REQ-13.3** — The route tests SHALL verify that effects are executed (shop created, debt recorded, payment recorded, SMS sent via FakeTelecom).
- **REQ-13.4** — THE route tests SHALL run without external services (no Africa's Talking, no Neon, no Docker).
