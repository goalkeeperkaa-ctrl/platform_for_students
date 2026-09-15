-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "marketingConsentAt" TIMESTAMP(3),
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "birthDateEnc" TEXT;

