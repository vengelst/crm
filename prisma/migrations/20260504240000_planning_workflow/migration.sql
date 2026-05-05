-- AlterTable: add Phase 7 fields to PlanningScenario
ALTER TABLE "PlanningScenario" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "PlanningScenario" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "PlanningScenario" ADD COLUMN "locationId" TEXT;
ALTER TABLE "PlanningScenario" ADD COLUMN "businessUnitId" TEXT;

-- CreateTable
CREATE TABLE "PlanningLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanningLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanningBusinessUnit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanningBusinessUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanningBaseline" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "locationId" TEXT,
    "businessUnitId" TEXT,
    "periodType" TEXT NOT NULL,
    "periodRef" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "setByUserId" TEXT,
    CONSTRAINT "PlanningBaseline_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanningScenarioDecisionLog" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanningScenarioDecisionLog_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "PlanningLocation_code_key" ON "PlanningLocation" ("code");
CREATE UNIQUE INDEX "PlanningBusinessUnit_code_key" ON "PlanningBusinessUnit" ("code");
CREATE INDEX "PlanningScenario_status_idx" ON "PlanningScenario" ("status");
CREATE INDEX "PlanningScenario_locationId_idx" ON "PlanningScenario" ("locationId");
CREATE INDEX "PlanningScenario_businessUnitId_idx" ON "PlanningScenario" ("businessUnitId");
CREATE INDEX "PlanningBaseline_scenarioId_idx" ON "PlanningBaseline" ("scenarioId");
CREATE INDEX "PlanningBaseline_locationId_businessUnitId_periodType_periodRef_active_idx"
  ON "PlanningBaseline" ("locationId", "businessUnitId", "periodType", "periodRef", "active");
CREATE INDEX "PlanningBaseline_active_idx" ON "PlanningBaseline" ("active");
CREATE INDEX "PlanningScenarioDecisionLog_scenarioId_createdAt_idx"
  ON "PlanningScenarioDecisionLog" ("scenarioId", "createdAt");
CREATE INDEX "PlanningScenarioDecisionLog_action_idx" ON "PlanningScenarioDecisionLog" ("action");

-- Foreign keys
ALTER TABLE "PlanningScenario" ADD CONSTRAINT "PlanningScenario_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "PlanningLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanningScenario" ADD CONSTRAINT "PlanningScenario_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "PlanningBusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanningBaseline" ADD CONSTRAINT "PlanningBaseline_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "PlanningScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanningBaseline" ADD CONSTRAINT "PlanningBaseline_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "PlanningLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanningBaseline" ADD CONSTRAINT "PlanningBaseline_businessUnitId_fkey"
  FOREIGN KEY ("businessUnitId") REFERENCES "PlanningBusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlanningBaseline" ADD CONSTRAINT "PlanningBaseline_setByUserId_fkey"
  FOREIGN KEY ("setByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanningScenarioDecisionLog" ADD CONSTRAINT "PlanningScenarioDecisionLog_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "PlanningScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlanningScenarioDecisionLog" ADD CONSTRAINT "PlanningScenarioDecisionLog_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
