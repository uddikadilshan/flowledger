# Phase 3: Smart daily collection targets

Live Phase 2D acceptance: user reported 16/16 passing. Phase 3 uses existing RLS-protected settlement_targets, settlement_balance and fund_totals RPCs; no migration required.

## Algorithm
For each cumulative deadline, subtract current available business and external cash once, then divide the positive shortfall by remaining working days (including today and the due date if working). Round up to the minor unit. The maximum required rate protects all deadlines under the assumption of constant future collections. Overdue items are grouped into today's deadline. On non-working days, immediate funding gaps before the next working day are shown separately; later collection rates assume that emergency funding is arranged. No holiday calendar or intraday timing. External funds never count as actual collections.

The selected horizon is current month-end, next month-end or two months beyond current month-end. All earlier unpaid obligations are included. Targets are live additional requirements, not persisted morning goals; today's collections are already in the balance. No historical target performance or notifications yet. Separate RPC requests may observe concurrent changes; refresh after changes.

## Verification
8/8 rollback database integration assertions passed on connected Supabase: paid amount, both obligation types, both cash pools, actual collections, viewer access, outsider targets and outsider balance. No production migration or test records retained. Eleven planner unit cases authored; run npm test, npm run typecheck and npm run build before merge. Live acceptance: check early deadline dominates average, external funding reduces target but not collection totals, overdue items, nonworking day gaps, partial/full payments, horizon filters, viewer and mobile layout.
