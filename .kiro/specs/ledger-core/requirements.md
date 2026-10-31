# ledger-core — Requirements

> Source: `docs/brief.md` § "Spec 1: ledger-core" + steering files (`product.md`, `tech.md`, `structure.md`).

## Overview

The shop owner records debts and payments per customer and always sees correct balances. This spec covers the data model, pure ledger maths, and the database access layer. It does **not** cover USSD menus, SMS reminders, or the web UI.

---

## REQ-1 — Owner identity

The owner is identified solely by their phone number. One owner has exactly one shop.

- **REQ-1.1** — WHEN an owner is first referenced by a phone number THE SYSTEM SHALL create an owner record with that phone normalised to E.164 (`+255…`).
- **REQ-1.2** — WHEN an owner record is created THE SYSTEM SHALL create exactly one shop belonging to that owner.
- **REQ-1.3** — IF an owner with the same normalised phone already exists THE SYSTEM SHALL not create a duplicate owner record.
- **REQ-1.4** — WHEN an owner is looked up by phone THE SYSTEM SHALL return the owner and their single shop.

## REQ-2 — Shop management

- **REQ-2.1** — WHEN a shop is created THE SYSTEM SHALL store the shop name provided by the owner.
- **REQ-2.2** — THE SYSTEM SHALL enforce that each owner has at most one shop.
- **REQ-2.3** — WHEN a shop name is longer than 100 characters THE SYSTEM SHALL reject it.

## REQ-3 — Customer management

A customer belongs to one shop and is uniquely identified by phone within that shop.

- **REQ-3.1** — WHEN a customer is added THE SYSTEM SHALL store the customer's name and phone, with the phone normalised to E.164.
- **REQ-3.2** — IF a customer with the same normalised phone already exists in the same shop THE SYSTEM SHALL not create a duplicate; THE SYSTEM SHALL return the existing customer.
- **REQ-3.3** — IF a customer with the same phone exists in a different shop THE SYSTEM SHALL allow it, because uniqueness is per-shop.
- **REQ-3.4** — WHEN a customer name is longer than 100 characters THE SYSTEM SHALL reject it.
- **REQ-3.5** — WHEN a customer phone does not normalise to a valid E.164 Tanzanian number THE SYSTEM SHALL reject it.

## REQ-4 — Recording a debt

- **REQ-4.1** — WHEN a debt is recorded THE SYSTEM SHALL store the amount as a positive integer in TZS. No floating-point values are permitted anywhere.
- **REQ-4.2** — IF the debt amount is zero or negative THE SYSTEM SHALL reject the debt.
- **REQ-4.3** — IF the debt amount is not an integer THE SYSTEM SHALL reject the debt.
- **REQ-4.4** — WHEN a debt is recorded without an explicit `due_date` THE SYSTEM SHALL set `due_date` to `created_at + 7 days`.
- **REQ-4.5** — WHEN a debt is recorded THE SYSTEM SHALL store the optional note (max 200 characters).
- **REQ-4.6** — WHEN a debt is recorded THE SYSTEM SHALL store `created_at` as the current timestamp.

## REQ-5 — Recording a payment

- **REQ-5.1** — WHEN a payment is recorded THE SYSTEM SHALL store the amount as a positive integer in TZS.
- **REQ-5.2** — IF the payment amount is zero or negative THE SYSTEM SHALL reject the payment.
- **REQ-5.3** — IF the payment amount is not an integer THE SYSTEM SHALL reject the payment.
- **REQ-5.4** — IF the payment amount exceeds the customer's outstanding balance THE SYSTEM SHALL reject the payment.
- **REQ-5.5** — WHILE the customer's outstanding balance is zero THE SYSTEM SHALL reject any payment.
- **REQ-5.6** — WHEN a payment is recorded THE SYSTEM SHALL store `created_at` as the current timestamp.
- **REQ-5.7** — WHEN a payment is recorded THE SYSTEM SHALL read the customer's current balance and insert the payment inside a single database transaction that locks the customer row (`SELECT … FOR UPDATE`), so that concurrent payments cannot overdraw the balance.

## REQ-6 — Balance calculation

- **REQ-6.1** — THE SYSTEM SHALL compute a customer's balance as `sum(debts) − sum(payments)` for that customer.
- **REQ-6.2** — THE SYSTEM SHALL never return a negative balance. `computeBalance` returns the exact difference `sum(debts) − sum(payments)` without clamping; non-negativity is guaranteed by REQ-5.4 (over-payments are rejected before insertion).
- **REQ-6.3** — WHEN the owner requests a single customer's balance THE SYSTEM SHALL return the current balance and the customer's details.

## REQ-7 — Debtor listing

- **REQ-7.1** — WHEN the owner requests the list of debtors THE SYSTEM SHALL return all customers of the shop sorted by balance descending.
- **REQ-7.2** — THE SYSTEM SHALL include each customer's current balance in the result.
- **REQ-7.3** — THE SYSTEM SHALL include the grand total owed across all customers (sum of individual balances).
- **REQ-7.4** — THE SYSTEM SHALL exclude customers with a zero balance from the debtor list.

## REQ-8 — Property-based correctness invariants

These are not user-facing features but correctness properties that must hold and must be verified with fast-check property tests.

- **REQ-8.1** — WHILE any valid sequence of debts and payments is applied to a customer THE SYSTEM SHALL never produce a negative balance.
- **REQ-8.2** — WHILE payments are recorded in any order THE SYSTEM SHALL produce the same final balance for the same set of debts and payments.
- **REQ-8.3** — THE SYSTEM SHALL ensure that the total owed across all customers equals the sum of their individual balances.
- **REQ-8.4** — IF a payment would exceed the outstanding balance THE SYSTEM SHALL always reject it, regardless of prior operation order.
- **REQ-8.5** — WHILE a random sequence of debt and payment commands (including some invalid payments that must be rejected) is applied to a real repository THE SYSTEM SHALL keep every `getCustomerBalance` result equal to the pure-model balance and never negative.

## REQ-9 — Phone normalisation

- **REQ-9.1** — WHEN a phone number is received in local format (e.g. `0712345678` or `712345678`) THE SYSTEM SHALL normalise it to E.164 (`+255712345678`).
- **REQ-9.2** — IF a phone number is already in E.164 format THE SYSTEM SHALL keep it unchanged.
- **REQ-9.3** — IF a phone number cannot be normalised to a valid Tanzanian E.164 number THE SYSTEM SHALL reject it.
- **REQ-9.4** — THE SYSTEM SHALL never log full phone numbers; they must be masked as `+2557XX XXX 123` in logs.
