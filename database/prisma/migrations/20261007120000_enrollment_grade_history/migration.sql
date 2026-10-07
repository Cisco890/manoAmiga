-- Permite historial de grados: varias inscripciones por alumno/ciclo
-- si las anteriores están cerradas, canceladas o rechazadas.
DROP INDEX IF EXISTS "enrollments_student_id_academic_cycle_id_key";

CREATE UNIQUE INDEX "enrollments_one_open_per_student_cycle"
ON "enrollments" ("student_id", "academic_cycle_id")
WHERE "status" NOT IN ('CLOSED', 'CANCELLED', 'REJECTED');
