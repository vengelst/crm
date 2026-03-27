-- CreateTable: ChecklistTemplateNotice
CREATE TABLE "ChecklistTemplateNotice" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "requireSignature" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChecklistTemplateNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProjectNotice
CREATE TABLE "ProjectNotice" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceTemplateId" TEXT,
    "sourceTemplateNoticeId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "requireSignature" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProjectNoticeAcknowledgement
CREATE TABLE "ProjectNoticeAcknowledgement" (
    "id" TEXT NOT NULL,
    "projectNoticeId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "signatureImagePath" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectNoticeAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChecklistTemplateNotice_templateId_idx" ON "ChecklistTemplateNotice"("templateId");

-- CreateIndex
CREATE INDEX "ProjectNotice_projectId_idx" ON "ProjectNotice"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectNoticeAcknowledgement_projectNoticeId_workerId_key" ON "ProjectNoticeAcknowledgement"("projectNoticeId", "workerId");

-- CreateIndex
CREATE INDEX "ProjectNoticeAcknowledgement_projectId_workerId_idx" ON "ProjectNoticeAcknowledgement"("projectId", "workerId");

-- AddForeignKey
ALTER TABLE "ChecklistTemplateNotice" ADD CONSTRAINT "ChecklistTemplateNotice_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNotice" ADD CONSTRAINT "ProjectNotice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNoticeAcknowledgement" ADD CONSTRAINT "ProjectNoticeAcknowledgement_projectNoticeId_fkey" FOREIGN KEY ("projectNoticeId") REFERENCES "ProjectNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNoticeAcknowledgement" ADD CONSTRAINT "ProjectNoticeAcknowledgement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNoticeAcknowledgement" ADD CONSTRAINT "ProjectNoticeAcknowledgement_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
