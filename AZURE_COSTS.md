# Azure Cost Analysis — China Tracker

> Last updated: January 2025  
> Optimized for **near-free / pay-as-you-go** hosting.

---

## Architecture Overview

| Component | Azure Service | SKU / Tier | Monthly Cost |
|-----------|---------------|------------|-------------|
| Web App (API + Frontend) | App Service | **Free F1** | **$0.00** |
| Database | PostgreSQL Flexible Server | **Burstable B1ms** (1 vCore, 2 GB RAM, 32 GB storage) | **~$12.78** |
| Secrets | Key Vault | **Standard** | **~$0.03** |
| CI/CD | GitHub Actions | **Free** (2,000 min/mo for public repos) | **$0.00** |
| Monitoring | Application Insights | **Free** (first 5 GB/mo) | **$0.00** |

### Estimated Monthly Total: **~$12.81**

---

## Detail Breakdown

### 1. Azure App Service — Free F1 Tier ($0.00/mo)

- **CPU**: 60 minutes/day shared compute
- **Memory**: 1 GB RAM
- **Storage**: 1 GB
- **Bandwidth**: 165 MB/day outbound
- **Custom domain**: Not included (use `*.azurewebsites.net`)
- **SSL**: Included via `*.azurewebsites.net`
- **Always On**: Not available (app may cold-start after idle)

**Upgrade path**: Basic B1 at ~$13.14/mo adds custom domains, always-on, and dedicated compute.

### 2. Azure Database for PostgreSQL Flexible Server — B1ms (~$12.78/mo)

- **Compute**: Burstable B1ms (1 vCore, 2 GB RAM) — ~$12.41/mo
- **Storage**: 32 GB included — ~$0.37/mo
- **Backup**: 7-day retention (included)
- **IOPS**: 396 baseline (burstable)

This is the cheapest managed PostgreSQL option on Azure. The server can be **stopped** when not in use to save on compute costs.

> **Cost-saving tip**: Stop the DB server during non-work hours  
> `az postgres flexible-server stop --name psql-chinatracker --resource-group rg-chinatracker`  
> If stopped 16 hrs/day → ~$4.26/mo compute savings

### 3. Key Vault — Standard (~$0.03/mo)

- First 10,000 operations/month: $0.03 per 10K operations
- Secrets stored: ~3 (DB connection string, etc.)
- Actual cost: effectively **$0.00–$0.03/mo**

### 4. GitHub Actions — Free Tier ($0.00/mo)

- **Public repos**: 2,000 minutes/month free
- **Private repos**: 500 minutes/month free (then $0.008/min)
- Typical deployment: ~3–5 minutes per run
- At 30 deploys/month: 150 minutes → well within free tier

### 5. Application Insights — Free Tier ($0.00/mo)

- First 5 GB of data ingestion per month: free
- China Tracker is a low-traffic internal tool
- Expected usage: < 100 MB/month

---

## Future Cost Considerations

### Scale-up Triggers

| Trigger | Action | Additional Cost |
|---------|--------|----------------|
| >10 concurrent users | Upgrade App Service to B1 | +$13.14/mo |
| >60 CPU min/day | Upgrade App Service to B1 | +$13.14/mo |
| Custom domain needed | Upgrade App Service to B1 | +$13.14/mo |
| DB >32 GB storage | Increase storage | +$0.115/GB/mo |
| Need Redis caching | Add Azure Cache for Redis (C0) | +$16.37/mo |

### Azure ML (Phase 5 — Future)

When ML features are implemented:

| ML Component | Cost |
|-------------|------|
| ML Workspace | $0 (pay for compute only) |
| Compute Instance (DS1_v2) | ~$0.07/hr (only during training) |
| Managed Online Endpoint | ~$0.10/hr (only when active) |
| Estimated ML cost (occasional use) | ~$5–$15/mo |

---

## Cost Optimization Strategies

1. **Use Free F1 App Service** — sufficient for internal tool with <10 users
2. **Stop PostgreSQL during off-hours** — saves ~33% on DB compute
3. **GitHub Actions free tier** — more than enough for this project's CI/CD
4. **No Redis initially** — React Query handles client-side caching
5. **No Blob Storage initially** — exports generated on-the-fly, not stored
6. **Defer ML to Phase 5** — no ML compute costs until actually needed
7. **Use Application Insights basic** — free tier handles all monitoring needs

---

## Monthly Cost Summary

| Scenario | Monthly Cost |
|----------|-------------|
| **Minimum (current)** | **~$12.81** |
| With DB stop/start optimization | ~$8.55 |
| With B1 App Service upgrade | ~$25.95 |
| With Redis + B1 App Service | ~$42.32 |
| Full stack + ML (future) | ~$55–$70 |

---

*All prices are USD estimates based on East US region, January 2025 pricing. Actual costs may vary.*
