-- CreateTable
CREATE TABLE "PlanningBudgetItem" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "costType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "frequency" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "locationId" TEXT,
    "businessUnitId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanningBudgetItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlanningCashflowConfig" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "startingCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenueDelayDays" INTEGER NOT NULL DEFAULT 0,
    "expenseDelayDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanningCashflowConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanningBudgetItem_scenarioId_idx" ON "PlanningBudgetItem" ("scenarioId");
CREATE INDEX "PlanningBudgetItem_scenarioId_costType_idx" ON "PlanningBudgetItem" ("scenarioId", "costType");
CREATE INDEX "PlanningBudgetItem_startDate_idx" ON "PlanningBudgetItem" ("startDate");
CREATE UNIQUE INDEX "PlanningCashflowConfig_scenarioId_key" ON "PlanningCashflowConfig" ("scenarioId");

-- AddForeignKey
ALTER TABLE "PlanningBudgetItem" ADD CONSTRAINT "PlanningBudgetItem_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "PlanningScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanningBudgetItem" ADD CONSTRAINT "PlanningBudgetItem_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanningCashflowConfig" ADD CONSTRAINT "PlanningCashflowConfig_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "PlanningScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
