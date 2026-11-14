# Phase 2A acceptance

Implemented: business-specific categories with rename/delete/restore; expense title, description, exact amount, category and due date; finite monthly schedules; month filter and scheduled totals; individual edit/delete/restore; owner-readable change history; database permissions for owners, viewers and outsiders.

Deletion is soft deletion. Audit records preserve before/after values and actor identity. Category deletion is blocked while active expenses reference it. Restoring an expense requires an active category. Future settlement modules must extend these controls to protect settled records.

Scope boundaries: no paid/unpaid calculations, loan schedules, collection records, external settlements, dashboard targets, reminders, indefinite recurrence or bulk series edits yet. A past date is labeled as past due date, not an assertion that the expense is unpaid.

Validation: frontend typecheck, static export, 8 unit tests; PostgreSQL transaction tests cover recurrence month ends, exact amounts, create retry idempotency, category references, stale edits, delete/restore, audit history, member isolation and archived business writes. All database fixtures are rolled back. No real customer records are changed by tests.

After merging and deployment, verify on desktop and mobile: create category, add one-time expense, create Jan 31–Mar 31 monthly schedule, navigate months, edit one occurrence, delete/restore and open history. Check with a viewer account. Browser interactions against authenticated accounts still need this final acceptance check.

Deployment state: the additive Phase 2A migration is applied to the connected FlowLedger project. All 19 database assertions and 8 frontend unit tests passed. Test fixtures were rolled back. The frontend change awaits PR merge and deployment.

Security advisor: no new database schema warnings. Auth reports leaked-password protection disabled; review [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). This setting was not changed.
