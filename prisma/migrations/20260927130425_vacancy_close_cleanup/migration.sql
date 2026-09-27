-- AlterTable
ALTER TABLE "Vacancy" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "keepAfterClose" BOOLEAN,
ADD COLUMN     "lastCleanupReminderAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Vacancy_status_closedAt_idx" ON "Vacancy"("status", "closedAt");
