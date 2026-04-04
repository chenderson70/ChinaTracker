ALTER TABLE "exercises"
ADD COLUMN "report_assumption_1" TEXT NOT NULL DEFAULT 'Location of exercise: Fort Hunter Liggett, CA';

ALTER TABLE "exercises"
ADD COLUMN "report_assumption_2" TEXT NOT NULL DEFAULT 'Unit of Action execution costs to be mainly funded by the NAF';

ALTER TABLE "exercises"
ADD COLUMN "report_assumption_3" TEXT NOT NULL DEFAULT 'Pay estimations for long tour orders include MAJ''s & SMSGT''s. Site visits and planning conferences used CAPT''s';
