# TORQQ — Free Cloud Deployment Guide

Deploy the whole platform for **₹0/month** using free tiers. Honest caveat: the
free backend host **sleeps when idle** and cold-starts in ~30-50s. Everything
else is genuinely free with no card.

## Architecture on free tiers

| Piece | Service | Free tier |
|---|---|---|
| Database | MongoDB Atlas **M0** | 512 MB, free forever, no card |
| Backend (Node + Socket.IO) | **Render** free web service | free, sleeps when idle, no card |
| `client` (Next.js) | **Vercel** | free forever, no card |
| `admin` (Next.js) | **Vercel** | free forever, no card |
| `customer frontend` / `driver frontend` (static) | **Vercel/Netlify/Cloudflare Pages** | free forever |
| Redis | not needed | code auto-skips when `REDIS_URL` unset |

---

## Step 1 — Database: MongoDB Atlas (free forever)

1. Sign up at https://www.mongodb.com/cloud/atlas/register
2. Create a **free M0 cluster** (pick a region near you, e.g. Mumbai `ap-south-1`).
3. **Database Access** → Add a database user (username + password). Save them.
4. **Network Access** → Add IP `0.0.0.0/0` (allow from anywhere — needed since
   Render's IP is dynamic).
5. **Connect → Drivers → Node.js** → copy the connection string. It looks like:
   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxx.mongodb.net/torqq?retryWrites=true&w=majority
   ```
   Add `/torqq` before the `?` to name the database.

---

## Step 2 — Backend: Render (free)

The repo already has `render.yaml`.

1. Sign up at https://render.com (sign in with GitHub — no card).
2. **New → Blueprint** → select the `urban1` repo → Render reads `render.yaml`.
3. When prompted, fill the secret env vars:
   - `MONGODB_URI` = the Atlas string from Step 1
   - `JWT_SECRET` = a long random string (run `openssl rand -hex 32`)
   - `REFRESH_SECRET` = a *different* long random string
   - `CLIENT_URL` = leave blank for now, fill after Step 3 (e.g. `https://torqq-client.vercel.app`)
   - `ADMIN_URL` = leave blank for now, fill after Step 3
   - `CORS_EXTRA_ORIGINS` = optional; add the static frontend URLs here later
4. Deploy. Your backend URL will be like `https://torqq-backend.onrender.com`.
5. Verify: open `https://torqq-backend.onrender.com/api/v1/health` → should return `{"success":true,...}`.

**Seed the database once** (from your laptop, pointing at Atlas):
```bash
MONGODB_URI="<your atlas string>" NODE_ENV=production node seeds/dummyData.js
```

---

## Step 3 — Frontends: Vercel (free)

Deploy `client` and `admin` as **two separate Vercel projects** from the same repo.

### client (customer + driver Next.js app)
1. https://vercel.com → New Project → import the repo.
2. **Root Directory**: `client`
3. **Environment Variables**:
   - `NEXT_PUBLIC_API_URL` = `https://torqq-backend.onrender.com/api/v1`
   - `NEXT_PUBLIC_API_BASE_URL` = `https://torqq-backend.onrender.com/api/v1`
4. Deploy → you get `https://torqq-client.vercel.app`.

### admin (Next.js app)
1. New Project → same repo again.
2. **Root Directory**: `admin`
3. **Environment Variables**:
   - `NEXT_PUBLIC_API_URL` = `https://torqq-backend.onrender.com/api/v1`
4. Deploy → you get `https://torqq-admin.vercel.app`.

### Then go back to Render
Set `CLIENT_URL` and `ADMIN_URL` to the Vercel URLs above (no trailing slash),
and Render will redeploy. CORS will now allow the frontends.

---

## Step 4 — Static frontends (optional)

`customer frontend/` and `driver frontend/` are plain HTML/JS. Host each on
Vercel/Netlify/Cloudflare Pages (drag-and-drop the folder, or point at the repo
with that folder as root). Before deploying, set the API base — search the JS
for `localhost:4000` / `TORQQ_API_BASE` and point it at the Render URL. Then add
those static URLs to `CORS_EXTRA_ORIGINS` on Render.

---

## Environment variables reference (backend)

| Var | Required | Example |
|---|---|---|
| `NODE_ENV` | yes | `production` |
| `PORT` | auto (Render sets it) | — |
| `MONGODB_URI` | yes | `mongodb+srv://...` |
| `JWT_SECRET` | yes | random 32+ chars |
| `REFRESH_SECRET` | yes | random 32+ chars |
| `CLIENT_URL` | yes | `https://torqq-client.vercel.app` |
| `ADMIN_URL` | yes | `https://torqq-admin.vercel.app` |
| `CORS_EXTRA_ORIGINS` | no | comma-separated extra origins |
| `RAZORPAY_KEY_ID` / `RAZORPAY_SECRET` | no | only if using live payments |
| `REDIS_URL` | no | leave unset — adapter auto-disables |

---

## Keeping the backend awake (optional)

Render free sleeps after 15 min idle. To reduce cold starts for a demo, ping the
health URL every ~10 min with a free cron (e.g. https://cron-job.org):
```
GET https://torqq-backend.onrender.com/api/v1/health
```
This does not make it "always on" but keeps it warm during active hours.

## The honest truth about "free forever"

- **Atlas M0** and **Vercel/Netlify/Cloudflare Pages**: genuinely free forever within limits.
- **Render free backend**: free forever but sleeps when idle. There is no service
  that runs a persistent Socket.IO Node server always-on for ₹0 with no card —
  for real traffic you'd move the backend to a ~$5/mo instance later. The code
  and config here work unchanged on any of them.
- Alternatives to Render (same $0, same sleep tradeoff, no card): **Koyeb**, Glitch, Cyclic.
