-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "current" INTEGER NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- Seed counters: start values respect existing data
-- Customer counter: max existing K-number or 1244 (so next = K1245)
INSERT INTO "Counter" ("id", "prefix", "current")
SELECT 'CUSTOMER', 'K', GREATEST(1244, COALESCE(
  (SELECT MAX(CAST(SUBSTRING("customerNumber" FROM 2) AS INTEGER))
   FROM "Customer"
   WHERE "customerNumber" ~ '^K[0-9]+$'),
  1244
));

-- Project counter: max existing P-number or 1277 (so next = P1278)
INSERT INTO "Counter" ("id", "prefix", "current")
SELECT 'PROJECT', 'P', GREATEST(1277, COALESCE(
  (SELECT MAX(CAST(SUBSTRING("projectNumber" FROM 2) AS INTEGER))
   FROM "Project"
   WHERE "projectNumber" ~ '^P[0-9]+$'),
  1277
));
