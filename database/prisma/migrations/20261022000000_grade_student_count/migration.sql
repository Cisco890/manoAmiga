ALTER TABLE "grades"
ADD COLUMN "student_count" INTEGER,
ADD CONSTRAINT "grades_nonnegative_student_count"
CHECK ("student_count" IS NULL OR "student_count" >= 0);
