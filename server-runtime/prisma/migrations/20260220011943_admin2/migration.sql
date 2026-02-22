-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_personnel_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unit_budget_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "funding_type" TEXT NOT NULL,
    "pax_count" INTEGER NOT NULL DEFAULT 0,
    "duty_days" INTEGER,
    "location" TEXT,
    "is_long_tour" BOOLEAN NOT NULL DEFAULT false,
    "is_local" BOOLEAN NOT NULL DEFAULT false,
    "airfare_per_person" REAL,
    "rental_car_count" INTEGER NOT NULL DEFAULT 0,
    "rental_car_daily" REAL,
    "rental_car_days" INTEGER NOT NULL DEFAULT 0,
    "avg_cpd_override" REAL,
    CONSTRAINT "personnel_groups_unit_budget_id_fkey" FOREIGN KEY ("unit_budget_id") REFERENCES "unit_budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_personnel_groups" ("avg_cpd_override", "duty_days", "funding_type", "id", "is_long_tour", "location", "pax_count", "role", "unit_budget_id") SELECT "avg_cpd_override", "duty_days", "funding_type", "id", "is_long_tour", "location", "pax_count", "role", "unit_budget_id" FROM "personnel_groups";
DROP TABLE "personnel_groups";
ALTER TABLE "new_personnel_groups" RENAME TO "personnel_groups";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
