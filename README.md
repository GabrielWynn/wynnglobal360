# Wynn Global 360 Hub

Wynn Global Advisor Hub — Next.js 14 monorepo hosting the advisor portal, commission management app, and admin tooling.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint       # ESLint
npx tsc --noEmit   # TypeScript check
```

Copy `.env.example` to `.env.local` and fill in your Supabase credentials before running locally.

---

## Vercel Deployment Checklist

### 1. Push to GitHub

```bash
git init                          # if not already a repo
git add .
git commit -m "Initial hub commit"
git remote add origin https://github.com/your-org/wynnglobal360.git
git push -u origin main
```

### 2. Connect repo to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the GitHub repository
3. Framework preset will auto-detect **Next.js**
4. Leave Build & Output Settings as defaults (`vercel.json` handles them)

### 3. Add environment variables in Vercel dashboard

> Project → Settings → Environment Variables

Add all of the following for **Production**, **Preview**, and **Development**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` secret key — **never expose client-side** |
| `NEXT_PUBLIC_SITE_URL` | `https://www.wynnglobal360.com` (production) or preview URL |

`SUPABASE_SERVICE_ROLE_KEY` must be marked **Sensitive** in the Vercel dashboard so it is never shown in logs.

### 4. Set custom domain

1. Project → Settings → Domains → Add `www.wynnglobal360.com`
2. Add the CNAME record Vercel provides to your DNS registrar
3. Also add `wynnglobal360.com` (apex) with an A record pointing to Vercel's IPs so the `next.config.ts` naked-domain redirect fires
4. SSL is provisioned automatically

### 5. Enable Vercel Analytics

1. Project → Analytics → Enable
2. No code change needed — Next.js App Router reports automatically

### 6. Configure Supabase for production

Run the migrations in order via the Supabase SQL Editor:

```
supabase/migrations/032_hub_app_access.sql
supabase/migrations/033_hub_sessions.sql
```

Then apply the auth settings documented in `supabase/config/auth-settings.sql`:

| Setting | Value | Where |
|---|---|---|
| Site URL | `https://www.wynnglobal360.com` | Auth → URL Configuration |
| Redirect URLs | See config file | Auth → URL Configuration |
| JWT expiry | `1800` seconds | Auth → Configuration → JWT Settings |
| Azure provider | Client ID + Secret + Tenant | Auth → Providers → Azure |

### 7. Test all routes after deployment

Work through this checklist in order — each depends on the one above being green.

**Auth flows**
- [ ] `GET /` unauthenticated → redirects to `/login`
- [ ] `GET /` authenticated (IFA) → redirects to `/advisors`
- [ ] `GET /` authenticated (admin) → redirects to `/advisors`
- [ ] Login with email/password → lands on `/advisors`
- [ ] Login with Microsoft (Azure OAuth) → lands on `/advisors`
- [ ] Forgot password flow → reset email received → password updated → redirected to `/login`
- [ ] Accept invite flow → password set → redirected to `/advisors`
- [ ] Session timeout modal appears after 27 min of inactivity
- [ ] Sign out clears session and redirects to `/login`

**Hub**
- [ ] `/advisors` loads carousel with correct greeting and role
- [ ] Commission card opens `/commission` in new tab
- [ ] Coming soon cards show toast, do not navigate

**Commission — IFA**
- [ ] `/commission/ifa` loads transaction grid, balances, charts
- [ ] APE tab loads correctly
- [ ] Export to Excel downloads a valid file
- [ ] Sign out from commission header works

**Commission — Admin**
- [ ] `/commission/admin` loads dashboard stats and charts
- [ ] `/commission/admin/upload` accepts CSV, maps columns, processes upload
- [ ] `/commission/admin/payments` lists batches, allows approval
- [ ] `/commission/admin/approvals` lists pending approvals
- [ ] `/commission/admin/ifas` lists IFA accounts
- [ ] `/commission/admin/kpi` loads KPI charts
- [ ] `/commission/admin/reports` generates and downloads reports
- [ ] `/commission/admin/master-file` loads master data grid

**Hub Admin**
- [ ] `/admin/users` lists all IFA users
- [ ] Invite new user → email received → invite flow completes
- [ ] Edit role (IFA ↔ Admin) updates immediately in table
- [ ] Deactivate user → user cannot log in; Reactivate → user can log in again

**API (spot checks)**
- [ ] `GET /api/auth/me` with valid token → returns IFA record
- [ ] `POST /api/auth/link-ifa` is idempotent (call twice → same result)
- [ ] `GET /api/commission/dashboard` with admin token → returns stats JSON
- [ ] All API routes return `401` without a valid token

**Security headers**
- [ ] Run the site through [securityheaders.com](https://securityheaders.com)
- [ ] Verify `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options` are all present

---

## User migration (one-time)

To migrate existing Commission app users into the shared Supabase project:

```bash
# Create a .env.migration file with the old project credentials:
cat > .env.migration <<EOF
OLD_SUPABASE_URL=https://old-project-ref.supabase.co
OLD_SUPABASE_SERVICE_KEY=service_role_key_from_old_project
NEW_SUPABASE_URL=https://new-project-ref.supabase.co
NEW_SUPABASE_SERVICE_KEY=service_role_key_from_new_project
EOF

# Dry run first — no writes:
DRY_RUN=true npx tsx scripts/migrate-commission-users.ts

# Real migration + send password-reset emails to all migrated users:
SEND_RESET_EMAILS=true npx tsx scripts/migrate-commission-users.ts
```

See `scripts/migrate-commission-users.ts` for full documentation.
