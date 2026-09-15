-- CreateTable
CREATE TABLE "StaffTicket" (
    "jti" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffTicket_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "StaffTicket_createdAt_idx" ON "StaffTicket"("createdAt");

