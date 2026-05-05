-- CreateTable
CREATE TABLE "PlanningPipelineItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "customerId" TEXT,
    "projectId" TEXT,
    "ownerUserId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'LEAD',
    "amountTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "winProbability" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "expectedStartDate" TIMESTAMP(3) NOT NULL,
    "expectedEndDate" TIMESTAMP(3),
    "expectedWeeklyHours" DOUBLE PRECISION,
    "locationId" TEXT,
    "businessUnitId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanningPipelineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanningPipelineItem_stage_idx" ON "PlanningPipelineItem" ("stage");
CREATE INDEX "PlanningPipelineItem_ownerUserId_idx" ON "PlanningPipelineItem" ("ownerUserId");
CREATE INDEX "PlanningPipelineItem_locationId_idx" ON "PlanningPipelineItem" ("locationId");
CREATE INDEX "PlanningPipelineItem_businessUnitId_idx" ON "PlanningPipelineItem" ("businessUnitId");
CREATE INDEX "PlanningPipelineItem_expectedStartDate_idx" ON "PlanningPipelineItem" ("expectedStartDate");

-- AddForeignKey
ALTER TABLE "PlanningPipelineItem" ADD CONSTRAINT "PlanningPipelineItem_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
