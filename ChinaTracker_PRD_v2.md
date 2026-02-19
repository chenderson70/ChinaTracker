# China Tracker – Product Requirements Document (PRD)

**Version:** 2.0
**Date:** February 19, 2026
**Status:** Draft

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals & Success Metrics](#2-goals--success-metrics)
3. [Azure Architecture Overview](#3-azure-architecture-overview)
4. [Data Model](#4-data-model)
5. [Backend Requirements](#5-backend-requirements)
6. [Azure Machine Learning Integration](#6-azure-machine-learning-integration)
7. [Frontend Requirements](#7-frontend-requirements)
8. [Calculation Engine Logic](#8-calculation-engine-logic)
9. [Page & View Specifications](#9-page--view-specifications)
10. [Quality-of-Life Features](#10-quality-of-life-features)
11. [Non-Functional Requirements](#11-non-functional-requirements)
12. [Tech Stack Recommendation](#12-tech-stack-recommendation)
13. [Milestones & Phasing](#13-milestones--phasing)

---

## 1. Executive Summary

China Tracker is an Azure-hosted web application and exercise budget calculator that allows exercise planners to input personnel counts (PAX) across multiple organizational units, personnel types, and funding categories, producing a real-time, dynamic cost estimate for the entire exercise — augmented by Azure Machine Learning for predictive analytics, anomaly detection, and intelligent optimization.

The application replaces manual spreadsheet work with a structured, formula-driven tracker that:

- Accepts PAX counts and durations (days) as primary inputs
- Automatically calculates military pay (by rank/CPD), per diem, meals, billeting, travel, and miscellaneous O&M costs
- Separates every cost into **RPA** (Reserve Personnel Appropriation — Traditional Reservists) and **O&M** (Operations & Maintenance — AGRs and Civilians)
- Breaks costs out by four organizational units: **SG**, **AE**, **CAB**, and **A7**
- Rolls everything up into a single-page executive summary with total RPA, total O&M, and overall exercise cost
- **Uses Azure ML to forecast final budgets, detect anomalous cost entries, optimize PAX allocations within constraints, auto-classify costs via NLP, score budget health, and benchmark against peer exercises**
- **Hosted entirely on Azure** (App Service, PostgreSQL Flexible Server, Redis Cache, Blob Storage, Key Vault, Static Web Apps, ML Workspace) with Azure Entra ID SSO

---

## 2. Goals & Success Metrics

| Goal | Metric |
|------|--------|
| Real-time budget visibility | Changing any PAX input updates all downstream totals in < 500 ms |
| Single source of truth | One application captures all exercise costs — no side spreadsheets needed |
| Toggle-friendly | User can adjust white cell staff and player counts and instantly see budget impact |
| Export-ready | Budget can be exported to Excel/CSV for inclusion in official documents |
| Auditability | Every cost line traces back to its formula and rate inputs |
| ML-enhanced decisions | Budget forecast, anomaly flags, optimization, and health score available within 2 seconds |
| Azure-native hosting | Fully hosted on Azure with SSO, auto-scaling, managed backups, and IaC |

---

## 3. Azure Architecture Overview

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  AZURE STATIC WEB APPS                          │
│  React Frontend (Dashboard │ Units │ Rates │ Reports │ ML)     │
└──────────────────────────────┬──────────────────────────────────┘
                               │ REST API / JSON
┌──────────────────────────────▼──────────────────────────────────┐
│              AZURE APP SERVICE (Node/Express API)                │
│  Auth │ Calc Engine │ Per Diem Lookup │ CRUD │ Export           │
│  ML Orchestrator │ WebSocket (live updates)                      │
└────────┬──────────────┬──────────────┬─────────────────────────┘
         │              │              │
┌────────▼────────┐ ┌──▼───────────┐ ┌▼────────────────────────┐
│ AZURE DB FOR    │ │ AZURE ML     │ │ AZURE BLOB STORAGE      │
│ POSTGRESQL      │ │ WORKSPACE    │ │ Exports, Snapshots,     │
│ Flexible Server │ │              │ │ ML Datasets, Rosters    │
│                 │ │ ┌──────────┐ │ └─────────────────────────┘
│ Exercises       │ │ │Endpoints:│ │
│ Units           │ │ │• Forecast│ │ ┌─────────────────────────┐
│ Personnel       │ │ │• Anomaly │ │ │ AZURE REDIS CACHE       │
│ Rates           │ │ │• Optimize│ │ │ Per diem rates, session  │
│ O&M Lines       │ │ │• NLP     │ │ │ calc cache, ML results  │
│ ML Predictions  │ │ └──────────┘ │ └─────────────────────────┘
└─────────────────┘ └──────────────┘
                                       ┌─────────────────────────┐
                                       │ AZURE KEY VAULT         │
                                       │ DB creds, API keys,     │
                                       │ JWT secrets, ML keys    │
                                       └─────────────────────────┘

         ┌──────────────────────────────────────────┐
         │ AZURE MONITOR + APPLICATION INSIGHTS      │
         │ Logging, metrics, alerting, dashboards    │
         └──────────────────────────────────────────┘
```

### 3.2 Azure Services Breakdown

| Service | Purpose | SKU / Tier |
|---------|---------|------------|
| **Azure Static Web Apps** | Host React SPA with built-in CI/CD from GitHub | Standard |
| **Azure App Service** | Node.js API backend | B2 (dev) → P1v3 (prod) |
| **Azure Database for PostgreSQL** | Primary relational data store | Flexible Server, Burstable B1ms (dev) → General Purpose D2s (prod) |
| **Azure Machine Learning** | ML workspace for training, endpoints, and managed inference | Basic workspace + managed online endpoints |
| **Azure Blob Storage** | Excel/CSV exports, ML training datasets, roster uploads, snapshots | Standard LRS |
| **Azure Cache for Redis** | Session cache, per diem rate cache, ML prediction cache | Basic C0 (dev) → Standard C1 (prod) |
| **Azure Key Vault** | Secrets management (DB connection strings, API keys, JWT secrets) | Standard |
| **Azure Monitor + App Insights** | APM, logging, alerting, custom metrics for budget thresholds | Pay-as-you-go |
| **Azure Active Directory (Entra ID)** | SSO authentication, role-based access control | Included with tenant |
| **Azure Container Registry** | Store Docker images for API and ML training containers | Basic |

---

## 4. Data Model

### 4.1 Entity Relationship Summary

```
Exercise 1──* UnitBudget
UnitBudget 1──* PersonnelGroup
PersonnelGroup 1──* PersonnelEntry
UnitBudget 1──* ExecutionCostLine
UnitBudget 1──* OmCostLine
Exercise 1──* WrmCostLine
Exercise 1──1 TravelConfig
RankCpdTable (global reference)
PerDiemRate (global reference)
```

### 4.2 Core Tables

#### `exercises`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| name | VARCHAR(255) | Exercise name |
| start_date | DATE | Exercise start |
| end_date | DATE | Exercise end |
| default_duty_days | INT | Default # of duty days (auto-calculated from dates, overridable) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

#### `unit_budgets`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| exercise_id | UUID (FK) | |
| unit_code | ENUM('SG','AE','CAB','A7') | Organizational unit |

#### `personnel_groups`

Each unit has up to 4 personnel groups (combinations of role × funding):

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| unit_budget_id | UUID (FK) | |
| role | ENUM('PLAYER','WHITE_CELL') | |
| funding_type | ENUM('RPA','OM') | |
| pax_count | INT | Number of personnel |
| duty_days | INT | Override days (defaults to exercise-level) |
| location | ENUM('GULFPORT','CAMP_SHELBY') | Relevant for per diem (white cell only) |
| is_long_tour | BOOLEAN | If true, skip mil pay — track travel only (RPA) |

#### `personnel_entries` (optional detail — rank-level breakdown)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| personnel_group_id | UUID (FK) | |
| rank_code | VARCHAR(10) | E.g., E-5, O-3 |
| count | INT | How many at this rank |

> When rank-level detail is provided, the system uses rank-specific CPD. When omitted, the system uses the group-level `pax_count` with a configurable average CPD.

#### `rank_cpd_rates`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| rank_code | VARCHAR(10) | E-1 through O-10, W-1 through W-5 |
| cost_per_day | DECIMAL(10,2) | Daily cost from the CPD table |
| effective_date | DATE | Allows rate versioning |

#### `per_diem_rates`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| location | ENUM('GULFPORT','CAMP_SHELBY') | |
| lodging_rate | DECIMAL(10,2) | Max lodging per night |
| mie_rate | DECIMAL(10,2) | Meals & Incidental Expenses per day |
| effective_date | DATE | |

#### `travel_config`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| exercise_id | UUID (FK) | |
| airfare_per_person | DECIMAL(10,2) | Default $400 |
| rental_car_daily_rate | DECIMAL(10,2) | Configurable |
| rental_car_count | INT | User-entered |
| rental_car_days | INT | Duration of rental |

#### `execution_cost_lines`

Captures per-unit execution costs (both RPA and O&M):

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| unit_budget_id | UUID (FK) | |
| funding_type | ENUM('RPA','OM') | |
| category | VARCHAR(255) | User-defined label |
| amount | DECIMAL(12,2) | |
| notes | TEXT | |

#### `om_cost_lines`

Captures miscellaneous O&M costs at the exercise level:

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| exercise_id | UUID (FK) | |
| category | ENUM('CONTRACT','TRANSPORTATION','BILLETING','PORT_A_POTTY','RENTALS_VSCOS','CONSUMABLES','WRM','OTHER') | |
| label | VARCHAR(255) | User description |
| amount | DECIMAL(12,2) | |
| notes | TEXT | |

---

## 5. Backend Requirements

### 5.1 API Endpoints

All endpoints are JSON REST. Prefix: `/api/v1`

#### Exercise CRUD

| Method | Path | Description |
|--------|------|-------------|
| POST | `/exercises` | Create new exercise |
| GET | `/exercises` | List all exercises |
| GET | `/exercises/:id` | Get exercise with full nested data |
| PUT | `/exercises/:id` | Update exercise metadata |
| DELETE | `/exercises/:id` | Soft-delete exercise |

#### Unit Budgets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/exercises/:id/units` | Get all 4 unit budgets |
| PUT | `/exercises/:id/units/:unitCode` | Update unit-level settings |

#### Personnel Groups

| Method | Path | Description |
|--------|------|-------------|
| GET | `/units/:unitId/personnel-groups` | List groups for a unit |
| PUT | `/units/:unitId/personnel-groups/:groupId` | Update PAX count, days, location, long-tour flag |
| POST | `/units/:unitId/personnel-groups/:groupId/entries` | Add rank-level detail |
| DELETE | `/personnel-entries/:entryId` | Remove rank-level entry |

#### Cost Lines

| Method | Path | Description |
|--------|------|-------------|
| GET | `/units/:unitId/execution-costs` | List execution cost lines |
| POST | `/units/:unitId/execution-costs` | Add execution cost line |
| PUT | `/execution-costs/:lineId` | Update cost line |
| DELETE | `/execution-costs/:lineId` | Remove cost line |
| GET | `/exercises/:id/om-costs` | List exercise-level O&M lines |
| POST | `/exercises/:id/om-costs` | Add O&M line |
| PUT | `/om-costs/:lineId` | Update |
| DELETE | `/om-costs/:lineId` | Delete |

#### Rate Tables

| Method | Path | Description |
|--------|------|-------------|
| GET | `/rates/cpd` | Get all rank CPD rates |
| PUT | `/rates/cpd` | Bulk update CPD table |
| GET | `/rates/per-diem` | Get per diem rates by location |
| PUT | `/rates/per-diem` | Update per diem rates |

#### Calculation & Export

| Method | Path | Description |
|--------|------|-------------|
| GET | `/exercises/:id/calculate` | Return full calculated budget summary |
| GET | `/exercises/:id/export?format=xlsx` | Download Excel export |
| GET | `/exercises/:id/export?format=csv` | Download CSV export |

#### Per Diem Lookup (QoL)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/rates/per-diem/lookup` | Fetch current GSA per diem for a given city/state and cache it |

### 5.2 Calculation Engine

The calc engine is a pure-function module (`/services/calculationEngine.js`) with no side effects. It takes the full exercise data object and returns a computed budget tree. This enables:

- Unit testing of every formula in isolation
- Frontend "what-if" calculations without writing to the database
- Identical results whether called server-side or (optionally) client-side

**Engine Signature:**

```javascript
function calculateExerciseBudget(exercise) → {
  units: {
    [unitCode]: {
      whiteCellRpa: { milPay, perDiem, meals, travel, subtotal },
      whiteCellOm:  { milPay, perDiem, meals, travel, subtotal },
      playerRpa:    { milPay, meals, subtotal },
      playerOm:     { billeting, subtotal },
      executionRpa: number,
      executionOm:  number,
      unitTotalRpa: number,
      unitTotalOm:  number,
      unitTotal:    number
    }
  },
  exerciseOmCosts: { [category]: number },
  wrm: number,
  totalRpa: number,
  totalOm: number,
  grandTotal: number
}
```

### 5.3 Per Diem Auto-Lookup

The backend includes a service that queries the **GSA Per Diem API** (`https://api.gsa.gov/travel/perdiem/v2/rates/city/{city}/state/{state}/year/{year}`) for Gulfport and Camp Shelby, MS. Rates are cached in the `per_diem_rates` table and refreshed on demand or at the start of each fiscal year.

**Fallback:** If the API is unavailable, the system uses the most recently cached rates and displays a notice to the user.

### 5.4 Seeding & Defaults

On exercise creation, the system automatically:

1. Creates 4 `unit_budgets` (SG, AE, CAB, A7)
2. Creates 4 `personnel_groups` per unit (Player-RPA, Player-OM, WhiteCell-RPA, WhiteCell-OM) — except A7 which gets Support-RPA, Support-OM, Planning-RPA, Planning-OM
3. Sets default meal rates: Breakfast $14, Lunch/MRE $15.91, Dinner $14
4. Sets default airfare to $400/person
5. Sets default player billeting to $27/night
6. Pre-populates per diem for Gulfport and Camp Shelby from cached rates

---

## 6. Azure Machine Learning Integration

Azure Machine Learning (Azure ML) is integrated as an intelligent layer that works alongside the deterministic calculation engine. While the calc engine produces exact budget figures from known inputs, Azure ML adds **predictive, diagnostic, and prescriptive analytics** that help planners make smarter decisions faster.

### 6.1 ML Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   AZURE ML WORKSPACE                         │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Training     │  │ Model        │  │ Managed Online    │  │
│  │ Pipelines    │  │ Registry     │  │ Endpoints         │  │
│  │              │  │              │  │                   │  │
│  │ • AutoML     │  │ • Forecast   │  │ /forecast         │  │
│  │ • Custom     │  │ • Anomaly    │  │ /anomaly-detect   │  │
│  │   training   │  │ • Optimizer  │  │ /optimize-pax     │  │
│  │ • Retraining │  │ • NLP        │  │ /nlp-classify     │  │
│  │   scheduler  │  │ • Cluster    │  │ /risk-score       │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘  │
│         │                 │                    │              │
│  ┌──────▼─────────────────▼────────────────────▼──────────┐  │
│  │              AZURE ML DATASTORE                         │  │
│  │  Linked to: PostgreSQL (historical) + Blob (datasets)  │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │
         │  Scored results via REST
         ▼
┌─────────────────────┐
│  App Service (API)  │ ──► Frontend (ML Insights Panel)
└─────────────────────┘
```

### 6.2 ML Use Cases

#### 6.2.1 Budget Forecasting & Confidence Intervals

**Problem:** Planners enter initial PAX estimates early in the planning cycle, but actual costs shift as rates change, personnel swap, and scope evolves.

**ML Solution:** A time-series forecasting model trained on historical exercise budgets predicts where the final budget will land, even at early planning stages.

| Detail | Specification |
|--------|---------------|
| **Model Type** | Azure AutoML Forecasting (ensemble of LightGBM, Prophet, ARIMA) |
| **Training Data** | Historical exercise snapshots: initial budget → mid-planning budget → final actual spend |
| **Features** | PAX counts, duty days, unit composition, time-of-year, rate versions, exercise type, historical cost variances |
| **Output** | Predicted final cost with 80% and 95% confidence intervals |
| **Retraining** | Triggered after each exercise concludes (new ground truth available) or quarterly |
| **Frontend Display** | Dashboard card: "ML Forecast: $X (±$Y at 95% confidence)" with a trend line showing predicted trajectory vs. current budget |

**Value:** Planners can tell leadership "our current estimate is $1.2M, but based on historical patterns, the final cost will likely be $1.35M–$1.45M." This prevents surprise overruns.

#### 6.2.2 Anomaly Detection on Cost Entries

**Problem:** With dozens of manual cost line entries, data-entry errors and outliers can silently corrupt the budget. A $50,000 line item that should be $5,000 goes unnoticed.

**ML Solution:** An anomaly detection model flags cost entries that deviate significantly from expected ranges based on historical data and peer comparisons.

| Detail | Specification |
|--------|---------------|
| **Model Type** | Azure ML Anomaly Detector (Isolation Forest / Multivariate Anomaly Detection) |
| **Training Data** | Historical cost line items across all past exercises, categorized by type |
| **Features** | Category, amount, unit, PAX count, duty days, cost-per-PAX ratio |
| **Output** | Anomaly score (0–1) per cost line; flag if > 0.8 |
| **Frontend Display** | Warning icon (⚠️) next to flagged lines with tooltip: "This amount is unusually high/low for [category]. Historical avg: $X." |
| **User Action** | Dismiss (mark as intentional) or correct the value |

**Value:** Catches typos like an extra zero, misclassified costs, or forgotten entries before they reach leadership review.

#### 6.2.3 PAX Optimization Engine

**Problem:** Planners need to hit a target budget but don't know the optimal mix of players and white cell staff across units to stay under a funding ceiling.

**ML Solution:** A constraint-based optimization model that recommends PAX allocations to maximize exercise participation while staying within RPA and O&M budget constraints.

| Detail | Specification |
|--------|---------------|
| **Model Type** | Azure ML Pipeline with scipy-based constrained optimization, enhanced by a trained cost prediction model |
| **Inputs** | Budget ceiling (total, RPA, O&M), minimum PAX requirements per unit, rank distribution preferences |
| **Constraints** | Must not exceed RPA ceiling, must not exceed O&M ceiling, minimum PAX per unit/role Must be respected |
| **Output** | Recommended PAX allocation per unit/role/funding type that maximizes total participation |
| **Frontend Display** | "Budget Optimizer" panel: user enters ceiling amounts, clicks "Optimize", sees recommended PAX table with a "Apply Recommendation" button |

**Value:** Instead of trial-and-error toggling, the system tells planners exactly how to allocate PAX to maximize training value within fiscal constraints.

#### 6.2.4 Smart Cost Classification (NLP)

**Problem:** When users enter free-text labels for O&M and execution cost lines (e.g., "porta potties for FOB alpha", "bus charter to range"), they may miscategorize them. Inconsistent categorization makes reporting unreliable.

**ML Solution:** An NLP text classification model that auto-suggests the correct O&M category based on the description entered.

| Detail | Specification |
|--------|---------------|
| **Model Type** | Fine-tuned text classifier (Azure ML + Hugging Face transformer or Azure AI Language custom classification) |
| **Training Data** | Historical cost line descriptions with their confirmed categories |
| **Input** | User-typed label/description for a cost line |
| **Output** | Suggested category + confidence score |
| **Frontend Display** | As user types in the "Label" field, the category dropdown auto-selects with a "Suggested: [category]" badge. User can override. |

**Value:** Ensures consistent categorization across planners and exercises, improving report accuracy and cross-exercise comparisons.

#### 6.2.5 Risk Scoring & Budget Health Index

**Problem:** Planners don't have a quick way to assess whether the current budget is "healthy" — i.e., realistic, complete, and within norms.

**ML Solution:** A composite scoring model that evaluates the overall budget and flags risk areas.

| Detail | Specification |
|--------|---------------|
| **Model Type** | Gradient Boosted classifier trained on exercise outcomes (under-budget, on-budget, over-budget) |
| **Features** | RPA/O&M ratio, PAX-to-cost ratio, O&M category completeness, rate currency (how old are the rates?), number of anomaly flags, snapshot volatility |
| **Output** | Budget Health Score (0–100) and up to 5 risk factors with severity |
| **Frontend Display** | Dashboard gauge: "Budget Health: 78/100 — Good" with expandable risk factors like: "⚠ Per diem rates are 6 months old", "⚠ No WRM costs entered", "✓ PAX-to-cost ratio within norms" |

**Value:** Gives leadership a single at-a-glance metric and gives planners a checklist of things to address.

#### 6.2.6 Unit Clustering & Benchmarking

**Problem:** When planning a new exercise, planners don't know if their per-unit budgets are in line with similar past exercises.

**ML Solution:** A clustering model groups historical exercises by similarity (size, type, location, duration) and benchmarks the current exercise against its cluster peers.

| Detail | Specification |
|--------|---------------|
| **Model Type** | K-Means clustering on exercise feature vectors |
| **Features** | Total PAX, duty days, # of units, RPA/O&M split, location, exercise type |
| **Output** | Cluster assignment + percentile rankings for each cost category vs. cluster peers |
| **Frontend Display** | "Benchmarking" tab: "Your exercise is similar to 12 past exercises. Your SG player costs are in the 85th percentile (higher than most)." |

**Value:** Helps identify outlier units that are over- or under-budgeted relative to comparable exercises.

#### 6.2.7 Rate Change Impact Predictor

**Problem:** CPD rates, per diem rates, and MRE costs change periodically. Planners need to know how upcoming rate changes will impact their budget.

**ML Solution:** A what-if simulation powered by regression models that predicts rate changes based on historical trends and shows projected impact.

| Detail | Specification |
|--------|---------------|
| **Model Type** | Linear regression / time-series on historical rate data (CPD, per diem, meal costs) |
| **Input** | Current rates + historical rate data |
| **Output** | Projected rates at exercise execution date + estimated budget delta |
| **Frontend Display** | "Rate Impact Forecast" card: "If FY27 rates apply (+3.2% avg CPD increase), your budget increases by ~$45,000" |

**Value:** Enables planners to build in a buffer for anticipated rate increases.

### 6.3 ML API Endpoints

All ML endpoints are proxied through the App Service backend for auth and caching. Prefix: `/api/v1/ml`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/ml/forecast` | Generate budget forecast with confidence intervals for an exercise |
| POST | `/ml/anomaly-detect` | Score all cost lines for anomalies; returns flagged items |
| POST | `/ml/optimize-pax` | Given budget constraints, return optimal PAX allocation |
| POST | `/ml/classify-cost` | Given a text description, return suggested O&M category |
| GET | `/ml/risk-score/:exerciseId` | Return budget health score and risk factors |
| GET | `/ml/benchmark/:exerciseId` | Return cluster assignment and percentile benchmarks |
| GET | `/ml/rate-impact/:exerciseId` | Return projected rate changes and budget impact |
| GET | `/ml/models` | List deployed models with version, accuracy, last trained date |
| POST | `/ml/retrain/:modelName` | Trigger retraining pipeline for a specific model (admin only) |

### 6.4 ML Data Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌───────────────┐
│ PostgreSQL  │────►│ Azure Data   │────►│ Azure ML        │────►│ Model         │
│ (live data) │     │ Factory      │     │ Training        │     │ Registry      │
│             │     │ (ETL nightly)│     │ Pipeline        │     │               │
└─────────────┘     └──────────────┘     └─────────────────┘     └───────┬───────┘
                                                                         │ Deploy
┌─────────────┐                                                  ┌───────▼───────┐
│ Blob Storage│◄─────── Training datasets, feature stores ──────│ Managed       │
│ (datasets)  │                                                  │ Endpoint      │
└─────────────┘                                                  └───────────────┘
```

**Pipeline Steps:**

1. **Extract:** Azure Data Factory copies exercise data (completed exercises, snapshots, cost lines) nightly to Blob Storage as Parquet files
2. **Transform:** Feature engineering pipeline calculates derived metrics (cost-per-PAX, RPA/O&M ratios, rate deltas, category distributions)
3. **Train:** Azure ML AutoML or custom training scripts produce updated models
4. **Register:** Models are versioned in the Azure ML Model Registry with performance metrics
5. **Deploy:** Approved models are deployed to managed online endpoints with blue/green deployment
6. **Monitor:** Azure ML model monitoring tracks data drift and prediction quality; alerts on degradation

### 6.5 ML Database Additions

#### `ml_predictions`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| exercise_id | UUID (FK) | |
| model_name | VARCHAR(100) | e.g., 'forecast', 'anomaly', 'risk_score' |
| model_version | VARCHAR(50) | |
| input_hash | VARCHAR(64) | SHA-256 of input data (for cache invalidation) |
| prediction | JSONB | Full prediction result |
| confidence | DECIMAL(5,4) | Overall confidence score |
| created_at | TIMESTAMP | |
| expires_at | TIMESTAMP | Cache TTL |

#### `ml_anomaly_flags`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| exercise_id | UUID (FK) | |
| cost_line_id | UUID (FK) | References execution_cost_lines or om_cost_lines |
| cost_line_type | ENUM('EXECUTION','OM') | |
| anomaly_score | DECIMAL(5,4) | 0.0 = normal, 1.0 = extreme anomaly |
| explanation | TEXT | Human-readable reason |
| dismissed | BOOLEAN | User marked as intentional |
| dismissed_by | VARCHAR(255) | |
| created_at | TIMESTAMP | |

#### `ml_training_runs`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | |
| model_name | VARCHAR(100) | |
| run_id | VARCHAR(255) | Azure ML run ID |
| status | ENUM('RUNNING','COMPLETED','FAILED') | |
| metrics | JSONB | Accuracy, RMSE, etc. |
| started_at | TIMESTAMP | |
| completed_at | TIMESTAMP | |

### 6.6 ML Caching Strategy

ML predictions are expensive to compute. The system uses a multi-layer cache:

1. **Redis (60-second TTL):** Caches the latest prediction for a given exercise + model + input hash. Frontend calls that trigger the same model with unchanged data return instantly.
2. **PostgreSQL `ml_predictions` (24-hour TTL):** If Redis misses, check the DB for a recent prediction. If the input hash matches and it's < 24h old, serve it.
3. **Live inference:** If no cache hit, call the Azure ML managed endpoint. Response is stored in both Redis and PostgreSQL.

**Cache invalidation:** Any data mutation (PAX change, cost line edit, rate update) bumps the exercise's `updated_at`, which changes the input hash and invalidates predictions on next request.

### 6.7 Cold Start & Minimum Data Requirements

| Model | Minimum Data to Activate | Cold Start Behavior |
|-------|--------------------------|---------------------|
| Forecast | 5 completed exercises with snapshots | Shows "Insufficient data — forecast unavailable" with a progress bar showing 2/5 completed |
| Anomaly Detection | 50 historical cost lines | Uses rule-based thresholds (±3σ from category averages) as fallback |
| PAX Optimizer | No historical data needed (pure optimization) | Available immediately |
| NLP Classification | 100 labeled cost lines | Uses keyword matching as fallback |
| Risk Score | 3 completed exercises | Shows abbreviated score using only rule-based checks |
| Benchmarking | 10 completed exercises | Shows "Not enough peers for comparison" |
| Rate Impact | 3 years of rate history | Uses linear extrapolation as fallback |

> **Bootstrap strategy:** For initial deployment, seed the ML training data with anonymized exercise data from past spreadsheets. The system improves automatically as more exercises are tracked through the application.

---

## 7. Frontend Requirements

### 7.1 Application Shell

- **Sidebar navigation** with:
  - Dashboard (summary view)
  - Unit tabs: SG, AE, CAB, A7
  - Rate Configuration
  - O&M Cost Center
  - **ML Insights** (new — budget health, forecasts, optimizer)
  - Reports & Export
- **Top bar** showing: Exercise name, total RPA, total O&M, grand total, **ML Budget Health badge** (always visible)
- **Responsive layout** — functional on 1920×1080 desktop and tablets (1024px minimum)

### 7.2 Component Hierarchy

```
<App>
  <TopBar>                   — exercise selector, live totals, ML health badge
  <Sidebar>                  — navigation
  <MainContent>
    <DashboardView>          — executive summary, charts, ML forecast card
      <MlForecastCard>       — predicted final cost with confidence bands
      <MlHealthGauge>        — budget health score (0–100)
      <MlRiskFactors>        — expandable risk factor list
      <MlRateImpactCard>     — projected rate change impact
    <UnitView>               — per-unit detail (parameterized by unit code)
      <PersonnelPanel>       — PAX inputs, rank breakdown
      <MealCostPanel>        — meal rate display/override
      <TravelPanel>          — airfare, rental cars
      <ExecutionPanel>       — execution cost line items
      <UnitSummaryPanel>     — unit-level RPA/O&M subtotals
      <MlBenchmarkBadge>     — percentile rank vs. peer exercises
    <RateConfigView>         — CPD table editor, per diem editor, meal rate config
    <OmCostCenterView>       — exercise-level O&M line items + WRM
      <MlAnomalyIndicator>   — per-line anomaly flag from ML
      <MlCategorySuggestion> — NLP auto-suggest for category classification
    <MlInsightsView>         — dedicated ML page
      <BudgetOptimizerPanel> — enter constraints, get optimal PAX allocation
      <BenchmarkingPanel>    — cluster peers, percentile rankings
      <ForecastDetailPanel>  — full forecast with historical comparison
      <AnomalySummaryPanel>  — all flagged items in one view
    <ReportsView>            — full rollup, export buttons, charts
```

### 7.3 Key UI Behaviors

#### PAX Input → Live Recalculation

1. User enters PAX count in a `<NumberInput>` field
2. On change (debounced 300ms), frontend calls the calculation engine
3. All downstream subtotals, unit totals, and grand totals update in-place
4. Changed values briefly highlight (green flash for decrease, red flash for increase) for visual feedback
5. Auto-save triggers after 1 second of inactivity

#### Rank-Level Detail Toggle

- Each personnel group has a toggle: **"Use average CPD"** vs. **"Break out by rank"**
- When "Break out by rank" is selected, a sub-table appears with a row per rank and a count field
- The system sums `rank_count × rank_cpd × duty_days` instead of `pax × avg_cpd × duty_days`

#### Long Tour Toggle (RPA Only)

- A checkbox: **"Long tour orders (travel costs only)"**
- When checked, the mil pay calculation is zeroed out and only travel costs (airfare, rental car allocation, per diem if applicable) remain

#### Add Custom O&M Line

- A `+` button in the O&M Cost Center that opens a form: category dropdown, label text input, amount, notes
- "OTHER" category allows free-text entry for the category name

### 7.4 Form Validation Rules

| Field | Rule |
|-------|------|
| PAX count | Integer ≥ 0 |
| Duty days | Integer ≥ 1, ≤ 365 |
| Dollar amounts | Decimal ≥ 0, max 2 decimal places |
| Rank count | Integer ≥ 0 |
| Rental car count | Integer ≥ 0 |
| Exercise dates | end_date ≥ start_date |

---

## 8. Calculation Engine Logic

This section defines every formula the engine uses. All calculations are deterministic and reproducible.

### 8.1 Constants & Configurable Rates

| Key | Default | Source |
|-----|---------|--------|
| `BREAKFAST_COST` | $14.00 | Configurable |
| `LUNCH_MRE_COST` | $15.91 | Configurable |
| `DINNER_COST` | $14.00 | Configurable |
| `PLAYER_MEALS_PER_DAY` | Breakfast + Lunch(MRE) + Dinner = $43.91 | Derived |
| `PLAYER_BILLETING_NIGHT` | $27.00 | Configurable |
| `DEFAULT_AIRFARE` | $400.00 | Configurable |
| `GULFPORT_LODGING` | Pulled from GSA | Per diem table |
| `GULFPORT_MIE` | Pulled from GSA | Per diem table |
| `CAMP_SHELBY_LODGING` | Pulled from GSA | Per diem table |
| `CAMP_SHELBY_MIE` | Pulled from GSA | Per diem table |

### 8.2 White Cell / Support Staff — RPA

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

### 8.3 White Cell / Support Staff — O&M

Identical formula to 7.2 except:
- **No mil pay** (O&M personnel are AGRs/civilians — their salary is not in this budget)
- `milPay = 0` always
- Per diem and travel still apply

```
perDiem = pax_count × (location_lodging + location_mie) × duty_days
travel  = (pax_count × airfare_per_person)
        + (allocated_rental_cars × rental_daily_rate × rental_days)
subtotal = perDiem + travel
```

### 8.4 Players — RPA

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

> **Note:** Players meals fall under RPA costs per the requirements.

### 8.5 Players — O&M

```
billeting = pax_count × PLAYER_BILLETING_NIGHT × (duty_days − 1)
            — (duty_days − 1) because the last night is not billed;
            — this is configurable: user can set nights = duty_days if needed

subtotal = billeting
```

> Players on O&M are AGRs/civilians — no mil pay. Their meals are already covered in 7.4 under RPA (players eat together regardless of funding type). If O&M players need separate meal tracking, a toggle can split it.

### 8.6 A7 Variations

A7 uses the same formulas but with different label semantics:

| A7 Group | Maps To |
|----------|---------|
| Exercise Planning (RPA) | Uses White Cell RPA formula (7.2) |
| Exercise Planning (O&M) | Uses White Cell O&M formula (7.3) |
| Support Staff (RPA) | Uses White Cell RPA formula (7.2) |
| Support Staff (O&M) | Uses White Cell O&M formula (7.3) |
| Execution (RPA) | Manual line items |
| Execution (O&M) | Manual line items |

### 8.7 Unit Totals

```
unitTotalRpa = whiteCellRpa.subtotal + playerRpa.subtotal + executionRpa
unitTotalOm  = whiteCellOm.subtotal  + playerOm.subtotal  + executionOm
unitTotal    = unitTotalRpa + unitTotalOm
```

### 8.8 Exercise-Level O&M

```
exerciseOm = Σ om_cost_lines.amount    (all categories: contracts, transport, etc.)
wrm        = Σ om_cost_lines.amount WHERE category = 'WRM'
```

> WRM is included in the exercise-level O&M sum, but also displayed as its own line for visibility.

### 8.9 Grand Totals

```
totalRpa   = Σ unit.unitTotalRpa        (across SG, AE, CAB, A7)
totalOm    = Σ unit.unitTotalOm         (across SG, AE, CAB, A7) + exerciseOm
grandTotal = totalRpa + totalOm
```

### 8.10 RPA Travel-Only Subtotal

A dedicated rollup for planners tracking just the travel cost portion of RPA:

```
rpaTravel = Σ (group.travel) WHERE group.funding_type = 'RPA' AND group.is_long_tour = true
```

This is displayed in the dashboard as a callout: **"RPA Travel-Only (Long Tour): $X"**

---

## 9. Page & View Specifications

### 8.1 Dashboard View

**Purpose:** Single-screen executive summary of the entire exercise budget.

| Section | Content |
|---------|---------|
| **Header Cards** | Grand Total, Total RPA, Total O&M, RPA Travel-Only |
| **Unit Summary Table** | One row per unit (SG, AE, CAB, A7) with columns: Unit, RPA, O&M, Total |
| **PAX Summary** | Total players, total white cell, total PAX |
| **O&M Breakdown** | Pie or bar chart of O&M categories |
| **Budget Trend** | (QoL) If multiple snapshots saved, show how budget has changed over time |
| **Quick-Adjust Sliders** | (QoL) PAX sliders for players and white cell that update the entire budget in real time |

### 9.2 Unit Detail View (SG, AE, CAB)

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

### 9.3 A7 Unit Detail View

Same structure as 9.2, but with these label changes:

- "White Cell / Support Staff" → **"Exercise Planning Staff"** and **"Support Staff"** (two separate sections)
- "Players" section is omitted (A7 has no players)
- Execution Costs section is present

### 9.4 Rate Configuration View

#### CPD Table Editor

- Table with columns: Rank, Cost Per Day, Effective Date
- Bulk import from CSV
- Edit inline
- All enlisted (E-1 through E-9), warrant (W-1 through W-5), officer (O-1 through O-10)

#### Per Diem Editor

- Rows for Gulfport and Camp Shelby
- Columns: Location, Lodging Rate, M&IE Rate
- **"Refresh from GSA" button** — calls GSA API and updates rates

#### Meal Rate Editor

- Breakfast, Lunch/MRE, Dinner — editable fields
- Player billeting nightly rate — editable

#### Travel Defaults

- Default airfare per person
- Default rental car daily rate

### 9.5 O&M Cost Center View

**Exercise-level O&M costs** (not unit-specific):

| Column | Type |
|--------|------|
| Category | Dropdown: Contract, Transportation, Billeting, Port-a-Potty, Rentals/VSCOS, Consumables, WRM, Other |
| Label | Free text |
| Amount | Currency input |
| Notes | Free text |
| **ML Anomaly Flag** | Auto-populated — ⚠️ icon if Azure ML anomaly score > 0.8 |
| **ML Suggested Category** | Auto-populated — NLP-suggested category badge (user can override) |

- Add / remove rows dynamically
- Subtotal per category
- **Grand O&M Exercise Total** at bottom
- WRM total highlighted separately
- Anomaly summary banner at top: "X items flagged for review"

### 9.6 Reports & Export View

- Full budget table mirroring the dashboard but with drill-down rows
- **Export to Excel** — formatted workbook with:
  - Summary sheet
  - One sheet per unit
  - O&M detail sheet
  - Rate reference sheet
  - **ML Insights sheet** — forecast, risk score, anomaly flags, benchmarks
- **Export to CSV** — flat file of all cost lines
- **Print-friendly view** — CSS print stylesheet for one-click PDF generation
- **Snapshot** — save current state as a named version for comparison

### 9.7 ML Insights View

**Purpose:** Dedicated page for all Azure ML–powered analytics.

| Section | Content |
|---------|--------|
| **Budget Optimizer** | Enter RPA/O&M ceiling constraints and minimum PAX requirements. Click "Optimize" to receive ML-recommended PAX allocation. "Apply" button writes recommendations to the exercise. |
| **Forecast Detail** | Full forecast chart: current trajectory, predicted final cost, confidence bands, comparison with historical exercise actuals |
| **Anomaly Review** | Table of all flagged cost lines with anomaly scores, explanations, and dismiss/correct actions |
| **Benchmarking** | Cluster peer comparison: radar chart of cost categories showing where this exercise ranks vs. similar past exercises |
| **Rate Impact Simulator** | Adjust projected rate increase percentages manually to see impact on total budget. ML pre-fills with best-guess rates. |
| **Model Status** | (Admin) Shows deployed models, versions, accuracy metrics, last training date, retrain button |

---

## 10. Quality-of-Life Features

### 10.1 Scenario Comparison ("What-If" Mode)

- User can create up to 3 named scenarios (e.g., "Baseline", "Reduced PAX", "Full Scale")
- Each scenario stores its own PAX counts and cost overrides
- A comparison view shows scenarios side-by-side with delta columns
- Helps leadership see budget impact of different participation levels

### 10.2 Budget Snapshots & History

- Manual or auto-save snapshots at any point
- Snapshot list shows date, name, grand total
- Diff view highlights which numbers changed between two snapshots
- Enables tracking how the budget evolves during the planning cycle

### 10.3 Threshold Alerts

- User-configurable budget ceiling for total RPA, total O&M, and grand total
- Visual indicator (yellow warning, red critical) when approaching or exceeding thresholds
- Dashboard cards change color to match alert status

### 10.4 Notes & Assumptions Log

- A global notes panel where planners can document assumptions (e.g., "Assumed 80% fill rate", "MRE cost based on FY26 contract")
- Notes are included in exports
- Per-line notes on any cost entry

### 10.5 Audit Trail

- Every change (PAX update, rate change, cost line add/edit/delete) is logged with timestamp and user
- Viewable under a "Change Log" tab
- Helps answer "who changed what and when" during reviews

### 10.6 Dashboard Widgets

- **PAX Breakdown Donut Chart** — players vs. white cell, by unit
- **Funding Split Bar** — RPA vs. O&M proportions
- **Top 5 Cost Drivers** — ranked list of the largest cost items
- **Per-Day Burn Rate** — grand total ÷ duty days for quick reference

### 10.7 Bulk PAX Import

- Upload a CSV roster: Name (optional), Rank, Unit, Role (Player/WhiteCell), Funding (RPA/OM)
- System auto-aggregates PAX counts and rank breakdowns from the roster
- Eliminates manual counting

### 10.8 Copy Unit Configuration

- Copy all settings from one unit to another as a starting point
- Useful when units have similar compositions

### 10.9 Dark Mode

- Toggle between light/dark themes for extended use

---

## 11. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Performance** | Full recalculation in < 500 ms for up to 10,000 PAX across all units |
| **ML Inference** | ML endpoint responses in < 2 seconds (cached < 100 ms) |
| **Availability** | 99.5% uptime via Azure App Service SLA + auto-scaling |
| **Data Persistence** | All data auto-saved; no data loss on browser close |
| **Browser Support** | Chrome 100+, Edge 100+ (modern DoD browser set) |
| **Security** | Azure Entra ID (AAD) SSO; role-based access (viewer, editor, admin); all secrets in Azure Key Vault; TLS 1.2+ everywhere |
| **Accessibility** | WCAG 2.1 AA compliance for keyboard navigation and screen readers |
| **Backup** | Azure PostgreSQL automated daily backups; point-in-time recovery within 7 days; geo-redundant storage for Blob exports |
| **Compliance** | Data residency in US Azure regions; no PII stored in ML training datasets |
| **Scalability** | Azure App Service auto-scale 1–4 instances based on CPU/memory; ML endpoints scale independently |
| **Monitoring** | Application Insights tracks all API calls, ML inference latency, error rates; Azure Monitor alerts on threshold breaches |

---

## 12. Tech Stack Recommendation

### Frontend

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | **React 18** with TypeScript | Component-based, strong ecosystem, DoD familiarity |
| State Management | **Zustand** or **Redux Toolkit** | Lightweight global state for PAX inputs and calc results |
| UI Library | **Ant Design** or **Shadcn/UI** | Pre-built tables, forms, charts, professional look |
| Charts | **Recharts** or **Chart.js** | Simple, composable chart components |
| Data Tables | **TanStack Table (v8)** | Sorting, filtering, inline editing for cost line tables |
| Forms | **React Hook Form** + **Zod** | Validation, performance, schema-based |
| HTTP Client | **Axios** or **fetch** with **TanStack Query** | Caching, auto-refetch, optimistic updates |
| Export | **SheetJS (xlsx)** | Client-side Excel generation |
| Auth | **MSAL.js (@azure/msal-react)** | Azure Entra ID integration |

### Backend

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Runtime | **Node.js 20 LTS** | JavaScript full-stack simplicity |
| Framework | **Express.js** or **Fastify** | Lightweight, well-understood |
| ORM | **Prisma** | Type-safe DB access, migration support |
| Database | **Azure Database for PostgreSQL Flexible Server** | Managed, auto-backup, scalable |
| Auth | **passport-azure-ad** with MSAL | Azure Entra ID / AAD bearer token validation |
| Validation | **Zod** (shared with frontend) | Single schema definition for API + UI |
| Cache | **Azure Cache for Redis** | Per diem rate cache, ML prediction cache, session store |
| Secrets | **@azure/keyvault-secrets** | Fetch DB creds, API keys, JWT secrets at runtime from Key Vault |
| Storage | **@azure/storage-blob** | Excel/CSV export storage, roster uploads, ML datasets |
| ML Client | **@azure/ai-ml REST client** | Call Azure ML managed online endpoints |
| Monitoring | **applicationinsights** npm package | Auto-instrument Express routes, track dependencies |

### Azure ML Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Workspace | **Azure Machine Learning Workspace** | Central hub for experiments, models, endpoints |
| Training | **Azure ML AutoML** + **Custom Python scripts** | AutoML for forecasting; custom scikit-learn/PyTorch for anomaly/NLP |
| Compute | **Azure ML Compute Clusters** (Standard_DS3_v2) | On-demand training; scales to 0 when idle |
| Endpoints | **Azure ML Managed Online Endpoints** | Low-latency inference with blue/green deployment |
| Data Pipeline | **Azure Data Factory** | Nightly ETL from PostgreSQL to Blob (Parquet) for training |
| Model Registry | **Azure ML Model Registry** | Versioned models with lineage tracking |
| Monitoring | **Azure ML Model Monitor** | Data drift detection, prediction quality tracking |
| Libraries | **scikit-learn, LightGBM, Prophet, Hugging Face Transformers** | Forecasting, anomaly detection, NLP classification |

### DevOps & Infrastructure

| Tool | Purpose |
|------|---------|
| **Azure Container Registry** | Store Docker images for API and ML training |
| **Azure DevOps / GitHub Actions** | CI/CD pipeline: build → test → deploy to App Service + Static Web Apps |
| **Bicep / Terraform** | Infrastructure-as-Code for all Azure resources |
| **Docker** | Containerized API for consistent deployment |
| **Docker Compose** | Local dev: PostgreSQL + Redis + API + Frontend |
| **Playwright** | E2E testing |
| **Vitest** | Unit testing (calc engine, ML orchestration) |
| **Azure Monitor Workbooks** | Custom operational dashboards for infrastructure health |

---

## 13. Milestones & Phasing

### Phase 1 — Core Calculator + Azure Foundation (Weeks 1–3)

- [ ] Provision Azure resources: App Service, PostgreSQL, Redis, Key Vault, Blob Storage, Static Web Apps
- [ ] Bicep/Terraform IaC templates for reproducible environments
- [ ] Database schema + Prisma migrations
- [ ] Calculation engine with full unit test coverage
- [ ] API: Exercise CRUD, personnel groups, rate tables
- [ ] Frontend: Exercise creation, unit detail views with PAX inputs
- [ ] Live recalculation on input change
- [ ] Dashboard with summary cards and unit table
- [ ] Azure Entra ID authentication (SSO)
- [ ] CI/CD pipeline: GitHub → Azure App Service + Static Web Apps

### Phase 2 — O&M & Exports (Weeks 4–5)

- [ ] O&M Cost Center (exercise-level line items + WRM)
- [ ] Execution cost lines per unit
- [ ] Rate Configuration view (CPD editor, per diem editor, meal rates)
- [ ] Excel and CSV export (stored in Azure Blob Storage)
- [ ] Print-friendly view

### Phase 3 — Quality of Life (Weeks 6–7)

- [ ] GSA per diem auto-lookup integration (cached in Redis)
- [ ] Scenario comparison (what-if mode)
- [ ] Budget snapshots & history (stored in Blob Storage)
- [ ] Threshold alerts (backed by Azure Monitor)
- [ ] Charts and dashboard widgets
- [ ] Bulk PAX import (CSV roster upload to Blob → parse)

### Phase 4 — Polish & Hardening (Week 8)

- [ ] Role-based access control (viewer, editor, admin via Entra ID groups)
- [ ] Audit trail / change log
- [ ] Dark mode
- [ ] E2E test suite
- [ ] Application Insights dashboards and alert rules
- [ ] Documentation & deployment guide
- [ ] UAT with exercise planners

### Phase 5 — Azure Machine Learning (Weeks 9–12)

- [ ] Provision Azure ML Workspace, Compute Clusters, Managed Endpoints
- [ ] Set up Azure Data Factory ETL pipeline (PostgreSQL → Blob → ML Datastore)
- [ ] **Budget Forecasting model:** Train with AutoML on historical snapshots; deploy to managed endpoint
- [ ] **Anomaly Detection model:** Train Isolation Forest on historical cost lines; deploy endpoint; wire to O&M Cost Center UI (⚠️ flags)
- [ ] **PAX Optimizer:** Build constraint optimization pipeline; deploy as endpoint; build Budget Optimizer panel in ML Insights view
- [ ] **NLP Cost Classifier:** Fine-tune text classifier on cost line descriptions; deploy endpoint; wire to auto-suggest in O&M dropdown
- [ ] **Risk Scoring model:** Train gradient boosted classifier on exercise outcomes; deploy; build Budget Health Gauge on Dashboard
- [ ] **Benchmarking model:** Train K-Means clustering on exercise features; deploy; build Benchmarking panel
- [ ] **Rate Impact Predictor:** Train time-series regression on historical rates; deploy; build Rate Impact card
- [ ] ML Insights view (dedicated page with all ML panels)
- [ ] ML caching layer (Redis + PostgreSQL `ml_predictions`)
- [ ] Model monitoring: data drift alerts, retraining triggers
- [ ] Cold-start fallback logic for all models (rule-based defaults)
- [ ] ML results included in Excel/CSV exports

### Phase 6 — ML Maturation & Continuous Improvement (Ongoing)

- [ ] Automated retraining pipelines triggered by new exercise completions
- [ ] A/B testing of model versions via blue/green endpoints
- [ ] User feedback loop: "Was this ML suggestion helpful?" → logged for model improvement
- [ ] Expand NLP classifier vocabulary as more cost descriptions are entered
- [ ] Tune anomaly detection thresholds based on false-positive feedback
- [ ] Quarterly model performance review and refresh

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

## Appendix C: Azure ML Model Reference

| Model | Algorithm | Input | Output | Endpoint | Retrain Trigger |
|-------|-----------|-------|--------|----------|-----------------|
| **Budget Forecast** | AutoML ensemble (LightGBM + Prophet + ARIMA) | Exercise snapshots, PAX, rates, days | Predicted final cost + 80%/95% CI | `/ml/forecast` | Exercise completion |
| **Anomaly Detector** | Isolation Forest / Multivariate AD | Cost line: category, amount, unit, PAX ratio | Anomaly score (0–1) + explanation | `/ml/anomaly-detect` | Monthly batch |
| **PAX Optimizer** | Constrained optimization (scipy) + cost predictor | Budget ceilings, min PAX, rank prefs | Recommended PAX allocation matrix | `/ml/optimize-pax` | N/A (deterministic) |
| **NLP Classifier** | Fine-tuned transformer (DistilBERT) | Cost line description text | Category prediction + confidence | `/ml/classify-cost` | 100 new labeled lines |
| **Risk Scorer** | Gradient Boosted Trees (XGBoost) | Budget ratios, completeness flags, anomaly counts | Health score (0–100) + risk factors | `/ml/risk-score` | Exercise completion |
| **Cluster Benchmark** | K-Means (k=5–8, elbow method) | Exercise features: PAX, days, units, split | Cluster ID + percentile rankings | `/ml/benchmark` | 5 new exercises |
| **Rate Forecaster** | Linear regression / ARIMA | Historical CPD, per diem, meal rates | Projected rates + budget delta | `/ml/rate-impact` | Quarterly |

---

## Appendix D: Azure Resource Inventory

| Resource | Name Convention | Resource Group | Region |
|----------|----------------|---------------|--------|
| Static Web App | `swa-chinatracker-{env}` | `rg-chinatracker-{env}` | East US 2 |
| App Service | `app-chinatracker-api-{env}` | `rg-chinatracker-{env}` | East US 2 |
| App Service Plan | `asp-chinatracker-{env}` | `rg-chinatracker-{env}` | East US 2 |
| PostgreSQL Flexible | `psql-chinatracker-{env}` | `rg-chinatracker-{env}` | East US 2 |
| Redis Cache | `redis-chinatracker-{env}` | `rg-chinatracker-{env}` | East US 2 |
| Key Vault | `kv-chinatracker-{env}` | `rg-chinatracker-{env}` | East US 2 |
| Storage Account | `stchinatracker{env}` | `rg-chinatracker-{env}` | East US 2 |
| ML Workspace | `mlw-chinatracker-{env}` | `rg-chinatracker-ml-{env}` | East US 2 |
| Container Registry | `crchinatracker{env}` | `rg-chinatracker-{env}` | East US 2 |
| App Insights | `ai-chinatracker-{env}` | `rg-chinatracker-{env}` | East US 2 |
| Data Factory | `adf-chinatracker-{env}` | `rg-chinatracker-ml-{env}` | East US 2 |

> `{env}` = `dev`, `staging`, or `prod`

---

*End of PRD — Version 2.0*
