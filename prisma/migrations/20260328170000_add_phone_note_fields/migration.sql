-- AlterTable
ALTER TABLE "Note" ADD COLUMN "isPhoneNote" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Note" ADD COLUMN "transcriptSource" TEXT;
ALTER TABLE "Note" ADD COLUMN "audioPath" TEXT;
