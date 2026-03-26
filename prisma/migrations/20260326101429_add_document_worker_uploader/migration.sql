-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "uploadedByWorkerId" TEXT;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "deviceDisplayName" TEXT,
ADD COLUMN     "deviceUuid" TEXT;

-- CreateTable
CREATE TABLE "KioskDevice" (
    "id" TEXT NOT NULL,
    "deviceUuid" TEXT NOT NULL,
    "displayName" TEXT,
    "platform" TEXT,
    "browser" TEXT,
    "userAgent" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "assignedWorkerId" TEXT,
    "assignedUserId" TEXT,

    CONSTRAINT "KioskDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KioskDevice_deviceUuid_key" ON "KioskDevice"("deviceUuid");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedByWorkerId_fkey" FOREIGN KEY ("uploadedByWorkerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskDevice" ADD CONSTRAINT "KioskDevice_assignedWorkerId_fkey" FOREIGN KEY ("assignedWorkerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KioskDevice" ADD CONSTRAINT "KioskDevice_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
