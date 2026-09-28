# Private saved lineups

The web app uses Supabase Auth (email sign-in links) and Postgres for named lineup
scenarios. FastAPI remains responsible for football data and simulation. No
service-role key, extra worker, realtime subscription, or storage bucket is needed.

## Provisioned project

- Project: [Prem Predict](https://supabase.com/dashboard/project/polortxuftiyuxqxcqer)
- Organization: **GiwinEdwin09's Org** (`gpqamsrkpqwmojcinozo`)
- Project reference: `polortxuftiyuxqxcqer`; region: **us-west-1**
- API URL: `https://polortxuftiyuxqxcqer.supabase.co`
- Supabase quoted **$0/month** at creation.
- Migration `20260928042754_private_lineup_scenarios.sql` is applied remotely.
  Its local timestamp matches the version assigned by the Supabase connector.
- Local `apps/web/.env.local` contains the project URL and publishable key and is
  excluded from Git. No secret/service-role key is used.

Hosted SQL verification passed for owner isolation, denied anonymous access,
archive/restore, optimistic version checks, denied deletion, and denied ownership
changes. Verification ran in a rolled-back transaction, leaving no test users or
saved scenarios. Security Advisor reported no issues. Performance Advisor reported
only an [unused-index informational notice](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) on this newly created empty database;
the owner/recent index is intentional for listing a user's saves.

The public Auth settings endpoint confirms Email is enabled, sign-ups are allowed,
email confirmation is required, and anonymous sign-in is disabled. **Public sign-in
is not yet ready:** configure production/local callback URLs and custom SMTP, add
the public connection variables to Vercel, redeploy, and test email sign-in. The
local app also needs the existing Render `API_BASE_URL` for roster validation when
saving. The connector does not expose Auth-settings updates; dashboard access is
needed for that remaining setup.

## Provision and connect

1. Create a Supabase project named **Prem Predict** in the appropriate organization.
   Choose a region near the existing Render/Vercel deployment. Check the organization's
   plan before creating a project; an additional project on a paid plan can add costs.
2. Apply `migrations/20260928042754_private_lineup_scenarios.sql` to that new project
   using Supabase migrations or the SQL Editor. Do not apply to an unrelated project.
3. Set the variables in `apps/web/.env.example` in `apps/web/.env.local` and in the
   Vercel project's deployment environment. Use the publishable key, never an admin key.
4. In Supabase Auth, enable Email sign-in and sign-ups, keep email confirmation on,
   and keep anonymous sign-in off. Set Site URL to the production app URL and allow
   only the production `/auth/callback` URL and `http://localhost:3000/auth/callback`
   while developing. The README currently identifies production as
   `https://fpl-predictor-bay.vercel.app`. Configure any actual custom domain explicitly.
5. Configure a production SMTP provider and verified sender for public sign-in emails.
   Supabase's built-in sender is limited to authorized project-team addresses and
   is not suitable for public sign-ups. The default magic-link email template works
   with the PKCE callback; links should be opened in the same browser that requested them.
6. Redeploy the web app after setting public environment variables (they are compiled
   into the client bundle). Test a real email sign-in and two separate accounts.

## Data and access model

`auth.users` is the identity source. `lineup_scenarios.user_id` references it and
defaults to `auth.uid()`. No duplicate profile table is necessary yet.

Each scenario stores its name, season-scoped fixture/player identifiers, both teams'
selected XIs, a snapshot of player/team names, creation/update timestamps, archive
timestamp, and an incrementing version. Names make older selections readable after
transfers or season rollover. Roster membership is verified against FastAPI before
the app saves. Users can access the Data API with their own token; structural database
constraints and RLS remain enforced even when they bypass the application routes.
These are user-authored selections, not trusted official prediction records.

RLS restricts SELECT, INSERT and UPDATE to the owner. Column grants also prevent
changing ownership or the original selections. Edits in the simulator create new
scenarios. Rename/archive/restore use optimistic version checks so another device's
changes are not silently overwritten. There is no user DELETE grant. Account deletion
by an administrator cascades to the account's scenarios; archives are not backups.

Forecasts are intentionally recalculated on reopen and labelled as current. We do
not save probabilities without model provenance or pretend to reproduce the original
forecast. Saved scenarios remain readable if the inference service is unavailable.
Sharing and leaderboards are not enabled; future sharing needs a separate access model.

## Verification

From `apps/web`, run `npm test`, `npm run typecheck`, and `npm run build`.
The database test runs the actual migration in PGlite (Postgres) with test-only
`auth.users` / `auth.uid()` definitions and separate authenticated and anonymous roles.
It verifies ownership, forged owner rejection, no delete, archive/restore, malformed
lineups, and stale-version rejection. It does not replace hosted Supabase tests.

After provisioning, run Supabase's security/performance advisors and verify:

- Account A saves a lineup, signs out, signs back in, and can reopen it.
- Account B cannot list/read/update A's UUID through either the app API or Data API.
- A new browser/device signed into A sees the same saves.
- Archived lineups can be restored; stale updates return 409.
- Private responses have `Cache-Control: private, no-store`; no user data enters shared caches.
- A failed network save remains retryable and does not create duplicate scenarios.

Choose a backup policy before treating saves as production-critical. Free projects
can pause and lack automatic backups; a paid plan or scheduled protected exports can
provide a recovery path. Never commit exported user data or authentication secrets.
