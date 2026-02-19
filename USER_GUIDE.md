# China Tracker — Application Guide

> Full breakdown of what the application does, how every page works, and how to use each feature.

---

## Table of Contents

1. [What Is China Tracker?](#1-what-is-china-tracker)
2. [Key Concepts](#2-key-concepts)
3. [Getting Started](#3-getting-started)
4. [Application Layout](#4-application-layout)
5. [Page-by-Page Guide](#5-page-by-page-guide)
   - [Dashboard](#51-dashboard)
   - [Unit Budget Pages (SG, AE, CAB, A7)](#52-unit-budget-pages)
   - [Rate Configuration](#53-rate-configuration)
   - [O&M Cost Center](#54-om-cost-center)
   - [Reports & Export](#55-reports--export)
6. [How the Budget Calculation Works](#6-how-the-budget-calculation-works)
7. [Funding Types Explained](#7-funding-types-explained)
8. [Data Model Overview](#8-data-model-overview)
9. [Typical Workflow (Step-by-Step)](#9-typical-workflow-step-by-step)
10. [Local Development](#10-local-development)
11. [Deployment & CI/CD](#11-deployment--cicd)

---

## 1. What Is China Tracker?

China Tracker is a **military exercise budget calculator** designed to track personnel costs, travel expenses, meals, billeting, and Operations & Maintenance (O&M) costs across multiple organizational units for exercises like **China Focus**.

It answers the core question: **"How much will this exercise cost, broken down by unit, funding type (RPA vs O&M), and cost category?"**

The application:
- Tracks **4 organizational units**: SG, AE, CAB, and A7
- Separates costs into **RPA** (Reserve Personnel Appropriation) and **O&M** (Operations & Maintenance) funding types
- Calculates **military pay** using Composite Pay & Allowance (CPD) rates by rank
- Computes **per diem**, **meals**, **travel**, and **billeting** automatically based on PAX counts and duty days
- Supports **exercise-level O&M costs** (contracts, transportation, WRM, consumables, etc.)
- Exports the full budget to **Excel** for reporting
- Recalculates everything in **real-time** as you edit values

---

## 2. Key Concepts

| Term | Definition |
|------|-----------|
| **Exercise** | A training event with a name, start/end dates, and default duty days (e.g., "China Focus FY26 Spring") |
| **Unit** | An organizational element: **SG** (Staff Group), **AE** (Adversary Element), **CAB** (Combined Arms Battalion), **A7** (Plans/Training Staff) |
| **PAX** | Personnel count — the number of people in a group |
| **Player** | Exercise participants who are "in the field" (receive meals, billeting) |
| **White Cell** | Exercise controllers/observers (receive per diem, travel) |
| **RPA** | Reserve Personnel Appropriation — funds military pay, meals for players, per diem + travel for white cell |
| **O&M** | Operations & Maintenance — funds billeting for players, per diem + travel for white cell (O&M-funded), plus exercise-level costs |
| **CPD Rate** | Composite Pay & Allowance daily rate for a given rank (E-1 through O-10) |
| **Per Diem** | Daily lodging + M&IE (Meals and Incidental Expenses) rate for a location |
| **Long Tour** | Personnel assigned long-term who do NOT receive daily military pay (CPD) |
| **Duty Days** | Number of days the exercise runs for budget calculation |
| **Execution Cost Lines** | Ad-hoc cost items attached to a specific unit (e.g., equipment rental for CAB) |
| **O&M Cost Lines** | Exercise-level overhead costs not tied to a specific unit (e.g., contracts, Port-A-Potties, WRM) |

---

## 3. Getting Started

### Access the Live Application

Open your browser and navigate to:

```
https://app-chinatracker-prod.azurewebsites.net
```

### Create Your First Exercise

1. Click the **"New Exercise"** button in the top header bar
2. Fill in the form:
   - **Exercise Name** — e.g., "China Focus FY26 Spring"
   - **Start / End Date** — the exercise date range
   - **Default Duty Days** — number of working days (default: 14)
3. Click **OK**

The application automatically creates:
- **4 unit budgets** (SG, AE, CAB, A7)
- **4 personnel groups per unit** (Player RPA, Player O&M, White Cell RPA, White Cell O&M)
  - A7 uses Planning/Support instead of Player/White Cell
- **A travel configuration** with default values ($400 airfare, $50/day rental car rate)

You're now ready to start entering data.

---

## 4. Application Layout

The app has a **sidebar navigation** on the left and a **header bar** across the top.

### Sidebar Menu

| Menu Item | Description |
|-----------|-------------|
| **Dashboard** | Overview cards, summary table, and charts for the selected exercise |
| **Units > SG** | Staff Group unit budget page |
| **Units > AE** | Adversary Element unit budget page |
| **Units > CAB** | Combined Arms Battalion unit budget page |
| **Units > A7** | Plans/Training Staff unit budget page |
| **Rate Config** | Edit CPD rates, per diem rates, meal costs, and billeting rates |
| **O&M Costs** | Add/remove exercise-level O&M cost lines |
| **Reports** | Full budget breakdown table, travel config, Excel export, and print |

### Header Bar

- **Exercise Selector** (dropdown) — switch between exercises
- **New Exercise** button — create a new exercise
- **Live Statistics** — Grand Total, RPA total, O&M total, and PAX count displayed in real-time

---

## 5. Page-by-Page Guide

### 5.1 Dashboard

The Dashboard is your **at-a-glance overview** of the entire exercise budget.

#### Summary Cards (Top Row)
| Card | What It Shows |
|------|--------------|
| **Grand Total** | Combined RPA + O&M cost for the entire exercise |
| **Total RPA** | All RPA-funded costs across all units |
| **Total O&M** | All O&M-funded costs (unit-level + exercise-level) |
| **Total PAX** | Total headcount (players + white cell) |

#### Secondary Cards (Second Row)
| Card | What It Shows |
|------|--------------|
| **Players** | Total player headcount across all units |
| **White Cell** | Total white cell / planning / support headcount |
| **RPA Travel** | Travel costs for long-tour personnel funded under RPA |
| **WRM** | War Reserve Materiel costs (from O&M cost lines) |

#### Unit Budget Summary Table
Shows each unit (SG, AE, CAB, A7) with their RPA, O&M, and total costs. Includes a sum row at the bottom.

#### Charts
- **Bar Chart** — Side-by-side comparison of RPA vs O&M costs per unit
- **Pie Chart** — Breakdown of exercise-level O&M costs by category

---

### 5.2 Unit Budget Pages

Each unit (SG, AE, CAB, A7) has its own dedicated page accessible from **Units** in the sidebar.

#### Unit Summary (Top)
Displays three figures:
- **Unit RPA** — total RPA cost for this unit
- **Unit O&M** — total O&M cost for this unit
- **Unit Total** — sum of both

#### Personnel Panels

Each unit has **4 personnel group panels**, organized in two columns:

**For SG, AE, CAB:**
| Panel | What It Funds |
|-------|--------------|
| **Player — RPA** | Military pay (CPD) + meals |
| **Player — O&M** | Billeting ($27/night) |
| **White Cell — RPA** | Military pay (CPD) + per diem + travel |
| **White Cell — O&M** | Per diem + travel (no military pay) |

**For A7 (different roles):**
| Panel | What It Funds |
|-------|--------------|
| **Planning — RPA** | Military pay + per diem + travel |
| **Planning — O&M** | Per diem + travel |
| **Support — RPA** | Military pay + per diem + travel |
| **Support — O&M** | Per diem + travel |

#### Editing a Personnel Panel

Each panel has 4 input fields:

| Field | Description | Effect on Calculation |
|-------|-------------|---------------------|
| **PAX Count** | Number of personnel in this group | Multiplies all per-person costs |
| **Duty Days** | Days on exercise (defaults to exercise-wide setting) | Multiplies daily rates |
| **Location** | Gulfport or Camp Shelby | Changes per diem rates used |
| **Long Tour** | Toggle on/off | When ON: skips CPD military pay (personnel are already salaried) |

Changes save **instantly** — just change a value and the budget recalculates automatically.

#### Cost Breakdown Display

Below the input fields, each panel shows the computed costs:
- **Mil Pay** — rank-based CPD rate x count x days
- **Per Diem** — (lodging + M&IE) x PAX x days
- **Meals** — (breakfast + lunch MRE + dinner) x PAX x days
- **Travel** — airfare per person x PAX + rental car share
- **Billeting** — $27/night x PAX x (days - 1)

#### Adding Rank-Level Detail

By default, the calculation uses an average CPD rate ($200/day). For precise calculations:

1. Click **"Add Rank Detail"** on any personnel panel
2. Select a **rank** (E-1 through O-10, W-1 through W-5)
3. Enter the **count** (how many of that rank)
4. Click **OK**

When rank entries exist, the calculation uses the exact CPD rate for each rank instead of the average. You can add multiple rank entries per panel.

#### Execution Cost Lines

At the bottom of each unit page is the **Execution Cost Lines** section — these are ad-hoc costs specific to this unit that don't fit into the personnel category formulas.

To add one:
1. Click **"Add Cost"**
2. Enter a **Category** (free text, e.g., "Equipment Rental")
3. Select **Funding Type** (RPA or O&M)
4. Enter the **Amount**
5. Optionally add **Notes**
6. Click **OK**

These amounts are added directly to the unit's RPA or O&M total.

---

### 5.3 Rate Configuration

The Rate Config page has **three sections** that control the rates used in all budget calculations.

#### Composite Pay & Allowance (CPD) Rates

A scrollable table listing all 24 military ranks (E-1 through E-9, W-1 through W-5, O-1 through O-10) with their daily cost rate.

- Edit any rate inline by changing the number
- Click **Save** to persist changes
- These rates are pre-seeded with FY26 approximate values

| Sample Ranks | Pre-Seeded Rate |
|-------------|----------------|
| E-1 | $117/day |
| E-5 | $169/day |
| O-3 | $240/day |
| O-6 | $370/day |

#### Per Diem Rates

Two rows — one for each supported location:

| Location | Lodging | M&IE |
|----------|---------|------|
| Gulfport | $98/night | $64/day |
| Camp Shelby | $96/night | $59/day |

Edit lodging or M&IE rates inline, then click **Save**.

#### Meal Rates & Billeting

Six configurable values:

| Setting | Default | Used For |
|---------|---------|----------|
| Breakfast | $14.00/day | Player RPA meals calculation |
| Lunch/MRE | $15.91/day | Player RPA meals calculation |
| Dinner | $14.00/day | Player RPA meals calculation |
| Player Billeting | $27.00/night | Player O&M billeting calculation |
| Default Airfare | $400.00 | Travel cost per person |
| Rental Car Rate | $50.00/day | Travel cost component |

Edit values inline and click **Save**.

> **Note:** Changing any rate immediately affects ALL exercises. The budget for the selected exercise recalculates automatically after saving.

---

### 5.4 O&M Cost Center

This page manages **exercise-level O&M costs** — overhead expenses that aren't tied to a specific unit.

#### O&M Categories

| Category | Examples |
|----------|---------|
| Contract | Contracted services, OPFOR contracts |
| Transportation | Bus rentals, fuel costs |
| Billeting | Facility rentals beyond player billeting |
| Port-A-Potty | Portable sanitation for field locations |
| Rentals / VSCOs | Vehicle/equipment rentals, VSCOs |
| Consumables | Supplies, printing, batteries |
| WRM | War Reserve Materiel |
| Other | Anything not fitting above categories |

#### Adding an O&M Cost Line

1. Click **"Add O&M Cost"**
2. Select a **Category** from the dropdown
3. Enter a **Label/Description** (e.g., "OPFOR contract team")
4. Enter the **Amount**
5. Optionally add **Notes**
6. Click **OK**

The table shows all cost lines with a running **total** in the summary row.

These costs appear in:
- The Dashboard pie chart (O&M Breakdown)
- The Grand Total O&M figure
- The Excel export (O&M Detail sheet)

---

### 5.5 Reports & Export

The Reports page is the **single source of truth** for the exercise budget.

#### Exercise Details Card
Shows the exercise name, start/end dates, and an editable **Duty Days** field (changing this recalculates the entire budget).

#### Travel Configuration Card
Displays and allows editing of:
- **Airfare per person** (default $400)
- **Number of rental cars**
- **Rental car rate** ($/day)
- **Rental car days**

Click **Edit** to modify, then **Save** to persist.

#### Full Budget Breakdown Table
A comprehensive table showing every cost category for every unit:

| Column | Description |
|--------|-------------|
| Unit | SG, AE, CAB, A7 |
| WC RPA | White Cell RPA subtotal |
| WC O&M | White Cell O&M subtotal |
| Player RPA | Player RPA subtotal |
| Player O&M | Player O&M subtotal |
| Exec RPA | Execution cost lines — RPA |
| Exec O&M | Execution cost lines — O&M |
| Total RPA | Unit RPA grand total |
| Total O&M | Unit O&M grand total |
| Total | Unit combined total |

#### Grand Totals Card
Final summary showing: Total RPA, Total O&M, Grand Total, RPA Travel, Exercise O&M, WRM, Total PAX, Players, and White Cell counts.

#### Export to Excel

Click **"Export to Excel"** to download an `.xlsx` file containing:

| Sheet | Contents |
|-------|----------|
| **Summary** | Exercise name, dates, grand totals, unit-by-unit table |
| **SG** | Full cost breakdown for Staff Group |
| **AE** | Full cost breakdown for Adversary Element |
| **CAB** | Full cost breakdown for Combined Arms Battalion |
| **A7** | Full cost breakdown for Plans/Training Staff |
| **O&M Detail** | Exercise-level O&M cost lines by category |

#### Print

Click **"Print"** to open the browser's print dialog for a hard-copy report.

---

## 6. How the Budget Calculation Works

All calculations are performed server-side by the **calculation engine** and returned to the frontend. Here's the formula logic:

### White Cell — RPA
```
Military Pay  = Σ (rank_count × CPD_rate × duty_days)   [skipped if Long Tour]
Per Diem      = PAX × (lodging + M&IE) × duty_days
Travel        = PAX × airfare + rental_car_share
─────────────────────────────────────────────────
Subtotal      = Military Pay + Per Diem + Travel
```

### White Cell — O&M
```
Per Diem      = PAX × (lodging + M&IE) × duty_days
Travel        = PAX × airfare + rental_car_share
─────────────────────────────────────────────────
Subtotal      = Per Diem + Travel
```
*(No military pay under O&M funding)*

### Player — RPA
```
Military Pay  = Σ (rank_count × CPD_rate × duty_days)   [skipped if Long Tour]
Meals         = PAX × ($14 + $15.91 + $14) × duty_days  [= $43.91/day/person]
Travel        = PAX × airfare                            [only if Long Tour]
─────────────────────────────────────────────────
Subtotal      = Military Pay + Meals + Travel
```

### Player — O&M
```
Billeting     = PAX × $27/night × (duty_days - 1)
─────────────────────────────────────────────────
Subtotal      = Billeting
```
*(Players sleep on-site; (days - 1) because last day doesn't require lodging)*

### Unit Total
```
Unit RPA      = White Cell RPA + Player RPA + Execution Cost Lines (RPA)
Unit O&M      = White Cell O&M + Player O&M + Execution Cost Lines (O&M)
Unit Total    = Unit RPA + Unit O&M
```

### Exercise Grand Total
```
Total RPA     = Σ all units' Unit RPA
Total O&M     = Σ all units' Unit O&M + Exercise-level O&M cost lines
Grand Total   = Total RPA + Total O&M
```

### Rental Car Distribution
Rental car costs are **split evenly** across all 4 units. Each unit gets:
```
Per-unit rental = ceil(total_cars / 4) × daily_rate × number_of_days
```

---

## 7. Funding Types Explained

### RPA (Reserve Personnel Appropriation)
Funds military personnel costs:
- **Military pay** (CPD) for all personnel not on long tour
- **Per diem** for white cell / planning / support staff
- **Travel** (airfare + rental cars) for white cell / planning / support staff
- **Meals** for players ($43.91/day: breakfast + MRE lunch + dinner)
- Travel for long-tour players

### O&M (Operations & Maintenance)
Funds non-personnel operational costs:
- **Per diem** for O&M-funded white cell
- **Travel** for O&M-funded white cell
- **Player billeting** ($27/night)
- **Exercise-level costs** (contracts, transportation, WRM, etc.)

---

## 8. Data Model Overview

```
Exercise
 ├── Travel Config (airfare, rental cars)
 ├── O&M Cost Lines (exercise-level overhead)
 └── Unit Budgets (×4: SG, AE, CAB, A7)
      ├── Personnel Groups (×4: Player RPA, Player O&M, WC RPA, WC O&M)
      │    └── Personnel Entries (rank + count for precise CPD calc)
      └── Execution Cost Lines (ad-hoc unit-specific costs)

Global Rate Tables:
 ├── Rank CPD Rates (24 ranks: E-1 → O-10)
 ├── Per Diem Rates (Gulfport, Camp Shelby)
 └── App Config (meal costs, billeting, airfare, rental car rate)
```

---

## 9. Typical Workflow (Step-by-Step)

Here's a recommended order of operations for budgeting a new exercise:

### Step 1: Verify Rates
Go to **Rate Config** and confirm:
- CPD rates match the current fiscal year
- Per diem rates are current for Gulfport and Camp Shelby
- Meal rates and billeting costs are correct

### Step 2: Create the Exercise
Click **"New Exercise"** in the header. Enter the exercise name, dates, and duty days.

### Step 3: Enter PAX Counts per Unit
Visit each unit page (**SG**, **AE**, **CAB**, **A7**) and:
- Set **PAX Count** for each personnel panel (Player RPA, Player O&M, White Cell RPA, White Cell O&M)
- Adjust **Duty Days** if a group has different days than the exercise default
- Set **Location** (Gulfport vs Camp Shelby) per group
- Toggle **Long Tour** for any personnel who won't receive daily CPD

### Step 4: Add Rank Detail (Optional)
For more precise budgets, click **"Add Rank Detail"** on each personnel panel and enter the specific rank distribution (e.g., 2x O-5, 3x E-7, 1x O-6).

### Step 5: Configure Travel
Go to **Reports** and click **Edit** on the Travel Configuration card. Set:
- Airfare per person
- Number of rental cars
- Rental car daily rate
- Number of rental car days

### Step 6: Add Execution Cost Lines
On each unit page, add any unit-specific costs that don't fit the personnel formulas (e.g., equipment rental, specialized training materials).

### Step 7: Add Exercise-Level O&M Costs
Go to **O&M Costs** and add overhead items:
- Contracts (OPFOR, simulation support)
- Transportation (bus costs)
- Port-A-Potties
- WRM
- Consumables
- Any other exercise-wide O&M costs

### Step 8: Review the Dashboard
Return to the **Dashboard** to see the full picture with summary cards, the unit comparison table, and charts.

### Step 9: Export
Go to **Reports** and click **"Export to Excel"** to download the comprehensive spreadsheet for distribution or filing.

---

## 10. Local Development

### Prerequisites
- Node.js 20+
- PostgreSQL 16 (or use the included Docker Compose)

### Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/chenderson70/ChinaTracker.git
cd ChinaTracker

# 2. Start PostgreSQL via Docker
docker compose up -d

# 3. Create .env file for the server
cp .env.example server/.env
# Edit server/.env and set DATABASE_URL to your PostgreSQL instance

# 4. Install all dependencies
npm run install:all

# 5. Push database schema and seed data
cd server
npx prisma db push
npx prisma db seed
cd ..

# 6. Run in development mode
npm run dev
```

The app will be available at:
- **Frontend**: http://localhost:5173
- **API**: http://localhost:3001

### Project Structure

```
ChinaTracker/
├── client/                 # React frontend (Vite + TypeScript)
│   └── src/
│       ├── components/     # AppLayout (shell, sidebar, header)
│       ├── pages/          # Dashboard, UnitView, RateConfig, OmCostCenter, Reports
│       ├── services/       # API client (axios)
│       └── types/          # TypeScript interfaces
├── server/                 # Express backend (TypeScript)
│   ├── prisma/             # Database schema + seed script
│   └── src/
│       ├── routes/         # REST API endpoints
│       └── services/       # Calculation engine
├── .github/workflows/      # CI/CD pipeline
├── AZURE_COSTS.md          # Azure hosting cost analysis
└── ChinaTracker_PRD.md     # Product Requirements Document
```

---

## 11. Deployment & CI/CD

### How It Works
Every push to the `main` branch triggers a **GitHub Actions** workflow that:

1. Installs client dependencies and builds the React app
2. Installs server dependencies and compiles TypeScript
3. Copies the built frontend into `server/dist/public/`
4. Pushes the database schema to Azure PostgreSQL
5. Deploys the server package to Azure App Service

### Architecture
- **Azure App Service (Free F1)** — serves both the React frontend and the Express API
- **Azure PostgreSQL Flexible Server (B1ms)** — stores all exercise and rate data
- **GitHub Actions** — automated build and deploy on every push

### Monthly Cost: ~$12.81
See `AZURE_COSTS.md` for the full breakdown.

---

*Last updated: February 2026*
