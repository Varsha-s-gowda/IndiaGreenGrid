# India Green Grid

**National renewable-energy decision support with an integrated community-solar module.**

India Green Grid is a full-stack platform covering the nine PS1 deliverables:

| # | Deliverable | Module route |
| --- | --- | --- |
| D1 | National renewable-energy dashboard | `/energy` |
| D2 | RPO compliance tracker | `/rpo` |
| D3 | Rooftop solar ROI, subsidy and payback calculator | `/solar-calculator` |
| D4 | Green jobs portal | `/jobs` |
| D5 | Green finance aggregator | `/finance` |
| D6 | Circular-economy / recycling tracker | `/circular` |
| D7 | Environmental impact dashboard | `/impact` |
| D8 | Renewable forecasting and battery-storage planner | `/forecast` |
| D9 | Six stakeholder portals plus administrator portal | `/dashboard`, `/admin` |

The original 60-flat community-solar implementation is retained as an integrated
module: **SolarTwin** (generation/consumption simulation), **Fair allocation**,
**BillFair** (billing and audits), **RoofMax** (rooftop optimisation) and
**SolarVault** (battery storage), all reachable from `/community`.

---

## Contents

- [Architecture](#architecture)
- [What is real and what is sample](#what-is-real-and-what-is-sample)
- [Roles and access](#roles-and-access)
- [Prerequisites](#prerequisites)
- [Backend setup](#backend-setup)
- [Database migrations and seed](#database-migrations-and-seed)
- [Frontend setup](#frontend-setup)
- [Demo accounts](#demo-accounts)
- [Module guide](#module-guide)
- [API reference](#api-reference)
- [Testing](#testing)
- [Database changes](#database-changes)
- [Configuration](#configuration)
- [Pending integrations and limitations](#pending-integrations-and-limitations)
- [Troubleshooting](#troubleshooting)

---

## Architecture

```text
SolarEquity360/
├── backend/
│   ├── app/
│   │   ├── core/            # configuration, auth dependencies, errors, logging
│   │   ├── models/          # SQLAlchemy models (legacy + green_grid)
│   │   ├── routers/         # REST endpoints per module
│   │   ├── schemas/         # Pydantic validation
│   │   ├── services/        # ALL business calculations live here (Python)
│   │   └── main.py
│   ├── alembic/             # schema migrations
│   ├── data/seed/           # explicitly labelled sample JSON datasets
│   ├── scripts/seed.py      # idempotent demo/sample seed
│   ├── tests/               # pytest API/integration suite
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── components/      # layout, UI kit, charts, platform primitives
    │   ├── context/         # auth, health, notifications
    │   ├── lib/             # routing, formatting, access helpers
    │   ├── pages/           # national pages, community pages, admin portal
    │   └── services/        # thin Axios API wrappers
    └── .env.example
```

- **Backend:** Python 3.11, FastAPI, SQLAlchemy 2.x, PostgreSQL, Alembic, Pydantic v2, JWT + bcrypt.
- **Frontend:** React 18, Vite 6, Tailwind CSS 3, React Router 7, Recharts, Axios.
- **Separation of concerns:** the React client never performs business calculations,
  never embeds production results and contains no mock data. Every number is
  returned by the Python calculation layer.

---

## What is real and what is sample

Source provenance is a first-class part of the platform. Every dataset is stored
with a `DataSource` record containing its organisation, URL, freshness window,
last retrieval time, status and sample flag.

| Source code | Organisation | Status in this build |
| --- | --- | --- |
| `cea_installed_capacity` | Central Electricity Authority | **Sample extract**, labelled |
| `grid_india_generation` | Grid-India / POSOCO | **Sample extract**, labelled |
| `mnre_state_capacity` | MNRE | **Sample extract**, labelled |
| `cpcb_air_quality` | CPCB | **Sample readings**, labelled |
| `iea_renewable_investment` | IEA | **Unavailable** — no credentials configured |
| Bundled weather templates | Platform sample data | **Estimated** forecasts only |

Rules enforced throughout the UI and API:

- Sample data is never described as live.
- Forecasts are always returned with `forecast_type = "ESTIMATED"`.
- Unavailable sources are shown as unavailable; no values are fabricated.
- Environmental impact figures are planning estimates, not audited reductions.
- The community solar society is a seeded sample used to demonstrate workflows.

No API keys are invented or required.

---

## Roles and access

`UserRole` values: `ADMIN`, `RESIDENT`, `CITIZEN`, `DISCOM`, `INDUSTRY`,
`FINANCIAL_INSTITUTION`, `POLICYMAKER`.

| Capability | Roles |
| --- | --- |
| National dashboard, energy, impact, forecast | All authenticated roles |
| RPO tracker (read) | `ADMIN`, `DISCOM`, `INDUSTRY`, `POLICYMAKER` |
| RPO target/compliance writes | `ADMIN`, `DISCOM`, `INDUSTRY` (scoped to own entities) |
| Rooftop calculator, jobs, finance, circular | All authenticated roles |
| Community solar modules | All authenticated roles; admin-only configuration/run pages |
| Admin portal, user management, data sources, apartments | `ADMIN` only |

Public registration can self-select any stakeholder role **except** `ADMIN`.
Administrator accounts are provisioned by the seed script or an existing admin.
Role authorization is enforced by the backend, not only by the UI.

---

## Prerequisites

- Python 3.11+
- Node.js 18+ and npm
- PostgreSQL 15+ (a local instance on port 5433 was used during development)

---

## Backend setup

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1          # Windows PowerShell
# source .venv/bin/activate           # macOS/Linux
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` and set at minimum:

```ini
APP_NAME=India Green Grid
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password
POSTGRES_DB=solarequity
JWT_SECRET_KEY=<random secret, at least 32 characters>
AUTO_CREATE_TABLES=false
```

Generate a secret with:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Create the database if needed:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -p 5433 -U postgres -c "CREATE DATABASE solarequity;"
```

Run the API from `backend`:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

- API: `http://127.0.0.1:8000`
- Swagger UI: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/api/health`

---

## Database migrations and seed

Migrations own the schema. Do **not** enable `AUTO_CREATE_TABLES`.

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe scripts\seed.py
```

The seed script is idempotent and creates:

- Demo administrator, residents and five stakeholder accounts.
- The 60-flat community register, ownership ledger, tariff, billing, RoofMax and SolarVault defaults.
- Sample national energy, state impact, air quality, jobs, finance, recyclers and weather datasets.
- Sample RPO targets and circular-economy records.

Current Alembic head: **`356ccfc9d562`**.

Useful commands:

```powershell
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic downgrade -1
```

---

## Frontend setup

```powershell
cd frontend
npm install
Copy-Item .env.example .env       # optional; defaults work with the Vite proxy
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to `http://127.0.0.1:8000`.

Production build:

```powershell
npm run build
npm run preview
```

---

## Demo accounts

Seeded credentials (development defaults; override in `backend/.env`):

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@solarequity.com` | `AdminDemo#2026` |
| Resident | `resident101@solarequity.com` | `ResidentDemo#2026` |
| Resident | `resident102@solarequity.com` | `ResidentDemo#2026` |
| Citizen | `citizen@solarequity.com` | `ResidentDemo#2026` |
| DISCOM | `discom@solarequity.com` | `ResidentDemo#2026` |
| Industry | `industry@solarequity.com` | `ResidentDemo#2026` |
| Financial institution | `finance@solarequity.com` | `ResidentDemo#2026` |
| Policymaker | `policy@solarequity.com` | `ResidentDemo#2026` |

The login page lists these accounts for quick email selection. Passwords are
never stored in the frontend.

---

## Module guide

### National dashboard (`/dashboard`)
Role-aware overview combining energy, RPO, impact, solar, opportunities,
circular-economy and community-solar snapshots with source-freshness indicators.

### D1 — Energy dashboard (`/energy`)
Installed capacity and generation by source, renewable shares, historical trend,
state comparison and source history.

### D2 — RPO tracker (`/rpo`)
2025–2030 renewable purchase obligations. Create/edit targets, record actual
solar/non-solar consumption, monitor compliance, at-risk and shortfall status.
Backend calculates required energy, compliance percentage and shortfall.

### D3 — Rooftop calculator (`/solar-calculator`)
State-aware capacity recommendation, indicative PM Surya Ghar subsidy, net cost,
annual savings, payback, lifetime benefit and CO₂ reduction. All assumptions are
returned by the API. Results are persisted per user.

### D4 — Green jobs (`/jobs`)
Search and filter jobs by category, state, employment type and experience; view
details and submit applications. Administrators can create and update listings.

### D5 — Green finance (`/finance`)
Catalogue of loans, subsidies, bonds, leases, grants and market mechanisms with
rate verification flags, provider details and a 2–4 scheme comparison panel.
No eligibility, underwriting or credit decision is performed.

### D6 — Circular economy (`/circular`)
Recycler directory, waste-category and status analytics, recycling transactions
with traceability codes, owner cancellation and administrator status progression.

### D7 — Environmental impact (`/impact`)
Estimated avoided CO₂, renewable generation, trees/cars equivalents, state-level
capacity and avoided emissions, and clearly labelled sample air-quality readings.

### D8 — Forecast & storage (`/forecast`)
Seven-day solar/wind estimate from sample weather, storage sizing from daily
consumption and backup hours, evening grid-import reduction, documented
assumptions and recent recommendation history.

### D9 — Stakeholder and admin portals
All roles share the national modules with role-specific focus cards. The
administrator portal (`/admin`) provides:

- Platform statistics and adoption charts.
- User search, role changes and activation/deactivation.
- Data-source provenance, freshness and refresh controls.
- Job, finance, recycler, RPO and community content counters.
- Audit activity and 30-day module usage.
- Data-quality and unconfigured-integration alerts.

### Community solar (`/community`)
Hub for the retained 60-flat implementation:

- `/simulation` — SolarTwin generation, consumption, common areas, energy flow.
- `/allocation` — methods, runs, fairness, comparison, what-if, history.
- `/billing` — bill generation, apartment bills, PDFs, audits, history, resident portal.
- `/roofmax` — rooftop capacity recommendation, scenarios and financials.
- `/solarvault` — battery sizing, hourly dispatch, comparison and scenarios.
- `/apartments` — admin-only apartment register.

---

## API reference

All routes are under `/api`. Authentication uses `Authorization: Bearer <JWT>`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PUT /auth/profile`, `POST /auth/change-password` |
| Dashboard | `GET /dashboard/overview` |
| D1 | `GET /energy/overview`, `GET /energy/sources/{code}/history` |
| D2 | `GET /rpo/overview`, `GET/POST /rpo/targets`, `PATCH /rpo/targets/{id}`, `POST /rpo/targets/{id}/compliance` |
| D3 | `GET /solar/state-options`, `POST /solar/calculate`, `GET /solar/calculations` |
| D4 | `GET /jobs`, `GET /jobs/{id}`, `POST /jobs/{id}/apply`, `GET /jobs/applications/me`, admin create/update/all |
| D5 | `GET /finance/schemes`, `GET /finance/schemes/{id}`, `GET /finance/compare`, admin create/update/all |
| D6 | `GET /circular/summary`, `GET/POST /circular/recyclers`, `PATCH /circular/recyclers/{id}`, `GET/POST /circular/transactions`, `PATCH /circular/transactions/{id}` |
| D7 | `GET /impact/overview` |
| D8 | `GET /forecast/locations`, `POST /forecast/estimate`, `GET /forecast/history`, `POST /forecast/refresh-sample` (admin) |
| Admin | `GET /admin/overview`, `GET /admin/users`, `PATCH /admin/users/{id}`, `GET /admin/data-sources`, `POST /admin/data-sources/{id}/refresh`, `POST /admin/data-sources/refresh-all`, `GET /admin/activity`, `GET /admin/module-usage` |
| Community | Existing `/apartments`, `/simulation`, `/allocation`, `/billing`, `/roofmax`, `/solarvault` APIs are retained |

Full OpenAPI documentation is available at `/docs`.

---

## Testing

Backend suite (188 tests):

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

Frontend production build:

```powershell
cd frontend
npm run build
```

The backend tests cover authentication, authorization, RPO calculations and
scoping, solar calculations, job applications, finance catalogue/compare,
circular transactions and cancellation rules, impact aggregation, forecast
estimate types and storage outputs, admin portal aggregation, community
simulation, allocation, billing and PDFs, RoofMax and SolarVault.

A manual API smoke pass was also run against the live PostgreSQL database for
all eight demo accounts, including role-guard checks (403 for unauthorized RPO
and admin access), calculator, forecast, jobs, finance, circular workflows,
profile updates and password changes.

---

## Database changes

The platform extends the original schema rather than replacing it.

New/detailed areas:

- `users`: stakeholder roles, organisation and state fields.
- `green_grid` models: data sources, energy sources/statistics, state impact,
  air quality, RPO targets/compliance, solar calculations, green jobs and
  applications, finance schemes, recyclers, recycling transactions,
  environmental impact, generation forecasts, storage recommendations.
- Audit log entries for privileged writes across modules.
- Existing community tables (`apartments`, simulation runs, allocations,
  bills, billing audits, tariffs, RoofMax and SolarVault configurations) remain.

Migration:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

---

## Configuration

Backend variables (see `backend/.env.example`):

| Variable | Purpose |
| --- | --- |
| `APP_NAME`, `APP_ENV`, `DEBUG` | Application identity and mode |
| `API_PREFIX`, `HOST`, `PORT` | API binding |
| `DATABASE_URL` or `POSTGRES_*` | PostgreSQL connection |
| `JWT_SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES` | Token signing and lifetime |
| `BCRYPT_ROUNDS` | Password hashing cost |
| `CORS_ORIGINS` | Allowed frontend origins |
| `AUTO_CREATE_TABLES` | Keep `false`; Alembic owns the schema |
| `DEMO_*` | Seed account names, emails and passwords |

Frontend variables (see `frontend/.env.example`):

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Optional direct API URL; defaults to proxied `/api` |
| `VITE_DEMO_ADMIN_EMAIL`, `VITE_DEMO_RESIDENT_EMAIL` | Login-page email hints |

Never commit real `.env` files or secrets.

---

## Pending integrations and limitations

These are intentional, not hidden:

1. **Live government feeds are not connected.** CEA, Grid-India, MNRE and CPCB
   data are curated sample extracts. The ingestion layer is modular and can be
   pointed at approved endpoints without changing the UI.
2. **IEA is marked unavailable.** No API credentials are configured, so no
   investment data is displayed or invented.
3. **Forecasts are estimated from bundled weather templates**, not a live
   numerical weather prediction service or metered generation.
4. **Battery sizing is a planning estimate** using documented round-trip
   efficiency, depth-of-discharge, reserve and cost assumptions.
5. **Subsidy and finance figures are indicative.** State top-ups, lender terms,
   eligibility and DISCOM approvals must be verified with the provider.
6. **Recycler certifications are sample data.** Verify CPCB/state authorisation
   before any handover.
7. **Community solar data is a seeded sample society**, though every calculation
   is performed by the backend from stored records.
8. **Notifications are in-session only**; there is no email/SMS delivery.
9. **No payment gateway or lender integration** is implemented.
10. **MeterGuard** anomaly detection remains a placeholder module.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Cannot reach the India Green Grid API` | Start the backend on port 8000 and confirm `GET /api/health`. |
| Login fails for seeded account | Re-run `python scripts/seed.py`; confirm the `DEMO_*` passwords in `backend/.env`. |
| `Database schema is missing` | Run `alembic upgrade head` before seeding. |
| Database connection refused | Confirm PostgreSQL is running on the configured port and database exists. |
| CORS error | Add the frontend origin to `CORS_ORIGINS` and restart the API. |
| Frontend build succeeds but charts are empty | Check the browser network tab; empty modules should show explicit empty states, and errors show retry states. |
| RPO page redirects to dashboard | The signed-in role is not in `ADMIN`, `DISCOM`, `INDUSTRY` or `POLICYMAKER`. |

---

## Exact command reference

```powershell
# Backend
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe scripts\seed.py
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
.\.venv\Scripts\python.exe -m pytest -q

# Frontend
cd ..\frontend
npm install
npm run dev
npm run build
npm run preview
```
