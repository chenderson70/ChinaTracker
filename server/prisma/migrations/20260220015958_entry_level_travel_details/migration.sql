-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_personnel_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "personnel_group_id" TEXT NOT NULL,
    "rank_code" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "duty_days" INTEGER,
    "location" TEXT,
    "is_local" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "personnel_entries_personnel_group_id_fkey" FOREIGN KEY ("personnel_group_id") REFERENCES "personnel_groups" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_personnel_entries" ("count", "id", "personnel_group_id", "rank_code") SELECT "count", "id", "personnel_group_id", "rank_code" FROM "personnel_entries";
DROP TABLE "personnel_entries";
ALTER TABLE "new_personnel_entries" RENAME TO "personnel_entries";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
