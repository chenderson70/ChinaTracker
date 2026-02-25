# China Tracker – Exercise Budget Calculator

China Tracker is a React + Express application for military exercise budget planning with authenticated multi-user data, persisted exercises, and real-time RPA/O&M calculation.

## Current Architecture

- **Frontend (static):** React 18 + TypeScript + Vite, deployed as static files
- **Backend API:** Node.js + Express + Prisma (`/api/v1`)
- **Database:** SQLite for local development, PostgreSQL for Azure
- **Auth:** Username/password login with JWT access tokens and refresh-token backed server sessions
- **Target Azure hosting:**
	- Frontend in **Azure Storage Static Website** (`$web` container)
	- Backend API on **Azure App Service** (or Azure Container Apps)
	- Database on **Azure Database for PostgreSQL**

## Key Features

- Real-time unit and exercise budget rollups (RPA + O&M)
- Exercise ownership and saved data by login
- Player/white-cell and role-based calculation rules
- Rank-level personnel detail and per-detail travel/per diem controls
- Dashboard + reports with export and budget-left tracking

## Local Development

```bash
# 1) Install dependencies
npm install
npm --prefix client install
npm --prefix server install

# 2) Configure server env
cp .env.example server/.env

# 3) Generate Prisma client and apply migrations
cd server
npx prisma generate
npx prisma migrate dev
npx prisma db seed
cd ..

# 4) Run API + frontend
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:3001/api/v1`

## Account Password Reset (Local)

From the `server/` folder, run:

```bash
npm run reset-password -- <username> "<newPassword>"
```

Example:

```bash
npm run reset-password -- admin "Password1111!!!!"
```

This updates the user's password hash and revokes active sessions so they must sign in again.

## Environment Variables

- Server (`server/.env`)
	- `DATABASE_URL`
	- `JWT_SECRET`
	- `JWT_EXPIRES_IN` (default `15m`)
	- `JWT_REFRESH_SECRET`
	- `JWT_REFRESH_EXPIRES_IN` (default `30d`)
	- `CORS_ORIGIN` (comma-separated origins for deployed frontend)
- Client (`client/.env`)
	- `VITE_API_BASE_URL` (e.g. `https://<api-host>/api/v1`)

## Azure Deployment (Current Repo Behavior)

- GitHub Actions workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) builds `client/` and uploads `client/dist` to Azure Storage static website.
- GitHub Actions workflow [.github/workflows/deploy-backend.yml](.github/workflows/deploy-backend.yml) builds and deploys `server/` to Azure Web App.
- Required GitHub secrets for frontend deploy:
	- `AZURE_CREDENTIALS`
	- `AZURE_STORAGE_ACCOUNT`
	- `VITE_API_BASE_URL`

- Required GitHub secrets for backend deploy:
	- `AZURE_CREDENTIALS`
	- `AZURE_WEBAPP_NAME`
	- `BACKEND_HEALTH_URL` (optional, e.g. `https://<your-api>.azurewebsites.net/health`)

## Important Deployment Note

Frontend deployment and backend deployment are separate. Pushing to `main` deploys the static frontend files only; backend API deployment must be configured independently for Azure App Service/Container Apps.
