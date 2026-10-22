-- MA-27: un alumno tiene como máximo un responsable principal activo.
-- Si ya hubiera varios, se conserva el vínculo más antiguo como principal.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY created_at, id) AS position
  FROM student_guardians
  WHERE primary_contact AND active
)
UPDATE student_guardians SET primary_contact = false
FROM ranked
WHERE student_guardians.id = ranked.id AND ranked.position > 1;

-- Prisma no representa índices parciales: no está en schema.prisma (ver README).
CREATE UNIQUE INDEX "student_guardians_one_primary_per_student"
ON "student_guardians" ("student_id")
WHERE "primary_contact" AND "active";
