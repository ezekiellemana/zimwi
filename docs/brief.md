# ZIMWI build brief (input for Kiro specs)

Use this brief to generate Kiro specs, one spec per feature, in this order.

## Spec 1: `ledger-core`
The owner records debts and payments per customer and always sees correct balances.
- Owner (identified by phone) has one shop with a name.
- Customer: name + phone, unique per shop.
- Debt entry: amount (integer TZS > 0), note, created_at, due_date (default +7 days).
- Payment entry: amount (integer TZS > 0), created_at. A payment cannot exceed the outstanding balance.
- Balance = sum(debts) - sum(payments), and it is never negative.
- Property tests: the balance is never negative, the order of payments doesn't change the final balance, and the total owed across customers equals the sum of their balances.

## Spec 2: `ussd-menu`
Africa's Talking USSD callback (`POST /ussd`, form fields sessionId, phoneNumber, text).
Menu (Swahili default, with a language switch):
```
CON ZIMWI - {duka}
1. Ongeza deni (Add debt)
2. Pokea malipo (Record payment)
3. Nani anadaiwa? (Who owes?)
4. Tuma kumbusho sasa (Send reminder now)
5. English / Kiswahili
```
- Add debt: customer phone, then name (only if new), then amount, then confirm.
- Record payment: pick a customer from the top 5 debtors or enter a phone, then amount, then confirm.
- Who owes: top 5 by balance with totals, plus the grand total.
- First dial from an unknown number: register the shop name.
- Pure state machine. Every screen is 182 characters or fewer and starts with CON/END. Property test: any random input sequence never throws and never produces a screen over 182 characters.

## Spec 3: `zimwi-reminders`
- Daily job picks debts that are due or overdue and the tone level (see zimwi-voice steering), with at most 1 SMS per customer every 3 days.
- Inbound SMS replies: `LIPA` (customer says they paid, so notify the owner to confirm), `TAREHE dd/mm` (promise date, which pauses reminders until then), `SITAKI` (dispute, so notify the owner and stop).
- All templates are 160 GSM-7 characters or fewer, in sw + en. A hook verifies this.

## Spec 4: `web-simulator` (judges' entry point)
- A browser "kitochi" phone UI that calls the same USSD handler through `/api/sim/ussd`, plus an SMS inbox panel showing what the Zimwi would send.
- Seeded demo shop "Duka la Mama Asha" with 6 customers.
- One-click "advance time 7 days" to watch the Zimwi get grumpier.

## Spec 5: `haunted-ledger`
- Dashboard: total owed, recovered this week, list of customers with a "Zimwi mood" badge, and a fog/candlelight theme.
- Read-only for v1, with a magic-link login by SMS code.

## Spec 6: `landing`
- A one-page startup site (required for Best Startup): the problem (with interview numbers), how it works, a demo link, pricing idea, and the founder.
