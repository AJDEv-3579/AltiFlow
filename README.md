# Altiflow — Industrial Photogrammetry Operations 🛸

A multi-tenant project tracker for drone photogrammetry pipelines.
Built on **Next.js 15 (App Router) + Supabase (Postgres) + Tailwind + Framer Motion + dnd-kit**.

> **Chameleon UI** — every user sees a different app:
> - **Super Admin** — Command Center: global analytics, clients, users, audit logs, all pipelines
> - **Team Member** — 5-stage Kanban with drag-drop, Refly resolution, live SLA clocks
> - **Client** — Clean Portal: New Upload + My Projects + Confirm Delivery (mobile bottom-sheet nav)
>
> **Cinematic backdrop** — sky animates between **Dawn / Morning / Day / Sunset / Twilight / Night** based on real local time, with a hovering drone scanning the terrain.

---

## ✨ Headline features

| Feature | What it does |
|---|---|
| 🌅 Time-of-day backdrop | 6 cinematic scenes — twinkling stars at night, glowing sun at day, drifting clouds, mountain silhouettes |
| 🚁 Hovering drone | Patrols across the sky with spinning propellers, scan-cone beam, REC telemetry, and falling data packets — accent color shifts per period |
| 🔒 Server-locked timestamps | Clients cannot inject the upload time — Postgres stamps `now()` automatically |
| ⏱ Dynamic SLA Engine | Auto-calculates 24h / 48h / 72h deadline based on a client's daily upload volume |
| 🚨 Refly automation | If `(images − csv) > 10` AND no Base/Rover → status **locked** to `Failed_Refly`, auto-assigned to Rohit → Shalini → Advik (round-robin), card stays locked until corrective photo + note |
| 📜 Immutable audit trail | Every status change, refly resolution, delivery confirmation is logged |
| 🎴 Drag-drop Kanban | dnd-kit + Framer Motion, ultra-smooth, cross-column moves |
| 📱 Fat-finger mobile UX | 56px tap targets, haptic vibration on toggles, bottom-sheet nav for field crews |
| 🎨 Glassmorphic dark industrial | `#09090b` base, backdrop-blur cards, period-tinted glows |

---

## 🚀 Quick start (local dev)

```bash
git clone <repo>
cd altiflow
yarn install
cp .env.example .env   # fill in Supabase keys (see below)
yarn dev
```

Open http://localhost:3000

---

## 🗄 Supabase setup (one-time, ~3 minutes)

### 1. Create a project
1. Go to **https://supabase.com** → sign in → **New project**.
2. Name it `altiflow` (or anything). Region: pick closest. Set a strong DB password and save it.
3. Wait ~2 minutes for provisioning.

### 2. Grab the keys
On the project dashboard → **⚙️ Settings → API**, copy:

| Env var | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | "Project URL" (e.g., `https://abcdefg.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | "anon" / "public" key (JWT starting with `eyJ…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | "service_role" key (KEEP SECRET — server-only, JWT starting with `eyJ…`) |

Paste into `.env`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
JWT_SECRET=any-long-random-string
```

### 3. Apply the database schema
1. In the Supabase dashboard, open **SQL Editor** (left sidebar).
2. Click **+ New query**.
3. Open `/app/supabase/schema.sql` from this repo → **copy the entire file**.
4. Paste into the editor → click **Run** (▶️ or Ctrl+Enter).

✅ You should see "Success. No rows returned". Five tables (`clients`, `users`, `projects`, `audit_logs`, `system_state`) + a `next_rr_index()` Postgres function + RLS enabled are now provisioned.

### 4. Verify & seed
Visit your local dev URL → the API will auto-seed demo users on first request:
- **Super Admin** — `devbond01` / `63pk0wpT@123` (exempt from forced password reset)
- **Team** — `Rohit`, `Shalini`, `Advik` / `WelcometoAlti@123` (forced reset on first login)
- **Client** — `bayer` / `WelcometoAlti@123` (Bayer client, forced reset on first login)

If you ever want to nuke and start over: run `TRUNCATE clients, users, projects, audit_logs RESTART IDENTITY CASCADE;` in the SQL Editor.

---

## 🌐 Deploy to Vercel

### 1. Push to GitHub
```bash
git init && git add . && git commit -m "Altiflow MVP"
git remote add origin https://github.com/<you>/altiflow.git
git push -u origin main
```

### 2. Import to Vercel
1. Visit **https://vercel.com** → sign in with GitHub.
2. Click **Add New… → Project** → pick your `altiflow` repo → **Import**.
3. **Framework Preset** auto-detects "Next.js" — leave defaults.
4. Build settings (already correct from `package.json`):
   - Build command: `next build`
   - Output: (auto)
   - Install: `yarn install`

### 3. Add environment variables
In the Vercel import screen → **Environment Variables**, add:

| Name | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ…` | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` | **Mark "Sensitive"** — server-only |
| `JWT_SECRET` | (any long random string) | Server-only — keep stable across deploys |

Then click **Deploy**.

### 4. Add your Vercel domain to Supabase (optional)
- Supabase dashboard → **Authentication → URL Configuration** → add the Vercel URL.
- Not strictly required since Altiflow uses its own JWT auth, but useful if you later enable Supabase Auth.

### 5. (Optional) Custom domain
Vercel dashboard → your project → **Domains** → add `altiflow.yourcompany.com`. Update DNS as Vercel instructs. Done.

---

## 🔐 Demo credentials (after seed)

| Role | Username | Password |
|---|---|---|
| Super Admin | `devbond01` | `63pk0wpT@123` |
| Team | `Rohit` | `WelcometoAlti@123` (must change on first login) |
| Team | `Shalini` | `WelcometoAlti@123` (must change on first login) |
| Team | `Advik` | `WelcometoAlti@123` (must change on first login) |
| Client | `bayer` | `WelcometoAlti@123` (must change on first login) |

---

## 🧪 The "magic" flow to demo

1. Login as `bayer` → change password → tap **New Upload**.
2. Submit a normal project (e.g., 200 images, 195 csv, **Base/Rover ON**) → SLA defaults to **24h**.
3. Upload two more today → 3rd auto-flips SLA window to **48h**. 5th → **72h**.
4. Submit a malformed project: **image=500, csv=400, Base/Rover OFF** → server auto-flags **`Failed_Refly`** + auto-assigns the card via round-robin to Rohit (next time → Shalini, then Advik).
5. Logout → login as `Rohit` → see Kanban → the failed card has a **🔒 LOCKED** badge with a pulsing crimson glow and cannot be dragged.
6. Open the card → upload a corrective photo + note → card unlocks and moves to `Pending`.
7. Drag the card across `In-Download → QC → Processing → Delivery`.
8. Logout → login as `bayer` → tap the card → **Confirm Delivery**.
9. Login as `devbond01` → **Audit Logs** tab → see the full immutable trail.
10. Click the **✨ sparkle button** (bottom-right) → preview every time-of-day backdrop.

---

## 🏗 Architecture

```
┌──────────────────────────────┐
│  Browser (Next.js client)    │
│  ├─ TimeBackdrop (drone, SLA)│
│  ├─ Kanban (dnd-kit)         │
│  └─ Role-based shells        │
└──────────────┬───────────────┘
               │ /api/*  (JWT in Authorization header)
               ▼
┌──────────────────────────────┐
│  Next.js API route           │
│  app/api/[[...path]]/route.js│
│  ├─ bcrypt password hashing  │
│  ├─ JWT issuance + verify    │
│  ├─ SLA engine logic         │
│  └─ Refly auto-assign        │
└──────────────┬───────────────┘
               │ supabaseAdmin (service_role)
               ▼
┌──────────────────────────────┐
│  Supabase Postgres           │
│  ├─ clients, users           │
│  ├─ projects (server-locked  │
│  │     upload_timestamp)     │
│  ├─ audit_logs (immutable)   │
│  ├─ system_state (RR counter)│
│  └─ next_rr_index() RPC      │
└──────────────────────────────┘
```

### Why custom JWT + bcrypt instead of Supabase Auth?
Altiflow uses **alphanumeric usernames** (e.g., `devbond01`) — not emails — which Supabase Auth doesn't natively support without a "synthetic email" workaround. We keep auth simple with bcrypt + signed JWT, while letting Supabase Postgres do the heavy lifting for data + RLS.

You can layer Supabase Auth later by mapping `users.id` to `auth.users.id` and writing RLS policies that read `auth.uid()`. The schema already has the right shape for this.

---

## 🛠 Repo structure

```
/app
 ├── app/
 │   ├── api/[[...path]]/route.js   # all backend endpoints
 │   ├── layout.js                  # root layout (Inter font, Sonner toasts)
 │   ├── page.js                    # main client app (chameleon shells)
 │   └── globals.css                # glass + animations
 ├── components/
 │   └── TimeBackdrop.js            # cinematic sky + drone
 ├── lib/
 │   └── supabase.js                # admin client (service_role)
 ├── supabase/
 │   └── schema.sql                 # ← paste this into Supabase SQL Editor
 ├── .env
 └── README.md
```

---

## 🐛 Troubleshooting

| Symptom | Fix |
|---|---|
| Login returns 500 with "tables not found" | You forgot step 3 above. Run `supabase/schema.sql` in the SQL Editor. |
| `[Altiflow] Supabase env vars missing` in logs | Add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to `.env` and restart. |
| Demo accounts not seeded | First successful API call triggers seed. Just visit the app once after schema is applied. |
| Vercel build fails on `@supabase/supabase-js` | Make sure Vercel uses `yarn install` (auto-detected from `yarn.lock`). |
| Round-robin always picks the same person | Ensure `next_rr_index()` Postgres function exists (it's in `schema.sql`). |
| Period switcher button not visible | Look for the **✨ sparkle icon** at bottom-right of the screen. |

---

## 🛣 Roadmap (post-MVP)

- Supabase Storage for actual drone files (replace data-URL `issue_photo`)
- Supabase Realtime → live Kanban updates without refresh
- Email/SMS notifications when SLA crosses `<4h warning`
- Native Supabase Auth + RLS policies (drop custom JWT)
- PWA manifest + service worker for installable mobile APK feel
- Recharts dashboard with daily volume / refly rate trend lines

---

## 📄 License
MIT — yours to deploy and modify.
