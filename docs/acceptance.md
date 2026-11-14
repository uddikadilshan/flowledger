# Phase 1 acceptance checklist

Automated local checks: TypeScript, input-validation tests, production static export.

Before merging for production, use a disposable Supabase project with email delivery and two verified users:

- Owner signup, confirmation, logout/login and reset link (valid, expired, reused).
- Create two businesses, reload, switch, edit and verify isolation with a third unrelated user.
- Invite the viewer email, copy link, accept while signed out, verify one-use, expiry, wrong-email and revocation failures.
- Viewer can read the invited business but cannot mutate it using UI, direct REST, or RPC; cannot inspect invitation hashes or another business.
- Owner cannot remove their own owner membership. Removed viewer loses subsequent data and logo access; existing signed URLs can remain valid for their five-minute lifetime.
- Upload valid logo; reject oversized and unsupported images; try writing to another business folder.
- Archive/restore, ensure writes and invite acceptance fail while archived.
- Mobile at 375px: navigation, forms, long names, keyboard and amount readability.
- Install PWA on supported browser over HTTPS. Offline navigation shows reconnect page; reconnect permits writes; sign out clears rendered business data.
- Verify no service-role/secret key in the exported output. Keep private schema unexposed.

Not yet verified: database migration execution, RLS integration tests, real auth/email/storage, mobile browser and installed PWA testing. No Supabase project was configured in this workspace.

Design choice: archive replaces destructive business deletion in Phase 1. Automatic invitation emails and background push scheduling require later backend work. Public frontend configuration is safe only with correctly deployed database permissions.
