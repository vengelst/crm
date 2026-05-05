CREATE TABLE "PlanningScenario" (
  "id"                          TEXT NOT NULL,
  "name"                        TEXT NOT NULL,
  "description"                 TEXT,
  "teamsPerWeek"                DOUBLE PRECISION NOT NULL,
  "workersPerTeam"              DOUBLE PRECISION NOT NULL,
  "costPerWorkerWeek"           DOUBLE PRECISION NOT NULL,
  "regularHoursPerWorkerWeek"   DOUBLE PRECISION NOT NULL,
  "overtimeHoursPerWorkerWeek"  DOUBLE PRECISION NOT NULL,
  "regularRatePerHour"          DOUBLE PRECISION NOT NULL,
  "overtimeRatePerHour"         DOUBLE PRECISION NOT NULL,
  "weeksPerMonth"               DOUBLE PRECISION NOT NULL DEFAULT 4.33,
  "createdByUserId"             TEXT NOT NULL,
  "createdAt"                   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanningScenario_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlanningScenario" ADD CONSTRAINT "PlanningScenario_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "PlanningScenario_createdByUserId_updatedAt_idx"
  ON "PlanningScenario"("createdByUserId", "updatedAt");

CREATE INDEX "PlanningScenario_name_idx"
  ON "PlanningScenario"("name");
