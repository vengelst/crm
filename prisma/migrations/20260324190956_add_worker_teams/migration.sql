-- CreateTable
CREATE TABLE "WorkerTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerTeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "role" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerTeamMember_teamId_workerId_key" ON "WorkerTeamMember"("teamId", "workerId");

-- AddForeignKey
ALTER TABLE "WorkerTeamMember" ADD CONSTRAINT "WorkerTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "WorkerTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerTeamMember" ADD CONSTRAINT "WorkerTeamMember_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
