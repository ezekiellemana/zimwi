---
inclusion: always
---

# ZIMWI: product

## What it is
ZIMWI is a debt ledger for small Tanzanian shops (dukas). It runs on **USSD and SMS**, which most people now think of as dead technology, so it works on any phone, including a basic "kitochi" with no data. This is our entry in the Kiroween 2026 **Resurrection** category.

- The **shop owner** dials a USSD code to record a debt ("Juma owes 5,000"), record a payment, and see who owes what.
- **Customers** get SMS reminders from the *Zimwi*, a cheeky ogre from Swahili folklore. Its tone gets grumpier the longer a debt stays unpaid.
- A **web phone simulator** on the live site lets anyone, including judges outside Tanzania, try the full USSD flow and see the SMS in a browser.
- A **"haunted ledger"** web dashboard shows the shop's debts as a spooky, polished UI.

## Who it is for
- Primary: duka owners who keep debts in a paper notebook (*daftari la madeni*), lose money when customers forget, and feel awkward chasing friends and neighbours.
- Secondary: customers, who get a friendly nudge they can laugh at instead of a confrontation.

## Product principles
1. **Works on a kitochi first.** Every core action must be possible over USSD. The web UI is a bonus and never required.
2. **Swahili first, English second.** All user-facing text exists in both languages. Default to Swahili.
3. **Playful, never shaming.** The Zimwi teases. It never insults, threatens, or reveals the debt to anyone except the customer.
4. **Owner stays in control.** Reminders only go out for debts the owner recorded. Customers can reply to dispute or to promise a date.
5. **Money is exact.** Amounts are whole Tanzanian shillings (TZS, integers). There are no floats anywhere.

## Out of scope
Payments, lending, credit scoring, and multiple shops per owner (for now).
