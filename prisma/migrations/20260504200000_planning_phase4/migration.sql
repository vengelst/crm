-- Monatliche Ist-Werte
CREATE TABLE "PlanningActualMonthly" (
  "id"                   TEXT NOT NULL,
  "year"                 INTEGER NOT NULL,
  "month"                INTEGER NOT NULL,
  "actualRevenue"        DOUBLE PRECISION NOT NULL,
  "actualCost"           DOUBLE PRECISION NOT NULL,
  "actualHours"          DOUBLE PRECISION,
  "actualOvertimeHours"  DOUBLE PRECISION,
  "source"               TEXT NOT NULL DEFAULT 'manual',
  "note"                 TEXT,
  "createdByUserId"      TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanningActualMonthly_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlanningActualMonthly"
  ADD CONSTRAINT "PlanningActualMonthly_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PlanningActualMonthly_year_month_key"
  ON "PlanningActualMonthly"("year", "month");
CREATE INDEX "PlanningActualMonthly_year_month_idx"
  ON "PlanningActualMonthly"("year", "month");

-- Versionen pro Szenario
CREATE TABLE "PlanningScenarioVersion" (
  "id"              TEXT NOT NULL,
  "scenarioId"      TEXT NOT NULL,
  "versionNumber"   INTEGER NOT NULL,
  "snapshotJson"    JSONB NOT NULL,
  "changeNote"      TEXT,
  "changedByUserId" TEXT,
  "changedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanningScenarioVersion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlanningScenarioVersion"
  ADD CONSTRAINT "PlanningScenarioVersion_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "PlanningScenario"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanningScenarioVersion"
  ADD CONSTRAINT "PlanningScenarioVersion_changedByUserId_fkey"
  FOREIGN KEY ("changedByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PlanningScenarioVersion_scenarioId_versionNumber_key"
  ON "PlanningScenarioVersion"("scenarioId", "versionNumber");
CREATE INDEX "PlanningScenarioVersion_scenarioId_changedAt_idx"
  ON "PlanningScenarioVersion"("scenarioId", "changedAt");
