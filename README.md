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


