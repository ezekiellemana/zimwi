# Kiroween 2026: submission checklist

Source: https://kiroween.devpost.com/rules (checked on Oct 31, 2026).

## Key dates (Pacific Time)
| What | When |
|---|---|
| Submission deadline (no late entries) | **Fri Dec 4, 2026, 2:00 pm PT** (Sat Dec 5, 1:00 am EAT) |
| Kiro credit request form deadline (4,000 credits per entrant) | **Tue Dec 1, 2026, 12:00 pm PT** (request ASAP; allow 48 business hours) |
| Redeem credit codes by | Fri Dec 4, 2026 |
| Judging | Dec 16, 2026 to Jan 29, 2027 |
| Winners | around Feb 3, 2027 |

## Required for every submission
| # | Requirement | Status |
|---|---|---|
| 1 | Working app built with Kiro, in one category (ZIMWI: **Resurrection**) | 🟡 ledger-core done; USSD, SMS, simulator, dashboard and landing still to build |
| 2 | Public URL to the functional app (plus login and testing instructions if needed) | 🔴 not deployed yet (plan: Render + Neon, with the web simulator as the judges' entry point) |
| 3 | Text description of the features | 🟡 draft in `docs/devpost.md` |
| 4 | Demo video **under 3 minutes**, public on **YouTube**, showing it working on the target device, with no copyrighted music | 🔴 not started |
| 5 | Public **GitHub** repo with all code, assets and run instructions | 🟡 public; README needs setup/run instructions |
| 6 | Open-source license visible in the repo's About section | ✅ MIT, detected by GitHub |
| 7 | `/.kiro` directory at the repo root (specs, hooks, steering), **not** in `.gitignore` | 🟡 steering + 2 specs are present; hooks still to add. `.gitignore` is clean ✅ |
| 8 | Category + bonus categories chosen in the form | 🔴 do it on submission |
| 9 | Write-up on how Kiro was used (IDE/CLI, custom agents, hooks, specs vs vibe, steering, MCP, PBT, powers) | 🟡 `KIRO.md` covers specs, steering, PBT, CLI; hooks, MCP and powers still empty |
| 10 | English materials (Swahili UI is fine, but the video and description need English) | 🟡 plan English narration or subtitles |
| 11 | Disclose any pre-existing code | ✅ none; repo started Oct 30, 2026 (the submission period opened Oct 30, 9 am PT) |

## Bonus prizes worth going for
| Prize | What it needs | Notes |
|---|---|---|
| **Best Startup Project** ($10k) | Confirm you're a founder, LinkedIn profile, startup website | The `landing` spec (Spec 6) gives us the website |
| **Best Demo** | Top Presentation score and top 10% overall | A strong 3-minute video |
| **Blog Post** (2,000 credits, top 100) | Public post on a third-party blog that mentions "Kiroween 2026 hackathon", published during the submission period | e.g. dev.to or Medium; reuse KIRO.md |
| **Social Blitz** (3-month Kiro Pro+, 5 winners) | Post that **starts with** `#KiroweenHackathon26`, your favourite thing about Kiro and how it changed your approach; must be your own words, not AI writing | X or LinkedIn; the profile must match the submission |
| Best Kiro Crew App ($1k) | A separate, newly created Kiro Crew app repo | Optional, only if there's time |
| ~~Best Ghost of Kiroween Past ($2k)~~ | Registered for Kiroween 2025 | ❌ Not eligible: this is our first Kiroween |
| Best Student Project | All team members are current students, with proof | Only if it applies |

## Judging (5 criteria, 20% each)
Potential Impact · Technological Implementation (depth and variety of Kiro use) · Design · Innovation · Presentation (video).
**To raise the Technological Implementation score:** use more Kiro features. Add hooks, an MCP server (Africa's Talking sandbox), possibly a custom agent or a power, and compare the IDE with the CLI in KIRO.md.

## Things to do now
1. **Request the 4,000 Kiro credits** through the Credit Request Form on the Devpost page. You need your Kiro user ID or AWS account ID. The free plan's 50 credits/month are used up, so this unblocks the build.
2. Join the hackathon on Devpost if you haven't already.
3. Pick the Devpost team (max 3 people) and who the Representative is.
