# How Kiro was used to build ZIMWI

A running log for the Kiroween 2026 write-up. Add an entry each time a Kiro feature is used.

## Steering
- `product.md`, `tech.md` and `structure.md` are always included.
- `zimwi-voice.md` is conditional (fileMatch on messages/sms/ussd), so the ogre's tone only loads when copy is being written.

## Specs
_(record each spec: what was generated, what was changed, and spec vs vibe comparison)_

## Agent hooks
_(planned: USSD 182-character check on save, SMS 160 GSM-7 check, run property tests on ledger changes)_

## MCP
_(planned: Africa's Talking sandbox MCP server so Kiro can send test SMS and simulate USSD sessions)_

## Property-based testing
_(fast-check: ledger invariants, USSD state machine never exceeds 182 characters)_

## Kiro powers / custom agents / CLI vs IDE
_(fill in as used)_
