-- CreateTable
CREATE TABLE "PlanningCapacityProfile" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "teamId" TEXT,
    "workerId" TEXT,
    "weeklyTargetHours" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "availabilityFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "productivityFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.95,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanningCapacityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanningCapacityProfile_scenarioId_idx" ON "PlanningCapacityProfile" ("scenarioId");
CREATE INDEX "PlanningCapacityProfile_scenarioId_teamId_workerId_idx"
  ON "PlanningCapacityProfile" ("scenarioId", "teamId", "workerId");
CREATE INDEX "PlanningCapacityProfile_validFrom_validTo_idx"
  ON "PlanningCapacityProfile" ("validFrom", "validTo");

-- AddForeignKey
ALTER TABLE "PlanningCapacityProfile" ADD CONSTRAINT "PlanningCapacityProfile_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "PlanningScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
