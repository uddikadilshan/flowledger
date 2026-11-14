# FlowLedger

A mobile-friendly business workspace using Next.js, TypeScript, Tailwind CSS and Supabase. The frontend exports to static files. There is no Next.js runtime server.

## Phase 1

- Email/password signup, verification, login, logout and password reset.
- Create and switch between businesses; edit basic/contact details, currency, timezone, working days and opening funds.
- Private business logo storage.
- Owner/admin controls, view-only membership, email-bound invitation links, revocation and member removal.
- Archive and restore businesses. Permanent deletion is intentionally deferred until dependent financial records exist and retention rules are agreed.
- PWA manifest, icons and offline reconnect page. Financial records are never cached by the service worker; mutations require connectivity.

Loans, expense schedules, daily collections/targets, external settlements, comparisons and notifications are **future phases**, not implemented financial features.

## Run locally

Requires Node.js 22+ (tested with Node 24), npm and a Supabase project.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. These values are intentionally public and bundled into the static app. Never put a service-role key, secret key or database password in a `NEXT_PUBLIC_` variable or the repository. RLS and authenticated database functions enforce access. Without configuration the app displays setup guidance, not simulated data.

## Supabase setup

Review `supabase/migrations/20261114151619_phase_one.sql` before applying it to a new test project. It creates business tables, RLS, scoped RPCs and a private logo bucket. This migration has **not been applied to a live project**.

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Keep only `public` exposed in the Data API; do not expose `private`. Enable email/password authentication and email confirmation. Configure Site URL for your frontend origin, and allow the exact callback URLs `http://localhost:3000/auth/` and `http://localhost:3000/auth/?mode=reset`, plus their HTTPS production equivalents. Configure an email provider for reliable signup/reset delivery before inviting real users. Invitation creation itself sends **no email**: owners copy a link and share it manually. The recipient must sign in with the verified invited address. Links expire in seven days and can only be accepted once. Reopen the original invitation link after verifying in another browser/tab.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

Output is `out/`. Database authorization tests are in `supabase/tests/phase_one.test.sql`. Run them against the local Supabase stack (Docker required):

```sh
npx supabase start
npx supabase db reset
npx supabase test db
```

These database tests and live auth/storage flows still require execution in a Supabase environment; a successful static build does not verify database security end to end. See `docs/acceptance.md`.

## Static hosting

Use a root-domain static host such as Cloudflare Pages: build `npm ci && npm run build`, output directory `out`. Configure the two public environment values at build time, then rebuild after changing them. No Next.js adapter/server is needed. Use HTTPS for PWA installation. This configuration assumes `/` as the base path; GitHub Pages repository subpaths need separate base-path and service-worker changes.

Free hosting/Supabase tiers are the deployment target, not a promise of unlimited usage. Review provider quotas before production. No hosting deployment or paid resources have been created.

## Design

Navy `#112d32`, teal `#087f78`, mint `#e7f4f1`, background `#f5f7f9`. Mobile layouts, 16px form inputs, large tabular amounts. The earlier HTML mockup is in `design-reference/`; its demo data and scripts are not used by the app.
