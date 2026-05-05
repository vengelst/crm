-- CreateTable
CREATE TABLE "PlanningAlertRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scenarioId" TEXT,
    "metric" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "consecutiveMonths" INTEGER NOT NULL DEFAULT 1,
    "severity" TEXT NOT NULL DEFAULT 'WARN',
    "channelInApp" BOOLEAN NOT NULL DEFAULT true,
    "channelEmail" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanningAlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningAlert" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "severity" TEXT NOT NULL DEFAULT 'WARN',
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "metricValue" DOUBLE PRECISION NOT NULL,
    "thresholdValue" DOUBLE PRECISION NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "contextJson" JSONB,
    CONSTRAINT "PlanningAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanningAlertRule_active_idx" ON "PlanningAlertRule" ("active");
CREATE INDEX "PlanningAlertRule_metric_idx" ON "PlanningAlertRule" ("metric");

-- CreateIndex
CREATE INDEX "PlanningAlert_status_idx" ON "PlanningAlert" ("status");
CREATE INDEX "PlanningAlert_ruleId_status_idx" ON "PlanningAlert" ("ruleId", "status");
CREATE INDEX "PlanningAlert_ruleId_status_dedupeKey_idx" ON "PlanningAlert" ("ruleId", "status", "dedupeKey");
CREATE INDEX "PlanningAlert_triggeredAt_idx" ON "PlanningAlert" ("triggeredAt");

-- AddForeignKey
ALTER TABLE "PlanningAlertRule" ADD CONSTRAINT "PlanningAlertRule_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "PlanningScenario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningAlertRule" ADD CONSTRAINT "PlanningAlertRule_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningAlert" ADD CONSTRAINT "PlanningAlert_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "PlanningAlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningAlert" ADD CONSTRAINT "PlanningAlert_acknowledgedById_fkey"
  FOREIGN KEY ("acknowledgedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningAlert" ADD CONSTRAINT "PlanningAlert_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
