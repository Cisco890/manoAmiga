-- Current pickup permissions belong to the student. Enrollment rows remain historical snapshots.
ALTER TABLE "authorized_pickups"
  ALTER COLUMN "enrollment_id" DROP NOT NULL,
  ADD COLUMN "student_id" UUID,
  ADD CONSTRAINT "authorized_pickups_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "authorized_pickups_one_owner"
    CHECK (("student_id" IS NULL) <> ("enrollment_id" IS NULL));

CREATE UNIQUE INDEX "authorized_pickups_student_id_sort_order_key"
  ON "authorized_pickups"("student_id", "sort_order");
CREATE INDEX "authorized_pickups_student_id_active_idx"
  ON "authorized_pickups"("student_id", "active");

-- Initialize the current list from the most recent open enrollment, never from a closed cycle.
WITH latest AS (
  SELECT DISTINCT ON (e.student_id) e.id, e.student_id
  FROM enrollments e
  JOIN academic_cycles c ON c.id = e.academic_cycle_id
  JOIN students s ON s.id = e.student_id
  WHERE e.status IN ('DRAFT', 'PENDING_REVIEW', 'INCOMPLETE', 'APPROVED')
    AND c.status <> 'CLOSED' AND s.deleted_at IS NULL
  ORDER BY e.student_id, c.year DESC, e.created_at DESC, e.id DESC
)
INSERT INTO authorized_pickups (
  id, student_id, given_names, first_surname, second_surname, relationship,
  identifier_encrypted, identifier_hash, phone, sort_order, active, created_at, updated_at
)
SELECT gen_random_uuid(), latest.student_id, p.given_names, p.first_surname,
  p.second_surname, p.relationship, p.identifier_encrypted, p.identifier_hash,
  p.phone, p.sort_order, true, p.created_at, p.updated_at
FROM latest JOIN authorized_pickups p ON p.enrollment_id = latest.id
WHERE p.active;

-- Existing name trigrams cover students, guardians and sponsors; add the remaining search fields.
CREATE INDEX "students_code_trgm" ON "students" USING GIN ("student_code" gin_trgm_ops);
CREATE INDEX "grades_name_trgm" ON "grades" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "grades_code_trgm" ON "grades" USING GIN ("code" gin_trgm_ops);
CREATE INDEX "academic_cycles_name_trgm" ON "academic_cycles" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "enrollments_grade_student_idx" ON "enrollments"("grade_id", "student_id");
