-- CreateTable
CREATE TABLE "PlanningImportJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "duplicateStrategy" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "filename" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "errorReportJson" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    CONSTRAINT "PlanningImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanningImportJob_startedAt_idx" ON "PlanningImportJob" ("startedAt");

-- CreateIndex
CREATE INDEX "PlanningImportJob_type_mode_idx" ON "PlanningImportJob" ("type", "mode");

-- AddForeignKey
ALTER TABLE "PlanningImportJob" ADD CONSTRAINT "PlanningImportJob_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
