# GoldenCare – Elderly Health Maintenance Tracker

GoldenCare helps elderly people and their caregivers or family members monitor health conditions, medications, appointments and daily health records.

**Stack:** Node.js · Express.js · MongoDB (Mongoose) · plain HTML/CSS/JavaScript frontend served by Express.

## How it meets the objectives

| Objective | Feature |
|---|---|
| Monitor vital signs | Record blood pressure, heart rate, temperature, SpO₂, blood sugar and weight. Readings outside normal ranges are flagged (normal / low / high / critical), and a trend chart shows recent blood pressure and heart rate. |
| Medication reminders | Each medication has daily times. The **Medications today** page lists every dose with *Taken / Skip / Undo*. Due doses pop up as on-screen reminders (and as browser notifications if enabled), and the nav shows a count of doses due. |
| Appointments & health history | Schedule appointments (mark them done, cancelled or missed). Keep a health history of diagnoses, procedures, lab results, vaccinations, allergies and hospital visits. |
| Caregiver / family monitoring | Add caregivers and link them to the elders they look after. Use **Viewing as** on the dashboard (or **Monitor**) to see only their elders, with alerts, overdue doses and upcoming appointments. |
| Easy and accessible | Large text and touch targets, adjustable text size (A− / A+), high-contrast mode, keyboard navigation, a skip link, screen-reader labels and a mobile-friendly layout. |

Every entity supports full **CRUD** (create, read, update, delete).

## Setup

Requirements: Node.js 18+, plus MongoDB running locally or a free MongoDB Atlas connection string.

```bash
npm install
copy .env.example .env      # macOS/Linux: cp .env.example .env
# edit MONGODB_URI in .env if you're not using a local MongoDB
npm run seed                # optional: adds sample data (only when the database is empty)
npm start
```

Open http://localhost:3000. `npm run dev` restarts the server automatically when files change.

## Production

What's built in:
- **Security headers** (Helmet): a strict Content-Security-Policy (only the app's own scripts and styles; the frontend has no inline code), nosniff, no framing, and HSTS when `HTTPS=true`.
- **Rate limiting** on the API (`API_RATE_LIMIT` requests per minute per IP, default 300) and a 100 KB request-body limit.
- **Validation**: every create *and* update runs the full Mongoose schema rules. Unknown fields are ignored, and errors come back as clear 400 messages. Server errors never expose internal details.
- **Gzip compression** and request logging (Apache "combined" format in production).
- **`GET /healthz`** returns 200 when the database is connected and 503 when it isn't, for hosting platforms and Docker.
- **Graceful shutdown** on SIGTERM/SIGINT: in-flight requests finish, then the database connection closes.
- **Config checks at startup**: the server refuses to start in production without `MONGODB_URI`.
- **`npm run seed`** refuses to add demo data when `NODE_ENV=production`.

### Environment variables
| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Set to `production` when deployed |
| `PORT` | `3000` | HTTP port |
| `MONGODB_URI` | local MongoDB in dev | MongoDB / Atlas connection string (URL-encode special characters in the password, e.g. `@` → `%40`) |
| `HTTPS` | `false` | `true` when served over HTTPS (enables HSTS) |
| `TRUST_PROXY` | off | `1` when behind a reverse proxy or load balancer (Render, Railway, Nginx, …) |
| `API_RATE_LIMIT` | `300` | API requests per minute per IP |

### Run with Docker
```bash
docker build -t goldencare .
docker run -d -p 3000:3000 --env-file .env -e NODE_ENV=production --name goldencare goldencare
```

### Run on a server without Docker
```bash
npm ci --omit=dev
NODE_ENV=production node server.js     # use a process manager (systemd, pm2) to keep it running
```

### Deployment checklist
- Use MongoDB Atlas (or a managed MongoDB) with backups enabled, and allow only your server's IP under **Network Access**.
- Serve over HTTPS (your host or a reverse proxy) and set `HTTPS=true` and `TRUST_PROXY=1`.
- Keep `.env` out of git (already in `.gitignore`), and use the host's secret settings for `MONGODB_URI`.

## REST API

Every resource has the standard endpoints:

| Method | Endpoint | Action |
|---|---|---|
| GET | `/api/<resource>` | List (supports filters below, `?search=`, `?limit=`) |
| GET | `/api/<resource>/:id` | Read one |
| POST | `/api/<resource>` | Create |
| PUT | `/api/<resource>/:id` | Update |
| DELETE | `/api/<resource>/:id` | Delete |

Resources: `elders`, `vitals`, `medications`, `appointments`, `records` (health history), `caregivers`, `bins` (storage bins).
Filters: `?elder=<id>` on vitals, medications, appointments and records. `?elders=<id>` on caregivers. `?status=` and `?upcoming=1` on appointments. `?type=` on records.

Extra endpoints:

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/medications/schedule?date=YYYY-MM-DD[&elder=id][&caregiver=id]` | All doses due that day, with status |
| POST | `/api/medications/:id/doses` | Body `{ date, time, status }` where status is `Taken`, `Skipped` or `Pending` (undo) |
| GET | `/api/dashboard?date=YYYY-MM-DD[&caregiver=id]` | Per-elder overview: latest vitals and alerts, today's doses, next appointment |

### Recently deleted medicines
Deleting a medication (`DELETE /api/medications/:id`) moves it to **Recently deleted** instead of erasing it. It disappears from lists, the schedule and reminders, but its dose history is kept. Deleted medicines are removed for good after **30 days**.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/medications/trash[?elder=id]` | Recently deleted medicines, with `deletedAt` and `purgeAt` |
| POST | `/api/medications/:id/restore` | Restore (it's back in the schedule, history intact) |
| DELETE | `/api/medications/:id/permanent` | Delete forever (must be in Recently deleted), including dose history |
| DELETE | `/api/medications/trash[?elder=id]` | Empty Recently deleted |

In the app, use **🗑 Recently deleted** in the menu (or on an elder's Medications tab). An **Undo** button also appears right after you delete.
### Storage bins (where medicines are kept)
A **storage bin** is a labelled box, drawer or shelf spot, for example `A-01` at "Nurse station – Cabinet 2, Shelf 3". Each medication can be assigned to a bin, so anyone can find it:
- The bin's label and location appear in the medication list, the **Medications today** schedule and the reminder pop-ups ("📍 Find it in A-01 · Cabinet 2, Shelf 3").
- The **📦 Storage bins** page shows every bin and what's inside it, a **Find a medicine** search, and the medicines not yet assigned to a bin.
- Each bin has a printable **label** (big code, location, owner, contents) to stick on the physical bin.
- Labels are unique and stored in capitals. A bin can optionally belong to one elder (a personal pill box).
- Deleting a bin doesn't delete its medicines; they just become "No bin assigned".

CRUD: `/api/bins` (`GET`, `GET /:id`, `POST`, `PUT /:id`, `DELETE /:id`; filters `?elder=`, `?color=`, `?search=`). Medicines in a bin: `GET /api/medications?bin=<id>`.

Deleting an elder also deletes their vitals, medications, dose logs, appointments and records, and unlinks them from caregivers.

## Project structure

```
server.js              Express app, MongoDB connection, error handling
seed.js                Optional sample data
models/                Elder, Caregiver, Vital, Medication, DoseLog, Appointment, HealthRecord
routes/                One router per resource + dashboard
utils/crud.js          Reusable CRUD router factory
utils/vitals.js        Normal-range rules for flagging readings
utils/schedule.js      Builds the daily medication schedule
utils/dates.js         Date/time helpers
public/                Frontend (index.html, style.css, app.js)
```

> Vital-sign flags use general reference ranges and are not a medical diagnosis.
>
> There is no login yet. Anyone who can open the app can see all data, so add authentication before using it with real patient information.
