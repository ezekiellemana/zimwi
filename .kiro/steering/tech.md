---
inclusion: always
---

# ZIMWI: tech stack and rules

- **Language:** TypeScript (strict), Node 24.
- **Server:** Hono on Node. One service serves the USSD callback, the SMS webhooks, the JSON API and the built web app.
- **Web:** React + Vite (in `web/`), for the phone simulator and the haunted ledger dashboard.
- **Data:** PostgreSQL through Drizzle ORM. Amounts are stored as `integer` TZS.
- **Telecom:** Africa's Talking **sandbox** for USSD and SMS. Keep all AT calls behind one `telecom` module, so the simulator can use a fake implementation with the same interface.
- **Tests:** Vitest, plus **fast-check property-based tests** for the ledger maths and the USSD state machine.
- **Deploy:** Render web service + Neon Postgres. Secrets only come from environment variables.

## Hard rules
- **USSD screens are 182 characters or fewer.** Every screen starts with `CON ` (continue) or `END ` (final), as Africa's Talking expects.
- **SMS templates are 160 GSM-7 characters or fewer** in each language. Avoid characters that force UCS-2.
- USSD handlers are **pure functions** of `(sessionState, input) -> (screen, newState)`, so they can be tested without a network.
- Never log full phone numbers. Mask them as `+2557XX XXX 123`.
- Phone numbers are normalised to E.164 (`+255...`).
- No secrets in the repo. `.env.example` lists every variable.
