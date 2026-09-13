-- CreateEnum
CREATE TYPE "VacancyStatus" AS ENUM ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'CLOSED');

-- AlterTable
ALTER TABLE "Vacancy" ADD COLUMN     "learnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "moderationNote" TEXT,
ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "status" "VacancyStatus" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "team" TEXT,
ADD COLUMN     "videoUrl" TEXT;

