ALTER TABLE "personnel_entries" ADD COLUMN "start_date" DATETIME;
ALTER TABLE "personnel_entries" ADD COLUMN "end_date" DATETIME;

ALTER TABLE "execution_cost_lines" ADD COLUMN "start_date" DATETIME;
ALTER TABLE "execution_cost_lines" ADD COLUMN "end_date" DATETIME;

ALTER TABLE "om_cost_lines" ADD COLUMN "start_date" DATETIME;
ALTER TABLE "om_cost_lines" ADD COLUMN "end_date" DATETIME;
