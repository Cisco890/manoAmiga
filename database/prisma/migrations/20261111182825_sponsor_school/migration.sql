-- MA-33: cada padrino pertenece a un colegio, igual que los alumnos.
--
-- Un padrino puede existir sin padrinazgos, así que no basta con deducir el colegio desde sus
-- alumnos: la columna es necesaria para aislar los padrinos de cada colegio.
--
-- Nota: `prisma migrate dev` propone además borrar los índices trigram y otros índices creados
-- con SQL a mano. Esas líneas se quitaron a propósito (ver README, "Trampa de los índices").

ALTER TABLE "sponsors" ADD COLUMN "school_id" UUID;

-- Padrinos existentes: el colegio de su primer alumno o, si no tienen alumnos, el primer colegio.
UPDATE "sponsors" AS s
SET "school_id" = COALESCE(
  (
    SELECT st."school_id"
    FROM "sponsorships" sp
    JOIN "students" st ON st."id" = sp."student_id"
    WHERE sp."sponsor_id" = s."id"
    ORDER BY sp."created_at"
    LIMIT 1
  ),
  (SELECT "id" FROM "schools" ORDER BY "created_at" LIMIT 1)
);

ALTER TABLE "sponsors" ALTER COLUMN "school_id" SET NOT NULL;

CREATE INDEX "sponsors_school_id_active_idx" ON "sponsors"("school_id", "active");

ALTER TABLE "sponsors"
  ADD CONSTRAINT "sponsors_school_id_fkey"
  FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
