-- AlterTable
ALTER TABLE "Employer" ADD COLUMN     "inn" TEXT,
ADD COLUMN     "phoneEnc" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Employer_inn_key" ON "Employer"("inn");

