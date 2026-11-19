# Google sign-in and cloud saves

Spriggan uses Supabase Auth for Google sign-in and one private park snapshot per account. Players explicitly choose **Save to cloud** or **Load cloud save**. Signing in does not replace their local park. Revision numbers prevent a stale device from silently overwriting a newer cloud save; they do not retain a version history.

The files in this repository prepare the integration. A project administrator must still apply the migration, enable Google, configure redirects, and supply the public project settings. Local checks do not establish that a hosted project is configured or that a real Google sign-in succeeds.

## 1. Create or choose the Supabase project

Use the intended project and open its **Connect** dialog or **Settings → API Keys**. Copy the project URL and its `sb_publishable_...` key. The publishable key belongs in the browser; access to private saves is enforced using the signed-in user's identity, database grants, and RLS. A secret key or legacy `service_role` key must never be put in the static app. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

In the project's Data API settings, confirm the Data API is enabled and `public` is an exposed schema. Keep the migration's specific grants; enabling the API does not require broad table write access. See [Securing your API](https://supabase.com/docs/guides/api/securing-your-api).

## 2. Apply the migration

Open the project's SQL Editor as the database owner, review and run:

[`supabase/migrations/202611190001_park_saves.sql`](../supabase/migrations/202611190001_park_saves.sql)

Alternatively, include this file in an existing Supabase CLI migration workflow. The file can be reapplied without deleting saved rows; it replaces its function and its named read policy.

The migration creates `public.park_saves`:

| Column | Meaning |
| --- | --- |
| `user_id` | Primary key referencing `auth.users.id`; deleting the account deletes its cloud snapshot. |
| `payload` | The portable Spriggan backup, stored as JSONB. |
| `revision` | Positive server-controlled counter, starting at 1. |
| `updated_at` | Server timestamp of the successful save. |

Authenticated clients receive `SELECT` access with an own-row RLS policy. Direct `INSERT`, `UPDATE`, and `DELETE` are revoked. The `save_park` function is the sole client write path: it derives the owner from `auth.uid()`, fixes its search path, and grants execution only to `authenticated`. These controls follow Supabase's [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database function security guidance](https://supabase.com/docs/guides/database/functions).

The server checks the backup envelope (`format: "spriggan-park"`, `version: 1`, an ISO timestamp, and an entries object), the 18 permitted save keys, and string entry values. Its serialized JSONB limit is 2 MiB. The browser's `SprigganSaves` module additionally validates each game's data before saving or restoring it. Do not add Supabase session tokens, unrelated browser storage, or Google credentials to the backup.

## 3. Configure Google

In the Google Auth Platform console, configure the app's consent details and create an OAuth client with application type **Web application**.

Add each app origin to **Authorized JavaScript origins**, such as `https://YOUR_APP_DOMAIN` and your development origin `http://localhost:8000`. In **Authorized redirect URIs**, add the callback copied from the project's Supabase Google provider page. For a standard hosted project it is:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

In Supabase **Authentication → Sign In / Providers → Google**, enable Google and enter the Google client ID and client secret. The Google secret stays in the provider settings. Follow the current [Supabase Google setup instructions](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), including any requirements shown for your Google app's publishing status.

## 4. Allow the app's return URLs

In Supabase **Authentication → URL Configuration**, set **Site URL** to the canonical production park URL with its trailing slash, for example `https://YOUR_APP_DOMAIN/`. Add that exact URL to the redirect allowlist, together with each development or preview park URL you actually use:

```text
https://YOUR_APP_DOMAIN/
http://localhost:8000/
```

Use the port from your local server. `localhost` and `127.0.0.1` are separate origins; allow the one you use. Add a preview deployment explicitly when testing there. The OAuth return URL is the park root selected by the app, while Google's redirect URI points to Supabase's callback. Supabase recommends exact production redirect paths; see [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 5. Supply the public settings and deploy

Set [`dist/shared/cloud-config.js`](../dist/shared/cloud-config.js) to:

```js
window.SPRIGGAN_CLOUD_CONFIG = Object.freeze({
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  publishableKey: 'sb_publishable_YOUR_PUBLIC_KEY'
});
```

These two values are public project settings. Keep the Google client secret and all elevated Supabase keys out of this file. Spriggan serves static files without a build step, so setting a Vercel environment variable alone does not rewrite this JavaScript file. Deploy the updated file and the complete `dist` directory through the existing deployment workflow.

Empty settings leave guest play and local backups available. The SDK is served from the vendored `dist/shared/vendor/supabase.js`; changing project settings does not require replacing the SDK.

The sign-in button stays disabled while provider availability is checked. If Google is disabled, players see that sign-in is being prepared and can keep playing locally. After enabling Google, **Try cloud again** checks the current settings without a deployment. A network failure also leaves guest play available.

Loading a cloud copy replaces the whole set of supported park saves, including removing world entries absent from that snapshot, so linked rewards and receipts stay together. Before replacement, the app stores the current park under the separate device-only `spriggan.cloud.recovery.v1` key. **Restore previous browser park** makes that copy usable; it is excluded from cloud snapshots. A browser storage failure blocks loading before any game data changes. Close other Spriggan tabs before loading because old in-memory autosaves can replace imported data.

## Client/database contract

Read the current snapshot using an authenticated Supabase client:

```js
const { data: row, error } = await client
  .from('park_saves')
  .select('payload,revision,updated_at')
  .eq('user_id', user.id)
  .maybeSingle();
```

A successful read with `row === null` means there is no cloud park yet. A failed read does not establish that the park is absent.

Save through the RPC, passing the revision from the most recent successfully reviewed cloud snapshot:

```js
const payload = JSON.parse(SprigganSaves.exportBackup());
const { data, error } = await client.rpc('save_park', {
  p_payload: payload,
  p_expected_revision: row ? row.revision : null
});
// Success: data is [{ revision: 1, updated_at: '...' }] on the first save.
```

| Expected revision | Result |
| --- | --- |
| `null`, no existing row | Inserts revision 1. |
| `null`, row already exists | `P0001` / `SAVE_CONFLICT`; preserves the existing cloud snapshot. |
| Current revision | Atomically replaces the snapshot and increments the revision. |
| Stale revision or missing row | `P0001` / `SAVE_CONFLICT`; writes nothing. |

A conflict requires reviewing the newer cloud snapshot before choosing another save or restore. Never automatically retry with a freshly fetched revision, use a blind upsert, or silently restore over local progress. Other explicit RPC errors are `42501` / `AUTH_REQUIRED`, `22023` / `INVALID_BACKUP`, and `22001` / `BACKUP_TOO_LARGE`.

## Verify before enabling production sign-in

Use two separate browser profiles and two Google test accounts against a development Supabase project. Use disposable test parks before restoration tests; the interface keeps an automatic device recovery copy.

1. With cloud settings empty or the network unavailable, verify guest worlds still save locally and no manual file controls appear.
2. Sign in as account A, save a distinctive park, reload, and read its cloud timestamp. Restore it only after the confirmation. Signing out must leave local progress intact.
3. Sign in as account B in the other profile. It must initially see no cloud park belonging to A. After B saves, both accounts must keep independent payloads and revisions. A request filtered to A's UUID while authenticated as B must return no row.
4. Using each signed-in test client's console or an API test harness, attempt direct table insert, update, and delete. Each must be denied. An unauthenticated client must be denied both table reads and RPC execution. Do not use the SQL Editor's owner session to prove client isolation.
5. In two tabs for A, read the same revision. Save in the first, then try the stale revision in the second. Expect `SAVE_CONFLICT` and an unchanged cloud payload. Two first saves both using `null` must likewise produce one success and one conflict.
6. Try an unsupported backup key, a non-string entry value, an invalid timestamp, and a payload over 2 MiB. Each must fail without changing the saved revision. Confirm a bad game-specific payload is rejected by the browser before restoration.

Catalog checks can be run separately in the project's SQL Editor:

```sql
select
  has_table_privilege('authenticated', 'public.park_saves', 'SELECT') as signed_in_can_read,
  has_table_privilege('authenticated', 'public.park_saves', 'INSERT') as direct_insert,
  has_table_privilege('authenticated', 'public.park_saves', 'UPDATE') as direct_update,
  has_table_privilege('authenticated', 'public.park_saves', 'DELETE') as direct_delete,
  has_function_privilege('anon', 'public.save_park(jsonb,bigint)', 'EXECUTE') as guest_can_save;
-- Expected: true, false, false, false, false.
```

During implementation the migration was applied twice to an isolated PostgreSQL 17.6 database with stub Supabase roles and identity functions. Local tests covered permissions, two-account isolation, input rejection, revision conflicts, concurrent writers, and account-deletion cascade. The temporary server was stopped afterward. Real Google OAuth, hosted Supabase configuration, and PostgREST requests still require the checks above.

## Disable cloud access or roll back the app

Set the public config values back to empty strings and redeploy to return the app to guest mode. Existing browser saves and device recovery copies remain usable. Keep the cloud table so account snapshots remain available if cloud access is reenabled; dropping the table would delete them.

If cloud writes must be stopped at the database while an older deployment is still available, an administrator can run:

```sql
revoke execute on function public.save_park(jsonb, bigint) from authenticated;
```

Reapplying the migration restores its intended grants. Keep local saves and cloud snapshots until recovery is complete; no rollback step requires deleting either.
