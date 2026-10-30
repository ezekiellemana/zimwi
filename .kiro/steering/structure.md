---
inclusion: always
---

# ZIMWI: repo structure

```
server/
  src/
    ledger/       # debts, payments, balances (pure logic + db access)
    ussd/         # USSD state machine (pure) + AT callback route
    sms/          # reminder scheduler, templates, inbound replies
    telecom/      # Africa's Talking client + fake for simulator/tests
    db/           # drizzle schema + migrations
    index.ts      # Hono app
  test/           # vitest + fast-check
web/
  src/
    simulator/    # browser phone that talks to the real USSD handler
    ledger/       # haunted ledger dashboard
docs/             # brief, interviews, kiro write-up notes
KIRO.md           # running log of how each Kiro feature was used
```

- Keep pure logic separate from I/O, so it can be property-tested.
- One feature folder per domain. Don't create a shared `utils` grab-bag.
