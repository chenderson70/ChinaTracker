# China Tracker – Product Requirements Document (PRD)

**Version:** 3.0
**Date:** February 19, 2026
**Status:** Released

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals & Success Metrics](#2-goals--success-metrics)
3. [Architecture Overview](#3-architecture-overview)
4. [Data Model](#4-data-model)
5. [Data Service Layer](#5-data-service-layer)
6. [Calculation Engine Logic](#6-calculation-engine-logic)
7. [Frontend Requirements](#7-frontend-requirements)
8. [Page & View Specifications](#8-page--view-specifications)
9. [Data Management](#9-data-management)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Tech Stack](#11-tech-stack)
12. [Hosting & Deployment](#12-hosting--deployment)
13. [Milestones & Phasing](#13-milestones--phasing)

---

## 1. Executive Summary

China Tracker is an Azure-hosted exercise budget calculator with a **static React frontend** and a **Node/Express backend API**. The system supports authenticated users, saved exercises by account, and persistent cloud data storage.

The current deployment model is split-host:

- Frontend static files hosted on Azure Storage Static Website
- Backend API hosted separately (Azure App Service or Container Apps)
- Database persistence in PostgreSQL for production

The application replaces manual spreadsheet work with a structured, formula-driven tracker that:

- Accepts PAX counts and durations (days) as primary inputs
- Automatically calculates military pay (by rank/CPD), per diem, meals, billeting, travel, and miscellaneous O&M costs
- Separates every cost into **RPA** (Reserve Personnel Appropriation — Traditional Reservists) and **O&M** (Operations & Maintenance — AGRs and Civilians)
- Breaks costs out by four organizational units: **SG**, **AE**, **CAB**, and **A7**
- Rolls everything up into a single-page executive summary with total RPA, total O&M, and overall exercise cost
- Exports to Excel (client-side generation via SheetJS)
- Supports full JSON backup/restore for data portability between browsers or machines

---

## 2. Goals & Success Metrics

| Goal | Metric |
|------|--------|
| Real-time budget visibility | Changing any PAX input updates all downstream totals in < 500 ms |
| Single source of truth | One application captures all exercise costs — no side spreadsheets needed |
| Toggle-friendly | User can adjust white cell staff and player counts and instantly see budget impact |
| Export-ready | Budget can be exported to Excel for inclusion in official documents |
| Auditability | Every cost line traces back to its formula and rate inputs |
| Cloud persistence | User logins and exercise data persist across sessions/devices |
| Deployment clarity | Frontend and API are independently deployable in Azure |
| Data portability | Full JSON backup/restore enables moving data between browsers or machines |

---

## 3. Architecture Overview

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     GITHUB PAGES (Static Host)                   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              STATIC FILES (HTML + JS + CSS)                │  │
│  │                                                            │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │              REACT SPA (Single Page App)              │ │  │
│  │  │                                                       │ │  │
│  │  │  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │ │  │
│  │  │  │ React       │  │ Calculation  │  │ Data       │  │ │  │
│  │  │  │ Components  │  │ Engine       │  │ Service    │  │ │  │
│  │  │  │ (UI Layer)  │  │ (Pure Math)  │  │ Layer      │  │ │  │
│  │  │  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  │ │  │
│  │  │         │                │                  │         │ │  │
│  │  │  ┌──────▼──────────────▼──────────────────▼──────┐  │ │  │
│  │  │  │          DEXIE.JS  (IndexedDB Wrapper)         │  │ │  │
│  │  │  │                                                 │  │ │  │
│  │  │  │  exercises │ unitBudgets │ personnelGroups      │  │ │  │
│  │  │  │  personnelEntries │ travelConfigs               │  │ │  │
│  │  │  │  executionCostLines │ omCostLines               │  │ │  │
│  │  │  │  rankCpdRates │ perDiemRates │ appConfig        │  │ │  │
│  │  │  └─────────────────────────────────────────────────┘  │ │  │
│  │  └───────────────────────────────────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

         ┌──────────────────────────────────────────┐
         │  BROWSER (IndexedDB — persistent local    │
         │  storage surviving page reloads)           │
         └──────────────────────────────────────────┘
```

### 3.2 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Split hosting** | Static frontend on Azure Storage, API on App Service/Container Apps, DB on PostgreSQL |
| **JWT + refresh sessions** | Access tokens for API calls; refresh-token-backed server sessions for persistent login |
| **HashRouter** | Works reliably on static hosts without server-side route rewrite complexity |
| **Client-side Excel export** | SheetJS (xlsx) generates .xlsx files in-browser; no export service required |
| **JSON backup/restore** | Portability and recovery path in addition to cloud persistence |
| **GitHub Actions frontend deploy** | Push-to-main build and upload of static assets to Azure Storage `$web` |

---

## 4. Data Model

### 4.1 Entity Relationship Summary

```
Exercise 1──* UnitBudget
UnitBudget 1──* PersonnelGroup
PersonnelGroup 1──* PersonnelEntry
UnitBudget 1──* ExecutionCostLine
UnitBudget 1──* OmCostLine
Exercise 1──1 TravelConfig
RankCpdRate (global reference)
PerDiemRate (global reference)
AppConfig (global key-value settings)
```

### 4.2 IndexedDB Tables (via Dexie.js)

All tables use auto-incrementing integer primary keys. Data is stored in the browser's IndexedDB.

#### `exercises`

| Field | Type | Description |
|-------|------|-------------|
| id | number (PK, auto) | |
| name | string | Exercise name |
| startDate | string (ISO date) | Exercise start |
| endDate | string (ISO date) | Exercise end |
| defaultDutyDays | number | Default # of duty days |
| createdAt | string (ISO datetime) | |
| updatedAt | string (ISO datetime) | |

**Indexes:** `name`

#### `unitBudgets`

| Field | Type | Description |
|-------|------|-------------|
| id | number (PK, auto) | |
| exerciseId | number (FK) | |
| unitCode | string | 'SG', 'AE', 'CAB', or 'A7' |

**Indexes:** `exerciseId`, `[exerciseId+unitCode]` (compound, unique)

#### `personnelGroups`

Each unit has up to 4 personnel groups (combinations of role × funding):

| Field | Type | Description |
|-------|------|-------------|
| id | number (PK, auto) | |
| unitBudgetId | number (FK) | |
| role | string | 'PLAYER' or 'WHITE_CELL' |
| fundingType | string | 'RPA' or 'OM' |
| paxCount | number | Number of personnel |
| dutyDays | number | Override days (defaults to exercise-level) |
| location | string | 'GULFPORT' or 'CAMP_SHELBY' (white cell only) |
| isLongTour | boolean | If true, skip mil pay — track travel only (RPA) |

**Indexes:** `unitBudgetId`

#### `personnelEntries` (rank-level breakdown)

| Field | Type | Description |
|-------|------|-------------|
| id | number (PK, auto) | |
| personnelGroupId | number (FK) | |
| rankCode | string | E.g., 'E-5', 'O-3' |
| count | number | How many at this rank |

**Indexes:** `personnelGroupId`

> When rank-level detail is provided, the system uses rank-specific CPD. When omitted, the system uses the group-level `paxCount` with a configurable average CPD.

#### `rankCpdRates`

| Field | Type | Description |
|-------|------|-------------|
| id | number (PK, auto) | |
| rankCode | string | E-1 through O-10, W-1 through W-5 |
| costPerDay | number | Daily cost from the CPD table |
| effectiveDate | string (ISO date) | Allows rate versioning |

**Indexes:** `rankCode`

#### `perDiemRates`

| Field | Type | Description |
|-------|------|-------------|
| id | number (PK, auto) | |
| location | string | 'GULFPORT' or 'CAMP_SHELBY' |
| lodgingRate | number | Max lodging per night |
| mieRate | number | Meals & Incidental Expenses per day |
| effectiveDate | string (ISO date) | |

**Indexes:** `location`

#### `travelConfigs`

| Field | Type | Description |
|-------|------|-------------|
| id | number (PK, auto) | |
| exerciseId | number (FK) | |
| airfarePerPerson | number | Default $400 |
| rentalCarDailyRate | number | Configurable |
| rentalCarCount | number | User-entered |
| rentalCarDays | number | Duration of rental |

**Indexes:** `exerciseId` (unique)

#### `executionCostLines`

Per-unit execution costs (both RPA and O&M):

| Field | Type | Description |
|-------|------|-------------|
| id | number (PK, auto) | |
| unitBudgetId | number (FK) | |
| fundingType | string | 'RPA' or 'OM' |
| category | string | User-defined label |
| amount | number | |
| notes | string | |

**Indexes:** `unitBudgetId`

#### `omCostLines`

Exercise-level miscellaneous O&M costs:

| Field | Type | Description |
|-------|------|-------------|
| id | number (PK, auto) | |
| exerciseId | number (FK) | |
| category | string | 'CONTRACT', 'TRANSPORTATION', 'BILLETING', 'PORT_A_POTTY', 'RENTALS_VSCOS', 'CONSUMABLES', 'WRM', 'OTHER' |
| label | string | User description |
| amount | number | |
| notes | string | |

**Indexes:** `exerciseId`

#### `appConfig`

Global key-value store for configurable rates and settings:

| Field | Type | Description |
|-------|------|-------------|
| id | number (PK, auto) | |
| key | string (unique) | Setting key |
| value | string | Setting value (parsed as needed) |

**Indexes:** `key` (unique)

**Seeded keys:**

| Key | Default Value | Purpose |
|-----|---------------|---------|
| `breakfastCost` | `14` | Breakfast cost per person per day |
| `lunchMreCost` | `15.91` | Lunch/MRE cost per person per day |
| `dinnerCost` | `14` | Dinner cost per person per day |
| `playerBilletingNight` | `27` | Player billeting per night |
| `defaultAirfare` | `400` | Default airfare per person |
| `averageCpd` | `280` | Fallback average CPD when rank breakdown not used |

### 4.3 Auto-Seeding on First Load

When the app loads for the first time (empty IndexedDB), the `seedIfEmpty()` function populates:

1. **24 CPD rates** — Enlisted (E-1 through E-9), Warrant (W-1 through W-5), Officer (O-1 through O-10), all with `effectiveDate: '2025-01-01'`
2. **2 per diem locations** — Gulfport MS (lodging $98, M&IE $64) and Camp Shelby MS (lodging $96, M&IE $59)
3. **6 app config values** — Breakfast $14, Lunch/MRE $15.91, Dinner $14, Billeting $27/night, Airfare $400, Average CPD $280

---

## 5. Data Service Layer

The data service layer (`client/src/services/api.ts`) provides an async function API that mirrors a traditional REST API but operates entirely against IndexedDB. All functions return Promises and are consumed by TanStack Query hooks in the UI.

### 5.1 Exercise Operations

| Function | Description |
|----------|-------------|
| `getExercises()` | List all exercises (id, name, dates) |
| `getExercise(id)` | Get full exercise with all nested data (unit budgets, personnel groups, entries, travel config, execution costs, O&M costs) — assembled via IndexedDB queries |
| `createExercise(data)` | Create exercise + auto-create 4 unit budgets × 4 personnel groups each + travel config |
| `updateExercise(id, data)` | Update exercise metadata |
| `deleteExercise(id)` | Cascade delete: exercise + all unit budgets, personnel groups, entries, cost lines, travel config |

### 5.2 Personnel Operations

| Function | Description |
|----------|-------------|
| `updatePersonnelGroup(id, data)` | Update PAX count, duty days, location, long-tour flag |
| `addPersonnelEntry(groupId, data)` | Add rank-level detail entry |
| `deletePersonnelEntry(id)` | Remove rank-level entry |

### 5.3 Cost Line Operations

| Function | Description |
|----------|-------------|
| `addExecutionCost(unitBudgetId, data)` | Add execution cost line |
| `deleteExecutionCost(id)` | Remove execution cost line |
| `addOmCost(exerciseId, data)` | Add exercise-level O&M line |
| `deleteOmCost(id)` | Remove O&M line |

### 5.4 Rate Table Operations

| Function | Description |
|----------|-------------|
| `getCpdRates()` | Get all rank CPD rates |
| `updateCpdRates(rates[])` | Bulk update CPD table |
| `getPerDiemRates()` | Get per diem rates by location |
| `updatePerDiemRates(rates[])` | Update per diem rates |
| `getAppConfig()` | Get all app config key-value pairs |
| `updateAppConfig(configs[])` | Bulk update app config values |

### 5.5 Calculation

| Function | Description |
|----------|-------------|
| `calculateBudget(exerciseId)` | Fetch full exercise data + rates + config from IndexedDB → pass to calculation engine → return budget result |

### 5.6 Export & Backup

| Function | Description |
|----------|-------------|
| `exportExcel(exerciseId)` | Generate and download .xlsx workbook with Summary sheet + one sheet per unit + O&M Detail sheet |
| `exportAllData()` | Dump entire IndexedDB to JSON and trigger download (backup) |
| `importAllData(json)` | Parse JSON backup, clear all tables, bulk-insert all data (restore) |

### 5.7 Auto-Seeding on Exercise Creation

When `createExercise()` is called, the system automatically:

1. Creates 4 `unitBudgets` (SG, AE, CAB, A7)
2. Creates 4 `personnelGroups` per unit (Player-RPA, Player-OM, WhiteCell-RPA, WhiteCell-OM)
3. Creates a `travelConfig` with defaults (airfare $400, rental car rate $55, 0 cars, 0 days)
4. All personnel groups start with 0 PAX, exercise-level duty days, Gulfport location

---

## 6. Calculation Engine Logic

The calculation engine is a **pure-function module** (`client/src/services/calculationEngine.ts`) with no side effects and no database access. It receives pre-fetched data and returns a computed budget tree.

### 6.1 Engine Signature

```typescript
function calculateExerciseBudget(
  exercise: ExerciseDetail,
  rates: RateInputs
): BudgetResult
```

**Input: `ExerciseDetail`** — full exercise with nested unit budgets, personnel groups, entries, travel config, execution costs, O&M costs.

**Input: `RateInputs`** — CPD rates, per diem rates, and app config (meal costs, billeting rate, average CPD, airfare).

**Output: `BudgetResult`** — computed budget tree with per-unit breakdowns and grand totals.

```typescript
interface BudgetResult {
  units: {
    [unitCode: string]: {
      whiteCellRpa: { milPay: number; perDiem: number; travel: number; subtotal: number };
      whiteCellOm:  { perDiem: number; travel: number; subtotal: number };
      playerRpa:    { milPay: number; meals: number; travel: number; subtotal: number };
      playerOm:     { billeting: number; subtotal: number };
      executionRpa: number;
      executionOm:  number;
      unitTotalRpa: number;
      unitTotalOm:  number;
      unitTotal:    number;
    }
  };
  exerciseOm: number;
  totalRpa: number;
  totalOm: number;
  grandTotal: number;
}
```

### 6.2 Constants & Configurable Rates

| Key | Default | Source |
|-----|---------|--------|
| `breakfastCost` | $14.00 | AppConfig (editable) |
| `lunchMreCost` | $15.91 | AppConfig (editable) |
| `dinnerCost` | $14.00 | AppConfig (editable) |
| `PLAYER_MEALS_PER_DAY` | $43.91 | Derived (breakfast + lunch + dinner) |
| `playerBilletingNight` | $27.00 | AppConfig (editable) |
| `defaultAirfare` | $400.00 | AppConfig (editable) |
| `averageCpd` | $280.00 | AppConfig (editable) |
| `GULFPORT_LODGING` | $98.00 | PerDiemRates table |
| `GULFPORT_MIE` | $64.00 | PerDiemRates table |
| `CAMP_SHELBY_LODGING` | $96.00 | PerDiemRates table |
| `CAMP_SHELBY_MIE` | $59.00 | PerDiemRates table |

### 6.3 White Cell / Support Staff — RPA

For each white cell RPA personnel group:

```
milPay = Σ (rank_count × rank_cpd) × duty_days
       — OR if using average: pax_count × avg_cpd × duty_days
       — OR if long_tour: $0

perDiem = pax_count × (location_lodging + location_mie) × duty_days

travel  = (pax_count × airfare_per_person)
        + (allocated_rental_cars × rental_daily_rate × rental_days)

subtotal = milPay + perDiem + travel
```

> **Travel allocation for rental cars:** Each unit's white cell group gets an allocation of rental cars. This is a manual input per unit or divided proportionally from the exercise-level `rental_car_count` (user chooses method in settings).

### 6.4 White Cell / Support Staff — O&M

Identical formula to 6.3 except:
- **No mil pay** (O&M personnel are AGRs/civilians — their salary is not in this budget)
- `milPay = 0` always
- Per diem and travel still apply

```
perDiem = pax_count × (location_lodging + location_mie) × duty_days
travel  = (pax_count × airfare_per_person)
        + (allocated_rental_cars × rental_daily_rate × rental_days)
subtotal = perDiem + travel
```

### 6.5 Players — RPA

```
milPay = Σ (rank_count × rank_cpd) × duty_days
       — OR if using average: pax_count × avg_cpd × duty_days
       — OR if long_tour: $0

meals  = pax_count × PLAYER_MEALS_PER_DAY × duty_days
       = pax_count × ($14.00 + $15.91 + $14.00) × duty_days
       = pax_count × $43.91 × duty_days

travel = pax_count × airfare_per_person  (if applicable for long-tour toggle)

subtotal = milPay + meals + travel
```

> **Note:** Player meals fall under RPA costs per the requirements.

### 6.6 Players — O&M

```
billeting = pax_count × PLAYER_BILLETING_NIGHT × (duty_days − 1)
            — (duty_days − 1) because the last night is not billed;
            — this is configurable: user can set nights = duty_days if needed

subtotal = billeting
```

> Players on O&M are AGRs/civilians — no mil pay. Their meals are already covered in 6.5 under RPA (players eat together regardless of funding type).

### 6.7 A7 Variations

A7 uses the same formulas but with different label semantics:

| A7 Group | Maps To |
|----------|---------|
| Exercise Planning (RPA) | Uses White Cell RPA formula (6.3) |
| Exercise Planning (O&M) | Uses White Cell O&M formula (6.4) |
| Support Staff (RPA) | Uses White Cell RPA formula (6.3) |
| Support Staff (O&M) | Uses White Cell O&M formula (6.4) |
| Execution (RPA) | Manual line items |
| Execution (O&M) | Manual line items |

### 6.8 Unit Totals

```
unitTotalRpa = whiteCellRpa.subtotal + playerRpa.subtotal + executionRpa
unitTotalOm  = whiteCellOm.subtotal  + playerOm.subtotal  + executionOm
unitTotal    = unitTotalRpa + unitTotalOm
```

### 6.9 Exercise-Level O&M

```
exerciseOm = Σ omCostLines.amount    (all categories: contracts, transport, etc.)
```

> WRM is included in the exercise-level O&M sum, but also displayed as its own line for visibility.

### 6.10 Grand Totals

```
totalRpa   = Σ unit.unitTotalRpa        (across SG, AE, CAB, A7)
totalOm    = Σ unit.unitTotalOm         (across SG, AE, CAB, A7) + exerciseOm
grandTotal = totalRpa + totalOm
```

---

## 7. Frontend Requirements

### 7.1 Application Shell

- **Sidebar navigation** with:
  - Dashboard (summary view)
  - Unit tabs: SG, AE, CAB, A7
  - Rate Configuration
  - O&M Cost Center
  - Reports & Export
- **Top bar** showing:
  - Exercise selector dropdown
  - "New Exercise" button
  - "Delete Exercise" button (with confirmation modal)
  - Data management dropdown: Backup All Data / Restore from Backup
  - Live totals: total RPA, total O&M, grand total
- **Responsive layout** — functional on 1920×1080 desktop and tablets (1024px minimum)

### 7.2 Component Hierarchy

```
<HashRouter>
  <App>
    <AppLayout>
      <Header>               — exercise selector, New/Delete buttons, Data dropdown
      <Sider>                 — navigation links
      <Content>
        <Dashboard />         — executive summary, charts
        <UnitView />          — per-unit detail (parameterized by unit code)
        <RateConfig />        — CPD table editor, per diem editor, meal rate config
        <OmCostCenter />      — exercise-level O&M line items
        <Reports />           — full rollup, export buttons, charts
```

### 7.3 State Management

- **TanStack Query (React Query)** — all data fetching via `useQuery` with `queryKey` arrays for automatic cache invalidation
- **Mutations** via `useMutation` with `onSuccess` → `queryClient.invalidateQueries()` to trigger refetch
- No global state store needed — TanStack Query acts as server-state cache (pointing at IndexedDB instead of a server)
- Exercise selection stored in URL params (React Router)

### 7.4 Key UI Behaviors

#### PAX Input → Live Recalculation

1. User enters PAX count in a `<NumberInput>` field
2. On change, a mutation saves to IndexedDB
3. TanStack Query invalidation triggers recalculation
4. All downstream subtotals, unit totals, and grand totals update in-place
5. Changed values briefly highlight for visual feedback

#### Rank-Level Detail Toggle

- Each personnel group has a toggle: **"Use average CPD"** vs. **"Break out by rank"**
- When "Break out by rank" is selected, a sub-table appears with a row per rank and a count field
- The system sums `rank_count × rank_cpd × duty_days` instead of `pax × avg_cpd × duty_days`

#### Long Tour Toggle (RPA Only)

- A checkbox: **"Long tour orders (travel costs only)"**
- When checked, the mil pay calculation is zeroed out and only travel costs remain

#### Add Custom O&M Line

- A `+` button in the O&M Cost Center that opens a form: category dropdown, label text input, amount, notes
- "OTHER" category allows free-text entry

### 7.5 Form Validation Rules

| Field | Rule |
|-------|------|
| PAX count | Integer ≥ 0 |
| Duty days | Integer ≥ 1, ≤ 365 |
| Dollar amounts | Decimal ≥ 0, max 2 decimal places |
| Rank count | Integer ≥ 0 |
| Rental car count | Integer ≥ 0 |
| Exercise dates | end_date ≥ start_date |

---

## 8. Page & View Specifications

### 8.1 Dashboard View

**Purpose:** Single-screen executive summary of the entire exercise budget.

| Section | Content |
|---------|---------|
| **Header Cards** | Grand Total, Total RPA, Total O&M |
| **Unit Summary Table** | One row per unit (SG, AE, CAB, A7) with columns: Unit, RPA, O&M, Total |
| **PAX Summary** | Total players, total white cell, total PAX |
| **O&M Breakdown** | Pie or bar chart of O&M categories |
| **Budget Charts** | Recharts bar/pie charts for visual funding breakdown |

### 8.2 Unit Detail View (SG, AE, CAB)

Each unit view has identical structure:

#### White Cell / Support Staff Section

| Field | Input | Funding |
|-------|-------|---------|
| RPA PAX Count | Number input | RPA |
| O&M PAX Count | Number input | O&M |
| Location | Dropdown (Gulfport / Camp Shelby) | Both |
| Duty Days | Number input (defaults from exercise) | Both |
| Long Tour Toggle | Checkbox | RPA only |
| Rank Breakdown Toggle | Expand/collapse | RPA only |

**Computed Display (per funding type):**

- Mil Pay subtotal
- Per Diem subtotal
- Travel subtotal
- **Group Total**

#### Player Section

| Field | Input | Funding |
|-------|-------|---------|
| RPA PAX Count | Number input | RPA |
| O&M PAX Count | Number input | O&M |
| Duty Days | Number input | Both |
| Rank Breakdown Toggle | Expand/collapse | RPA only |

**Computed Display:**

- Mil Pay subtotal (RPA)
- Meals subtotal (RPA)
- Billeting subtotal (O&M)
- **Player RPA Total**
- **Player O&M Total**

#### Execution Costs Section

- Dynamic table with add/remove rows
- Columns: Description, Funding Type (RPA/O&M), Amount, Notes
- Subtotals for Execution RPA and Execution O&M

#### Unit Summary Footer

| Line | Value |
|------|-------|
| Unit Total RPA | Sum of all RPA items |
| Unit Total O&M | Sum of all O&M items |
| **Unit Grand Total** | RPA + O&M |

### 8.3 A7 Unit Detail View

Same structure as 8.2, but with these label changes:

- "White Cell / Support Staff" → **"Exercise Planning Staff"** and **"Support Staff"** (two separate sections)
- "Players" section is omitted (A7 has no players)
- Execution Costs section is present

### 8.4 Rate Configuration View

#### CPD Table Editor

- Table with columns: Rank, Cost Per Day, Effective Date
- Edit inline
- All enlisted (E-1 through E-9), warrant (W-1 through W-5), officer (O-1 through O-10)

#### Per Diem Editor

- Rows for Gulfport and Camp Shelby
- Columns: Location, Lodging Rate, M&IE Rate

#### Meal Rate Editor

- Breakfast, Lunch/MRE, Dinner — editable fields
- Player billeting nightly rate — editable

#### Travel Defaults

- Default airfare per person
- Average CPD (fallback when rank breakdown not used)

### 8.5 O&M Cost Center View

**Exercise-level O&M costs** (not unit-specific):

| Column | Type |
|--------|------|
| Category | Dropdown: Contract, Transportation, Billeting, Port-a-Potty, Rentals/VSCOS, Consumables, WRM, Other |
| Label | Free text |
| Amount | Currency input |
| Notes | Free text |

- Add / remove rows dynamically
- Subtotal per category
- **Grand O&M Exercise Total** at bottom
- WRM total highlighted separately

### 8.6 Reports & Export View

- Full budget table mirroring the dashboard but with drill-down rows
- **Export to Excel** — formatted workbook with:
  - Summary sheet (grand totals, unit totals)
  - One sheet per unit (personnel detail, execution costs)
  - O&M Detail sheet
- **Print-friendly view** — CSS print stylesheet for one-click PDF generation

---

## 9. Data Management

### 9.1 Data Persistence

All data is stored in the browser's **IndexedDB** database named `ChinaTrackerDB`. Data persists across page reloads and browser closures. Data is scoped to the browser profile on the specific machine.

### 9.2 Backup (JSON Export)

- The **"Backup All Data"** button in the header Data dropdown exports the entire IndexedDB to a JSON file
- File is named `chinatracker-backup-YYYY-MM-DD.json`
- Contains all 10 tables with full data
- Triggered via `file-saver` library (client-side download)

### 9.3 Restore (JSON Import)

- The **"Restore from Backup"** button opens a file picker
- User selects a previously exported JSON file
- System clears all existing data and bulk-inserts the backup data in a single Dexie transaction
- Page reloads automatically after import to reflect restored data
- **Warning:** Restore is destructive — it replaces all current data

### 9.4 Data Portability

To move data between browsers or machines:
1. Export JSON backup on source machine
2. Copy the JSON file to the target machine
3. Open the app on the target machine and use "Restore from Backup"

### 9.5 Data Loss Scenarios

| Scenario | Data Impact | Mitigation |
|----------|-------------|------------|
| Browser cache clear | **Data lost** | Regular JSON backups |
| Different browser on same machine | Data not shared | JSON backup/restore |
| Different machine | Data not shared | JSON backup/restore |
| Page reload | Data preserved | IndexedDB persists |
| Browser close | Data preserved | IndexedDB persists |
| Browser update | Data preserved | IndexedDB persists |
| Incognito/private mode | Data lost on close | Don't use incognito |

---

## 10. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Performance** | Full recalculation in < 100 ms (all math runs locally — no network) |
| **Availability** | 99.9%+ (GitHub Pages SLA; no server to go down) |
| **Data Persistence** | IndexedDB — all data auto-saved; survives browser close |
| **Browser Support** | Chrome 100+, Edge 100+ (modern DoD browser set) |
| **Offline Capable** | Works entirely offline after initial page load (no API calls) |
| **Cost** | $0/month — GitHub Pages is free for public repos |
| **Security** | No server means no server-side attack surface; data is local to user's browser |
| **Accessibility** | WCAG 2.1 AA compliance for keyboard navigation and screen readers |
| **Bundle Size** | < 1 MB gzipped for initial load |

---

## 11. Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | React 18 + TypeScript | Component-based UI with type safety |
| **Build Tool** | Vite | Fast dev server and optimized production builds |
| **Routing** | React Router 6 (HashRouter) | Client-side routing compatible with static hosts |
| **UI Library** | Ant Design 5 | Pre-built tables, forms, modals, dropdowns |
| **Charts** | Recharts | Composable chart components for budget visualizations |
| **Data Fetching** | TanStack Query (React Query) | Async state management, caching, invalidation |
| **Client Database** | Dexie.js (IndexedDB wrapper) | Structured, persistent, high-capacity browser storage |
| **Excel Export** | SheetJS (xlsx) | Client-side .xlsx workbook generation |
| **File Downloads** | file-saver | Trigger browser download for exported files |
| **Date Handling** | dayjs | Lightweight date manipulation |
| **CSS** | Ant Design theme | Consistent styling via Ant Design's design system |

### Dev & Build

| Tool | Purpose |
|------|---------|
| **TypeScript** | Type checking across entire codebase |
| **Vite** | Dev server with HMR + production bundling |
| **GitHub Actions** | CI/CD: build on push → deploy to GitHub Pages |
| **ESLint** | Code quality linting |

---

## 12. Hosting & Deployment

### 12.1 Frontend Hosting (Azure Storage Static Website)

The React SPA is deployed as static assets to Azure Storage static website hosting.

- Build output: `client/dist`
- Destination: Storage account `$web` container
- Live static URL example: `https://<storage-static-host>/#/`

### 12.2 CI/CD Pipeline

A GitHub Actions workflow (`.github/workflows/deploy.yml`) handles deployment:

```yaml
# Trigger: push to main branch
# Steps:
1. Checkout code
2. Install Node.js 20
3. Install client dependencies
4. Build client with VITE_API_BASE_URL
5. Azure login using AZURE_CREDENTIALS
6. Upload client/dist to storage account $web container
```

### 12.3 Vite Configuration

- `base: './'` — relative asset paths for static hosting
- Local proxy exists for development only
- React plugin for JSX/TSX support

### 12.4 Backend Deployment

Backend API deployment is managed separately from the frontend static site.

- API host target: Azure App Service or Azure Container Apps
- API base path: `/api/v1`
- Required runtime config: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`
- Production data store: PostgreSQL

### 12.5 Build Output

The `npm run build` command produces:

```
client/dist/
  index.html          — SPA entry point
  assets/
    index-[hash].js   — Application bundle
    index-[hash].css   — Styles
```

All files are static and can be served by any web server or CDN.

---

## 13. Milestones & Phasing

### Phase 1 — Core Calculator (Complete ✅)

- [x] Data model design (10 IndexedDB tables)
- [x] Dexie.js database setup with auto-seeding
- [x] Calculation engine (pure function, all formulas)
- [x] Data service layer (full CRUD against IndexedDB)
- [x] Exercise creation with auto-scaffolding (4 units × 4 groups + travel config)
- [x] Dashboard with summary cards, unit table, and charts
- [x] Unit detail views (SG, AE, CAB, A7) with PAX inputs
- [x] Live recalculation on input change
- [x] Rate Configuration view (CPD editor, per diem editor, meal rates)
- [x] O&M Cost Center (exercise-level line items)
- [x] Execution cost lines per unit
- [x] Client-side Excel export (SheetJS)
- [x] JSON backup/restore for data portability
- [x] Delete exercise with cascade
- [x] GitHub Pages deployment via GitHub Actions

### Phase 2 — Enhancements (Future)

- [ ] Scenario comparison (what-if mode) — create named scenarios with different PAX counts
- [ ] Budget snapshots & history — save named versions, compare side by side
- [ ] Threshold alerts — configurable budget ceilings with visual warnings
- [ ] Bulk PAX import from CSV roster
- [ ] Copy unit configuration between units
- [ ] Dark mode toggle
- [ ] Print-friendly CSS stylesheet
- [ ] Rank-level detail breakdown UI in unit views

---

## Appendix A: Sample Calculation Walkthrough

**Scenario:** SG unit, 15 RPA players (avg CPD $280), 10 duty days

```
Mil Pay   = 15 × $280.00 × 10      = $42,000.00
Meals     = 15 × $43.91  × 10      = $6,586.50
RPA Total                            = $48,586.50

Billeting (O&M) = 15 × $27.00 × 9  = $3,645.00
O&M Total                            = $3,645.00

SG Player Total                      = $52,231.50
```

**Scenario:** SG unit, 5 RPA white cell staff, Gulfport location (lodging $98, M&IE $64), 10 duty days, airfare $400 each

```
Mil Pay   = 5 × $320.00 × 10       = $16,000.00
Per Diem  = 5 × ($98 + $64) × 10   = $8,100.00
Travel    = 5 × $400               = $2,000.00
RPA Total                            = $26,100.00
```

---

## Appendix B: O&M Category Reference

| Category | Examples |
|----------|----------|
| Contract Costs | Vendor support, contract labor, OPFOR contracts |
| Transportation Costs | Bus rentals, fuel, vehicle transport |
| Billeting | Player barracks costs, overflow hotel |
| Port-a-Potty Rentals | Field sanitation facilities |
| Rentals (VSCOS) | Visual Systems for Combined Operations Simulation gear, other leased equipment |
| Consumables | Office supplies, printing, batteries, field supplies |
| WRM | War Reserve Materiel drawn for the exercise |
| Other | User-defined catch-all |

---

## Appendix C: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Feb 19, 2026 | Initial PRD — spreadsheet replacement concept |
| 2.0 | Feb 19, 2026 | Added Azure hosting, ML integration, full backend, CI/CD |
| 3.0 | Feb 19, 2026 | **Complete rewrite to 100% client-side static site.** Removed all server/backend, Azure infrastructure, ML, PostgreSQL, Redis, Key Vault. Replaced with IndexedDB (Dexie.js), GitHub Pages hosting, JSON backup/restore. $0/month hosting cost. |
| 3.1 | Feb 19, 2026 | Realigned to implemented codebase: static frontend deployment to Azure Storage, separate Express API deployment, and refresh-token backed persisted login sessions. |

---

*End of PRD — Version 3.0*
