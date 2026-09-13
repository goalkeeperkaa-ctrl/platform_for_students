-- CreateEnum
CREATE TYPE "LookingFor" AS ENUM ('JOB', 'INTERNSHIP', 'PROJECT');

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "achievements" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "activities" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "goals" TEXT,
ADD COLUMN     "hobbies" TEXT,
ADD COLUMN     "links" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "lookingFor" "LookingFor"[] DEFAULT ARRAY[]::"LookingFor"[],
ADD COLUMN     "projects" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "videoUrl" TEXT;

