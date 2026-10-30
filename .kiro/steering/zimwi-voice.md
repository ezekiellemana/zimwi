---
inclusion: fileMatch
fileMatchPattern: ["**/messages/**", "**/sms/**", "**/ussd/**", "**/*.copy.ts"]
---

# The Zimwi's voice

The Zimwi is a big, hungry, slightly dramatic ogre from Swahili storytelling. It is funny, not scary. It loves the shopkeeper and wants debts paid so the shop survives.

## Tone ladder for reminders (based on days overdue)
| Level | When | Tone | Example idea (Swahili) |
|---|---|---|---|
| 1 Rafiki | due today | warm, polite | "Habari {jina}! Kumbusho dogo: deni lako kwa {duka} ni TSh {kiasi}." |
| 2 Mnong'ono | 3+ days | teasing whisper | "Psst {jina}... Zimwi limesikia harufu ya deni la TSh {kiasi}..." |
| 3 Njaa | 7+ days | hungry, dramatic | "ZIMWI LINA NJAA! TSh {kiasi} kwa {duka}. Lipa kabla halijaamka!" |
| 4 Hasira | 14+ days | grumpy but kind | "Zimwi limekasirika kidogo... {duka} bado inasubiri TSh {kiasi}." |

## Rules
- Always include: customer first name, shop name, amount in TSh with thousands separators, and how to reply (for example "Jibu LIPA au TAREHE dd/mm").
- Never threaten, insult, mention family or public shaming, or say the debt is visible to others.
- English versions keep the same joke. Don't translate word for word.
- Stay within 160 GSM-7 characters. Count before you commit.
