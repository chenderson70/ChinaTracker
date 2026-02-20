# China Tracker – Exercise Budget Calculator

## Overview

A tracker to input PAX (number of personnel) that trickles down to show an approximate budget. The tool should allow toggling between amounts of white cell staff and players to see how it adjusts overall costs, all captured in a single spreadsheet.

---

## Cost Categories

There are two funding categories:

| Category | Applies To |
|----------|------------|
| **RPA** | Traditional Reservists |
| **O&M** | AGRs and Civilians |

> **Note:** RPA should include a dedicated area for **travel-only costs**, since some individuals will be on long tour orders and won't need the mil pay side.

Both **players** and **white cell/support staff** can fall under RPA or O&M. All must be broken out individually, with an **overall cost calculator** showing **total RPA** and **total O&M**.

---

## Per Diem & Meal Costs

### Players (RPA Cost)

| Meal | Cost |
|------|------|
| Breakfast | $14.00 |
| Lunch (MRE) | $15.91 |
| Dinner | $14.00 |

### Players – Billeting (O&M Cost)

- **$27/night**

### White Cell / Support Staff

- **Full per diem** based on location
- Locations: **Gulfport, MS** and **Camp Shelby, MS**
- Per diem and lodging rates should be pulled from an authoritative source if possible

---

## Travel Costs (White Cell / Support Staff)

| Item | Estimate |
|------|----------|
| Airfare | ~$400 per person |
| Rental Cars | Manual entry for approximate number of vehicles |

---

## Rank-Based Cost Per Day (CPD)

A CPD table (attached separately) defines daily costs by rank for RPA personnel.

---

## Unit Breakdown

Each unit below requires its own section with **RPA** and **O&M** sub-categories:

### 1. SG (Surgeon General)

| Area | RPA | O&M |
|------|-----|-----|
| White Cell / Support Staff Costs | ✅ | ✅ |
| Execution Costs | ✅ | ✅ |
| Player Costs | ✅ | ✅ |

### 2. AE (Aeromedical Evacuation)

| Area | RPA | O&M |
|------|-----|-----|
| White Cell / Support Staff Costs | ✅ | ✅ |
| Execution Costs | ✅ | ✅ |
| Player Costs | ✅ | ✅ |

### 3. CAB (Combat Aviation Brigade)

| Area | RPA | O&M |
|------|-----|-----|
| White Cell / Support Staff Costs | ✅ | ✅ |
| Execution Costs | ✅ | ✅ |
| Player Costs | ✅ | ✅ |

### 4. A7 (Exercise Planning)

| Area | RPA | O&M |
|------|-----|-----|
| Exercise Planning Costs | ✅ | ✅ |
| Support Staff Costs | ✅ | ✅ |
| Execution Costs | ✅ | ✅ |

---

## WRM (War Reserve Materiel)

- Dedicated input area for WRM costs
- Falls under **O&M**

---

## Additional O&M Cost Categories

| Category | Notes |
|----------|-------|
| Contract Costs | |
| Transportation Costs | |
| Billeting | |
| Port-a-Potty Rentals | |
| Other Rentals (e.g., VSCOS) | |
| Consumables | |
| *Other (user-defined)* | Ability to add additional categories as needed |

---

## Summary Requirements

- [ ] Toggle PAX inputs for white cell staff and players to dynamically adjust costs
- [ ] Show **total RPA** rollup across all units
- [ ] Show **total O&M** rollup across all units
- [ ] Show **overall exercise cost** (RPA + O&M combined)
- [ ] Single spreadsheet captures all data
- [ ] RPA travel-only section for long-tour-order personnel
- [ ] Per diem auto-populated for Gulfport and Camp Shelby, MS (if possible)

---

## Deployment & Authentication Requirements

- [ ] Frontend must build to static assets and be deployable to Azure Storage Static Website (`$web` container)
- [ ] Frontend must call backend via configurable API base URL (`VITE_API_BASE_URL`)
- [ ] Backend API must be deployed separately (Azure App Service or Container Apps)
- [ ] Login must support persisted sessions using access token + refresh token flow
- [ ] Session revocation on logout must invalidate server-side session records
- [ ] Production data persistence must use PostgreSQL (local SQLite only for dev)
