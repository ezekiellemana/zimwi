# Devpost write-up (DRAFT)

> Draft to paste into the Devpost form. Anything in [brackets] still needs filling in. Sections marked _(planned)_ describe parts not built yet; update them before submitting, because judges check that the app works as described.

**Project name:** ZIMWI 👹
**Tagline:** A USSD + SMS debt ledger for Tanzanian shops, with a playful ogre that chases what customers owe.
**Category:** Resurrection. Bonus: Best Startup Project, Best Demo, Blog Post, Social Blitz.

## Inspiration
In Tanzania, almost every neighbourhood duka sells on credit, and the debts live in a paper notebook, the *daftari la madeni*. Shopkeepers lose money when customers forget, and chasing a neighbour for TSh 5,000 is awkward. [Add interview numbers: how many shop owners you spoke to, how many keep a daftari, and roughly how much goes unpaid each month.]

Most of these owners and customers use basic "kitochi" phones with no data. Apps don't reach them, but **USSD and SMS** do. Many developers consider that tech dead, yet it still quietly runs East Africa. So we resurrected it.

## What it does
- The **shop owner dials a USSD code** to record a debt ("Juma owes 5,000"), record a payment, and see who owes what. It works on any phone, Swahili first, with an English switch.
- **Customers get SMS reminders from the Zimwi**, a cheeky ogre from Swahili folklore. Its tone climbs a four-step ladder, from a friendly nudge to "THE ZIMWI IS HUNGRY!", the longer a debt goes unpaid. It teases but never shames. _(planned)_
- Customers can **reply by SMS**: `LIPA` (I've paid), `TAREHE dd/mm` (I'll pay on this date), `SITAKI` (I dispute this). _(planned)_
- A **web phone simulator** lets anyone in the world, judges included, try the real USSD flow in a browser and watch the Zimwi's SMS arrive. _(planned)_
- A **"haunted ledger" dashboard** shows the shop's debts with a fog-and-candlelight theme. _(planned)_

## How we built it
- **Stack:** TypeScript (strict) on Node 24, Hono, PostgreSQL with Drizzle ORM, Vitest + fast-check, Africa's Talking for USSD/SMS _(planned)_, React + Vite for the web _(planned)_, deployed on Render + Neon _(planned)_.
- **Money is exact:** every amount is an integer number of TZS. There are no floats anywhere. Postgres `CHECK` constraints reject non-positive amounts, and recording a payment locks the customer row so two payments can't overdraw a balance.
- **The USSD menu is a pure state machine.** Africa's Talking sends the whole input history on every request, so we replay it through `step(state, input) -> (screen, state)` and need no session table. This makes the menu fully property-testable.

## How we used Kiro
_(Keep this in sync with [KIRO.md](../KIRO.md). Judges weigh this heavily.)_
- **Steering:** `product.md`, `tech.md` and `structure.md` are always loaded. They hold hard rules such as "USSD screens ≤ 182 characters", "SMS ≤ 160 GSM-7 characters", "never log full phone numbers" and "integers only for money". `zimwi-voice.md` only loads when Kiro edits USSD/SMS copy, so the ogre's personality and tone ladder show up exactly where they're needed.
- **Spec-driven development:** each feature started as a Kiro spec with EARS-style requirements, a design and a task list. Reviewing the ledger spec *before any code existed* caught two real money bugs: balances were silently clamped at zero, which hid errors and made the "never negative" test meaningless, and payments had no row lock, so two payments at once could overdraw. Vibe coding would likely have shipped both.
- **Property-based testing:** five fast-check properties guard the ledger. The balance is never negative, payment order doesn't matter, total owed equals the sum of balances, over-payments are rejected, and the real database (in-process PGlite) matches a pure model. The USSD spec adds "any random input never crashes, and every screen is ≤ 182 characters and starts with CON/END".
- **Kiro CLI, headless:** we drove Kiro with `kiro-cli chat --no-interactive`, letting it read and write files while we ran the tests. Every failure went back to Kiro as a prompt, so Kiro wrote all of the application code.
- **Agent hooks:** _(planned)_ on save, re-run the USSD length property tests and the ledger tests.
- **MCP:** _(planned)_ an Africa's Talking sandbox MCP server so Kiro can send test SMS and simulate USSD sessions.
- [Add: IDE vs CLI comparison, any custom agent or power you used.]

## Challenges we ran into
- Fitting a useful menu, a shop name and five debtors into 182 characters, in two languages.
- Writing SMS that are funny in Swahili *and* English within 160 GSM-7 characters. A single curly apostrophe forces UCS-2 and halves the limit.
- Keeping the USSD flow stateless while still confirming before anything is written.
- [Add any real ones from the rest of the build.]

## Accomplishments that we're proud of
- The ledger's correctness is backed by property tests, not hope.
- It works on a TSh 20,000 kitochi phone with no internet.
- [Add after the demo works end to end.]

## What we learned
- Spec review is cheapest before the code exists.
- [Add.]

## What's next for ZIMWI
- Pilot with [N] dukas in [area].
- Mobile-money reconciliation (M-Pesa, Tigo Pesa, Airtel Money). Payments are out of scope for v1.
- [Pricing idea, for example a small monthly fee per shop or per SMS bundle.]

## Built with
typescript · node.js · hono · postgresql · drizzle · pglite · vitest · fast-check · kiro · africa's-talking · ussd · sms · react · vite · render · neon

## Links
- Live simulator: [URL]
- GitHub: https://github.com/ezekiellemana/zimwi
- Video (YouTube, under 3 minutes): [URL]
- Startup site: [URL] · Founder LinkedIn: [URL]
- Blog post: [URL] · Social post (#KiroweenHackathon26): [URL]
