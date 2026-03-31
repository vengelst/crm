-- CreateEnum
CREATE TYPE "OfficeReminderStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "OfficeReminderKind" AS ENUM ('TODO', 'CALLBACK', 'FOLLOW_UP');

-- CreateTable
CREATE TABLE "OfficeReminder" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "OfficeReminderKind" NOT NULL DEFAULT 'TODO',
    "status" "OfficeReminderStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "remindAt" TIMESTAMP(3) NOT NULL,
    "channels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "smsNumber" TEXT,
    "assignedUserId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "completedByUserId" TEXT,
    "completedAt" TIMESTAMP(3),
    "customerId" TEXT,
    "contactId" TEXT,
    "projectId" TEXT,
    "noteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfficeReminder_status_remindAt_idx" ON "OfficeReminder"("status", "remindAt");

-- CreateIndex
CREATE INDEX "OfficeReminder_assignedUserId_status_idx" ON "OfficeReminder"("assignedUserId", "status");

-- CreateIndex
CREATE INDEX "OfficeReminder_customerId_idx" ON "OfficeReminder"("customerId");

-- CreateIndex
CREATE INDEX "OfficeReminder_contactId_idx" ON "OfficeReminder"("contactId");

-- CreateIndex
CREATE INDEX "OfficeReminder_projectId_idx" ON "OfficeReminder"("projectId");

-- CreateIndex
CREATE INDEX "OfficeReminder_noteId_idx" ON "OfficeReminder"("noteId");

-- AddForeignKey
ALTER TABLE "OfficeReminder" ADD CONSTRAINT "OfficeReminder_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeReminder" ADD CONSTRAINT "OfficeReminder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeReminder" ADD CONSTRAINT "OfficeReminder_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeReminder" ADD CONSTRAINT "OfficeReminder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeReminder" ADD CONSTRAINT "OfficeReminder_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CustomerContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeReminder" ADD CONSTRAINT "OfficeReminder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficeReminder" ADD CONSTRAINT "OfficeReminder_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE SET NULL ON UPDATE CASCADE;
