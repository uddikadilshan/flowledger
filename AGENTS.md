# FlowLedger development

Keep Next.js in static export mode. No Server Actions, API routes or server-only session assumptions. Use Supabase Auth in the browser; only publishable configuration belongs in NEXT_PUBLIC variables.

Enforce business access in PostgreSQL, never only in UI. All exposed tables require RLS; all mutations require verified identity and owner checks. Keep privileged implementations in the unexposed private schema with fixed search_path. Do not trust user_metadata for roles.

Phase 1 is business setup and access. Phase 2A adds categories and scheduled expenses. Recurrence creates finite monthly occurrences (up to five years), edits and soft-deletes apply to one occurrence, and owner-visible history is append-only. Amounts use integer minor units; keep optimistic version checks and create-request idempotency. Do not present mock financial totals as real data. Future money logic must use exact decimal/minor-unit arithmetic and atomic database transactions.

Preserve mobile layouts, visible financial numbers, navy/teal/mint palette. Never cache private API responses or queue offline mutations. Keep migrations additive after release. Run typecheck, tests and static build; explicitly report unavailable integration tests.
