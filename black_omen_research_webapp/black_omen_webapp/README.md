# Black Omen Research Webapp

A responsive, installable research webapp for the Black Omen / Black Wing Chant. It combines a fixed YouTube song player, curated Bunurong/Boonwurrung research, public unverified word proposals, contributor-owned editing, and protected moderation.

## Run locally

The app has no front-end dependencies. Start a local web server from this folder:

```powershell
python -m http.server 8080
```

Open `http://localhost:8080`. Without Supabase configuration, the app runs in clearly labelled preview mode and stores test proposals only in the current browser.

## Connect the shared database

1. Create a Supabase project and install the Supabase CLI.
2. Link this folder to the project: `supabase link --project-ref YOUR_PROJECT_REF`.
3. Apply `supabase/migrations/202606180001_create_proposals.sql` with `supabase db push`.
4. Set function secrets:

```powershell
supabase secrets set ADMIN_EMAIL="admin@example.com" ALLOWED_ORIGIN="https://your-site.example" RATE_LIMIT_SALT="a-long-random-value"
```

5. Deploy the endpoint: `supabase functions deploy proposals --no-verify-jwt`.
6. In Supabase Authentication, enable email sign-in and add the deployed `admin.html` URL to allowed redirect URLs.
7. Set these public environment values on the static host:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
8. Set the host build command to `npm run build` and publish the project root.

The build generates `config.js`. Only public browser identifiers belong there. The service-role key and administrator allowlist remain server-side in Supabase.

## Security model

- Browser clients have no direct table privileges.
- Public reads and all writes pass through the Edge Function.
- New proposals receive a long edit token. Only its SHA-256 hash is stored on the server; the original remains in the contributor's browser.
- Administrator requests require a valid Supabase session whose email exactly matches `ADMIN_EMAIL`.
- Honeypot validation, length limits, safe rendering, URL validation, duplicate detection, and connection-based throttling are enforced server-side.
- Community proposals are always labelled unverified and never overwrite the curated dataset.

## Main files

- `index.html`, `app.js`, `styles.css` — public app
- `admin.html`, `admin.js` — protected moderation UI
- `data.js` — read-only curated research
- `supabase/functions/proposals/index.ts` — validated shared API
- `supabase/migrations/` — database schema and access restrictions
- `scripts/generate-config.mjs` — deployment configuration generator

## Cultural-use disclaimer

This is a research scaffold, not an approved translation. Public use as Bunurong/Boonwurrung language requires confirmation from Bunurong language authorities.
