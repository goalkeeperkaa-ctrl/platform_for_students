-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Employer" ADD COLUMN     "about" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "culture" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "moderatedAt" TIMESTAMP(3),
ADD COLUMN     "moderationNote" TEXT,
ADD COLUMN     "moderationStatus" "ModerationStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "photos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "socials" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "videoUrl" TEXT,
ADD COLUMN     "website" TEXT;

