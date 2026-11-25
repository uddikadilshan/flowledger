# Phase 2C — Collections & external funding

Phase 2B live acceptance: user reported all 12 checks passed on 2026-11-25. Independent automated results have not been supplied.

Incoming funds are positive minor-unit amounts, recorded on business-local dates from the opening balance effective date through today. Opening balance is interpreted as funds at the start of its effective date, before that day's entries. Multiple entries per day are supported. External funding is not business collection revenue. Available funds are opening balance plus non-reversed incoming funds through today, before settlements; this is not a reconciled bank balance.

Owners can create, correct, reverse and restore entries. Corrections, reversals and restorations require a reason. Original values remain in append-only owner-readable history. Version checks reject stale changes and create IDs protect retries. Viewers can read entries and totals; other businesses are isolated by RLS. No offline writes. Currency and opening balance date are locked once any incoming entry exists, including reversed entries. Opening balance amount can still be corrected through business settings under existing rules.

Migration: 20261125010000_collections_funding.sql. No settlements, payment allocation, target calculation or notifications are included. Future settlement implementation must protect allocated fund entries from correction/reversal and deduct actual payments from available funds.

## Verification
Not executed in the implementation environment: typecheck, unit tests, static build, local database tests, authenticated browser checks. Run npm ci, npm run typecheck, npm test, npm run build, and npm run test:db against a disposable local Supabase instance with all migrations applied. Review and back up production before applying the migration. Do not merge until verified.

Live acceptance: add two collections on the same day; add external funds; verify separate daily/monthly totals and opening-balance calculation; correct, reverse, restore and view history; check date validation, owner/viewer access, mobile layout and regression of expenses/loans.
