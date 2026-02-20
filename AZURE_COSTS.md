# Azure Cost Analysis — China Tracker

> Last updated: February 2026

This project now targets a **split Azure architecture**:

- Static frontend in **Azure Storage Static Website**
- Backend API in **Azure App Service** (or Container Apps)
- Database in **Azure Database for PostgreSQL**

---

## Baseline Architecture and Cost

| Component | Azure Service | SKU / Tier | Monthly Cost (est.) |
|-----------|---------------|------------|----------------------|
| Frontend static hosting | Storage Account (Static Website) | Standard LRS | ~$0.50–$2.00 |
| API backend | App Service | B1 | ~$13–$16 |
| Database | PostgreSQL Flexible Server | B1ms + 32GB | ~$12–$15 |
| Secrets | Key Vault | Standard | ~$0–$1 |
| CI/CD | GitHub Actions | Included/free tier | $0 |

### Estimated monthly total (typical): **~$26–$34**

---

## Why Storage Static Website

- Low-cost static hosting for the Vite-built React app
- Fits current hash-router frontend behavior
- Decouples frontend release cadence from backend API deployment
- Works with current workflow in [.github/workflows/deploy.yml](.github/workflows/deploy.yml)

---

## Deployment Responsibilities

- **Frontend pipeline:** Uploads `client/dist` to Storage account `$web`
- **Backend pipeline:** Must deploy `server/` separately to App Service/Container Apps
- **Data layer:** PostgreSQL for production persistence (not local SQLite)

---

## Required Secrets (Frontend Workflow)

- `AZURE_CREDENTIALS`
- `AZURE_STORAGE_ACCOUNT`
- `VITE_API_BASE_URL`

---

## Scale Guidance

- Start with Storage + App Service B1 + PostgreSQL B1ms
- If API load grows, scale App Service plan first
- If concurrency/data volume grows, move PostgreSQL to General Purpose tier

---

*Prices vary by region and usage; validate in Azure Pricing Calculator before provisioning.*
