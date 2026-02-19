# China Tracker – Exercise Budget Calculator

A web application for military exercise planners to input PAX (personnel counts) and dynamically generate budget estimates broken out by RPA and O&M across organizational units (SG, AE, CAB, A7).

## Features

- **Real-time budget calculation** — change PAX counts and see costs update instantly
- **RPA / O&M separation** — every cost broken into Reserve Personnel Appropriation and Operations & Maintenance
- **4 organizational units** — SG, AE, CAB, A7 with independent budget tracking
- **Rank-level CPD** — cost-per-day rates by military rank
- **Per diem auto-lookup** — GSA rates for Gulfport and Camp Shelby, MS
- **Meal and billeting costs** — configurable player meal rates and billeting
- **O&M Cost Center** — contracts, transportation, rentals, WRM, and more
- **Excel/CSV export** — download formatted budget workbooks
- **Dashboard** — executive summary with charts and totals

## Tech Stack

- **Frontend:** React 18 + TypeScript, Ant Design, Recharts, Vite
- **Backend:** Node.js 20, Express, Prisma ORM
- **Database:** PostgreSQL 16
- **Hosting:** Azure App Service + Azure Database for PostgreSQL

## Quick Start (Local Development)

```bash
# 1. Start PostgreSQL via Docker
docker-compose up -d

# 2. Copy environment config
cp .env.example server/.env

# 3. Install dependencies
npm run install:all

# 4. Run database migrations and seed
cd server
npx prisma migrate dev --name init
npx prisma db seed
cd ..

# 5. Start dev servers (API + React)
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001/api/v1

## Project Structure

```
ChinaTracker/
├── client/          # React frontend (Vite + TypeScript)
├── server/          # Express API (TypeScript + Prisma)
│   └── prisma/      # Schema + migrations + seed
├── .github/         # CI/CD workflows
├── docker-compose.yml
└── package.json     # Root workspace scripts
```

## Azure Deployment

See [AZURE_COSTS.md](AZURE_COSTS.md) for cost analysis. The GitHub Actions workflow auto-deploys on push to `main`.
