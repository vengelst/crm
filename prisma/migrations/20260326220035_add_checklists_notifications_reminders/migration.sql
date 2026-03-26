-- CreateEnum
CREATE TYPE "DocumentApprovalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- AlterEnum
ALTER TYPE "WeeklyTimesheetStatus" ADD VALUE 'APPROVED';
ALTER TYPE "WeeklyTimesheetStatus" ADD VALUE 'BILLED';

-- AlterTable: Document - add approval fields
ALTER TABLE "Document" ADD COLUMN     "approvalComment" TEXT,
ADD COLUMN     "approvalStatus" "DocumentApprovalStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT;

-- AlterTable: Project - add billing ready fields
ALTER TABLE "Project" ADD COLUMN     "billingReady" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billingReadyAt" TIMESTAMP(3),
ADD COLUMN     "billingReadyByUserId" TEXT,
ADD COLUMN     "billingReadyComment" TEXT;

-- AlterTable: WeeklyTimesheet - add approval and billing fields
ALTER TABLE "WeeklyTimesheet" ADD COLUMN     "approvalComment" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "billedAt" TIMESTAMP(3),
ADD COLUMN     "billedByUserId" TEXT;

-- CreateTable: ProjectChecklist
CREATE TABLE "ProjectChecklist" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProjectChecklistItem
CREATE TABLE "ProjectChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedByName" TEXT,
    "completedById" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ChecklistTemplate
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ChecklistTemplateItem
CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Notification
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "recipientWorkerId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "linkType" TEXT,
    "linkId" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ReminderLog
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'SENT',

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectChecklist_projectId_idx" ON "ProjectChecklist"("projectId");

-- CreateIndex
CREATE INDEX "ProjectChecklistItem_checklistId_idx" ON "ProjectChecklistItem"("checklistId");

-- CreateIndex
CREATE INDEX "ChecklistTemplateItem_templateId_idx" ON "ChecklistTemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_read_idx" ON "Notification"("recipientUserId", "read");

-- CreateIndex
CREATE INDEX "Notification_recipientWorkerId_read_idx" ON "Notification"("recipientWorkerId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_type_entityId_channel_recipientId_key" ON "ReminderLog"("type", "entityId", "channel", "recipientId");

-- CreateIndex
CREATE INDEX "ReminderLog_type_entityId_idx" ON "ReminderLog"("type", "entityId");

-- AddForeignKey
ALTER TABLE "ProjectChecklist" ADD CONSTRAINT "ProjectChecklist_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectChecklistItem" ADD CONSTRAINT "ProjectChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "ProjectChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateItem" ADD CONSTRAINT "ChecklistTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientWorkerId_fkey" FOREIGN KEY ("recipientWorkerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
