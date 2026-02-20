-- CreateTable
CREATE TABLE "exercises" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME NOT NULL,
    "default_duty_days" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "unit_budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exercise_id" TEXT NOT NULL,
    "unit_code" TEXT NOT NULL,
    CONSTRAINT "unit_budgets_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "personnel_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unit_budget_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "funding_type" TEXT NOT NULL,
    "pax_count" INTEGER NOT NULL DEFAULT 0,
    "duty_days" INTEGER,
    "location" TEXT,
    "is_long_tour" BOOLEAN NOT NULL DEFAULT false,
    "avg_cpd_override" REAL,
    CONSTRAINT "personnel_groups_unit_budget_id_fkey" FOREIGN KEY ("unit_budget_id") REFERENCES "unit_budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "personnel_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personnel_group_id" TEXT NOT NULL,
    "rank_code" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    CONSTRAINT "personnel_entries_personnel_group_id_fkey" FOREIGN KEY ("personnel_group_id") REFERENCES "personnel_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "rank_cpd_rates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rank_code" TEXT NOT NULL,
    "cost_per_day" REAL NOT NULL,
    "effective_date" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "per_diem_rates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "location" TEXT NOT NULL,
    "lodging_rate" REAL NOT NULL,
    "mie_rate" REAL NOT NULL,
    "effective_date" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "travel_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exercise_id" TEXT NOT NULL,
    "airfare_per_person" REAL NOT NULL DEFAULT 400,
    "rental_car_daily_rate" REAL NOT NULL DEFAULT 50,
    "rental_car_count" INTEGER NOT NULL DEFAULT 0,
    "rental_car_days" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "travel_config_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "execution_cost_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unit_budget_id" TEXT NOT NULL,
    "funding_type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "notes" TEXT,
    CONSTRAINT "execution_cost_lines_unit_budget_id_fkey" FOREIGN KEY ("unit_budget_id") REFERENCES "unit_budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "om_cost_lines" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "exercise_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "notes" TEXT,
    CONSTRAINT "om_cost_lines_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "exercises" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "app_config" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "exercises_owner_user_id_updated_at_idx" ON "exercises"("owner_user_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "rank_cpd_rates_rank_code_key" ON "rank_cpd_rates"("rank_code");

-- CreateIndex
CREATE UNIQUE INDEX "per_diem_rates_location_key" ON "per_diem_rates"("location");

-- CreateIndex
CREATE UNIQUE INDEX "travel_config_exercise_id_key" ON "travel_config"("exercise_id");
