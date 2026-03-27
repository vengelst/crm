-- DropColumn: Remove plaintext PIN storage
ALTER TABLE "WorkerPin" DROP COLUMN IF EXISTS "pinPlain";
