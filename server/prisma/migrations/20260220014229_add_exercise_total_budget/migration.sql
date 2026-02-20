-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_exercises" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner_user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "total_budget" REAL NOT NULL DEFAULT 0,
    "start_date" DATETIME NOT NULL,
    "end_date" DATETIME NOT NULL,
    "default_duty_days" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_exercises" ("created_at", "default_duty_days", "end_date", "id", "name", "owner_user_id", "start_date", "updated_at") SELECT "created_at", "default_duty_days", "end_date", "id", "name", "owner_user_id", "start_date", "updated_at" FROM "exercises";
DROP TABLE "exercises";
ALTER TABLE "new_exercises" RENAME TO "exercises";
CREATE INDEX "exercises_owner_user_id_updated_at_idx" ON "exercises"("owner_user_id", "updated_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
