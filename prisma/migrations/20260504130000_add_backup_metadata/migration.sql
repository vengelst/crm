-- BackupStatus + BackupStorageType
CREATE TYPE "BackupStatus" AS ENUM ('READY', 'FAILED');
CREATE TYPE "BackupStorageType" AS ENUM ('MINIO', 'FILESYSTEM');

-- Backup table
CREATE TABLE "Backup" (
  "id"              TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT,
  "status"          "BackupStatus" NOT NULL DEFAULT 'READY',
  "storageType"     "BackupStorageType" NOT NULL DEFAULT 'MINIO',
  "storageKey"      TEXT NOT NULL,
  "hasDatabase"     BOOLEAN NOT NULL DEFAULT false,
  "databaseStatus"  TEXT NOT NULL DEFAULT 'skipped',
  "hasSettings"     BOOLEAN NOT NULL DEFAULT false,
  "settingsStatus"  TEXT NOT NULL DEFAULT 'skipped',
  "hasDocuments"    BOOLEAN NOT NULL DEFAULT false,
  "documentsStatus" TEXT NOT NULL DEFAULT 'skipped',
  "documentsCount"  INTEGER NOT NULL DEFAULT 0,
  "sizeBytes"       BIGINT,
  "errorMessage"    TEXT,
  CONSTRAINT "Backup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Backup" ADD CONSTRAINT "Backup_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Backup_status_createdAt_idx" ON "Backup"("status", "createdAt");
CREATE INDEX "Backup_storageType_idx" ON "Backup"("storageType");
