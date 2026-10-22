-- Separa nombres y apellidos en entidades de personas para ordenar por apellido.
-- Heurística: con 3+ partes, las dos últimas son apellidos; con 2, la última es primer apellido.

CREATE OR REPLACE FUNCTION tmp_split_person_name(full_name text)
RETURNS TABLE(given_names text, first_surname text, second_surname text)
LANGUAGE plpgsql
AS $$
DECLARE
  parts text[];
  n int;
BEGIN
  parts := regexp_split_to_array(trim(regexp_replace(coalesce(full_name, ''), '\s+', ' ', 'g')), ' ');
  n := coalesce(array_length(parts, 1), 0);

  IF n = 0 OR parts[1] = '' THEN
    given_names := '';
    first_surname := '';
    second_surname := NULL;
  ELSIF n = 1 THEN
    given_names := parts[1];
    first_surname := parts[1];
    second_surname := NULL;
  ELSIF n = 2 THEN
    given_names := parts[1];
    first_surname := parts[2];
    second_surname := NULL;
  ELSE
    given_names := array_to_string(parts[1:(n - 2)], ' ');
    first_surname := parts[n - 1];
    second_surname := parts[n];
  END IF;

  RETURN NEXT;
END;
$$;

-- authorized_pickups
ALTER TABLE "authorized_pickups"
  ADD COLUMN IF NOT EXISTS "given_names" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "first_surname" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "second_surname" VARCHAR(80);

UPDATE "authorized_pickups" AS a
SET
  "given_names" = s.given_names,
  "first_surname" = s.first_surname,
  "second_surname" = NULLIF(s.second_surname, '')
FROM (
  SELECT p.id, split.given_names, split.first_surname, split.second_surname
  FROM "authorized_pickups" p
  CROSS JOIN LATERAL tmp_split_person_name(p."full_name") AS split
) AS s
WHERE a.id = s.id;

UPDATE "authorized_pickups"
SET "given_names" = COALESCE(NULLIF("given_names", ''), 'Sin nombre'),
    "first_surname" = COALESCE(NULLIF("first_surname", ''), 'Sin apellido')
WHERE "given_names" IS NULL OR "given_names" = '' OR "first_surname" IS NULL OR "first_surname" = '';

ALTER TABLE "authorized_pickups"
  ALTER COLUMN "given_names" SET NOT NULL,
  ALTER COLUMN "first_surname" SET NOT NULL;

ALTER TABLE "authorized_pickups" DROP COLUMN IF EXISTS "full_name";

CREATE INDEX IF NOT EXISTS "authorized_pickups_first_surname_second_surname_given_names_idx"
  ON "authorized_pickups" ("first_surname", "second_surname", "given_names");

-- student_siblings
ALTER TABLE "student_siblings"
  ADD COLUMN IF NOT EXISTS "given_names" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "first_surname" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "second_surname" VARCHAR(80);

UPDATE "student_siblings" AS s
SET
  "given_names" = NULLIF(p.given_names, ''),
  "first_surname" = NULLIF(p.first_surname, ''),
  "second_surname" = NULLIF(p.second_surname, '')
FROM (
  SELECT sib.id, split.given_names, split.first_surname, split.second_surname
  FROM "student_siblings" sib
  CROSS JOIN LATERAL tmp_split_person_name(sib."name") AS split
) AS p
WHERE s.id = p.id;

ALTER TABLE "student_siblings" DROP COLUMN IF EXISTS "name";

CREATE INDEX IF NOT EXISTS "student_siblings_first_surname_second_surname_given_names_idx"
  ON "student_siblings" ("first_surname", "second_surname", "given_names");

-- enrollments: contacto para mensajes y firma
ALTER TABLE "enrollments"
  ADD COLUMN IF NOT EXISTS "message_contact_given_names" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "message_contact_first_surname" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "message_contact_second_surname" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "signer_given_names" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "signer_first_surname" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "signer_second_surname" VARCHAR(80);

UPDATE "enrollments" AS e
SET
  "message_contact_given_names" = NULLIF(c.given_names, ''),
  "message_contact_first_surname" = NULLIF(c.first_surname, ''),
  "message_contact_second_surname" = NULLIF(c.second_surname, '')
FROM (
  SELECT en.id, split.given_names, split.first_surname, split.second_surname
  FROM "enrollments" en
  CROSS JOIN LATERAL tmp_split_person_name(en."message_contact_name") AS split
  WHERE en."message_contact_name" IS NOT NULL
) AS c
WHERE e.id = c.id;

UPDATE "enrollments" AS e
SET
  "signer_given_names" = NULLIF(c.given_names, ''),
  "signer_first_surname" = NULLIF(c.first_surname, ''),
  "signer_second_surname" = NULLIF(c.second_surname, '')
FROM (
  SELECT en.id, split.given_names, split.first_surname, split.second_surname
  FROM "enrollments" en
  CROSS JOIN LATERAL tmp_split_person_name(en."signer_name") AS split
  WHERE en."signer_name" IS NOT NULL
) AS c
WHERE e.id = c.id;

ALTER TABLE "enrollments"
  DROP COLUMN IF EXISTS "message_contact_name",
  DROP COLUMN IF EXISTS "signer_name";

CREATE INDEX IF NOT EXISTS "enrollments_message_contact_surnames_idx"
  ON "enrollments" ("message_contact_first_surname", "message_contact_second_surname", "message_contact_given_names");

CREATE INDEX IF NOT EXISTS "enrollments_signer_surnames_idx"
  ON "enrollments" ("signer_first_surname", "signer_second_surname", "signer_given_names");

-- class_sections: maestro
ALTER TABLE "class_sections"
  ADD COLUMN IF NOT EXISTS "teacher_given_names" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "teacher_first_surname" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "teacher_second_surname" VARCHAR(80);

UPDATE "class_sections" AS cs
SET
  "teacher_given_names" = NULLIF(p.given_names, ''),
  "teacher_first_surname" = NULLIF(p.first_surname, ''),
  "teacher_second_surname" = NULLIF(p.second_surname, '')
FROM (
  SELECT sec.id, split.given_names, split.first_surname, split.second_surname
  FROM "class_sections" sec
  CROSS JOIN LATERAL tmp_split_person_name(sec."teacher_name") AS split
  WHERE sec."teacher_name" IS NOT NULL
) AS p
WHERE cs.id = p.id;

ALTER TABLE "class_sections" DROP COLUMN IF EXISTS "teacher_name";

CREATE INDEX IF NOT EXISTS "class_sections_teacher_surnames_idx"
  ON "class_sections" ("teacher_first_surname", "teacher_second_surname", "teacher_given_names");

-- sponsors: índice para ordenar por apellido
CREATE INDEX IF NOT EXISTS "sponsors_first_surname_second_surname_given_names_idx"
  ON "sponsors" ("first_surname", "second_surname", "given_names");

DROP FUNCTION IF EXISTS tmp_split_person_name(text);
