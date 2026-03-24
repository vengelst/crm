-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "hourlyRateUpTo40h" DOUBLE PRECISION,
ADD COLUMN     "includedHoursPerWeek" DOUBLE PRECISION,
ADD COLUMN     "overtimeRate" DOUBLE PRECISION,
ADD COLUMN     "weeklyFlatRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "internalHourlyRate" DOUBLE PRECISION;
