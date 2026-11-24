# Phase 2B — loans and instalments

Phase 2A live acceptance: user reported all ten checks passed on 2026-11-24. Previous automated results remain as documented in phase-2a.md.

Phase 2B adds contractual repayment totals, prior payments, monthly instalments, start/first remaining due/end dates, exact minor-unit arithmetic, month-end anchoring, adjusted final instalment, archive/restore and owner-visible history. End date must accommodate the complete remaining schedule (maximum 361 instalments). Fully prepaid loans have no schedule. No new payment transactions or cash movement are recorded. Past dates do not imply verified overdue payments.

Edits regenerate the remaining schedule atomically and retain before/after snapshots. Before Phase 2D, settlement references must prevent destructive regeneration and ensure archived loans are excluded from obligations. No loan instalment should be counted twice as an expense.

## Verification
Not yet executed: typecheck, unit tests, static build, local database migration/tests and authenticated browser acceptance. Run npm ci, npm run typecheck, npm test, npm run build. Use a disposable local Supabase instance and npm run test:db. Do not apply the migration to production until reviewed and tested; apply it before deploying the new frontend.

Acceptance: create a loan with a prior payment and Jan 31 first due; verify month-end anchoring and partial final instalment; reject insufficient end date; edit and inspect history; archive/restore; check viewer and unrelated account restrictions; check mobile and desktop.
