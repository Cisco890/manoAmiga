import "dotenv/config";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria para las pruebas");

const pool = new Pool({ connectionString: databaseUrl });

after(async () => {
  await pool.end();
});

test("el seed crea los catálogos mínimos sin duplicados", async () => {
  const result = await pool.query<{
    schools: string;
    cycles: string;
    grades: string;
    sections: string;
    roles: string;
    permissions: string;
    settings: string;
  }>(`
    SELECT
      (SELECT count(*) FROM schools WHERE code = 'MANO_AMIGA') AS schools,
      (SELECT count(*) FROM academic_cycles ac JOIN schools s ON s.id = ac.school_id WHERE s.code = 'MANO_AMIGA') AS cycles,
      (SELECT count(*) FROM grades g JOIN schools s ON s.id = g.school_id WHERE s.code = 'MANO_AMIGA') AS grades,
      (SELECT count(*) FROM class_sections cs JOIN academic_cycles ac ON ac.id = cs.academic_cycle_id JOIN schools s ON s.id = ac.school_id WHERE s.code = 'MANO_AMIGA') AS sections,
      (SELECT count(*) FROM roles) AS roles,
      (SELECT count(*) FROM permissions) AS permissions,
      (SELECT count(*) FROM system_settings ss JOIN schools s ON s.id = ss.school_id WHERE s.code = 'MANO_AMIGA') AS settings
  `);

  const counts = result.rows[0];
  assert.equal(Number(counts.schools), 1);
  assert.ok(Number(counts.cycles) >= 1);
  assert.equal(Number(counts.grades), 12);
  assert.ok(Number(counts.sections) >= 12);
  assert.equal(Number(counts.roles), 6);
  assert.equal(Number(counts.permissions), 17);
  assert.equal(Number(counts.settings), 3);
});

test("la migración instaló todas las restricciones CHECK", async () => {
  const expected = [
    "academic_cycles_valid_dates",
    "class_sections_positive_capacity",
    "grades_valid_age_range",
    "student_siblings_valid_age",
    "household_profiles_valid_size",
    "authorized_pickups_valid_order",
    "sponsorships_valid_dates",
    "donation_commitments_positive_amount",
    "donation_commitments_valid_dates",
    "donation_commitments_last_four_digits",
    "sponsors_name_matches_type",
  ];

  const result = await pool.query<{ conname: string }>(
    `SELECT conname FROM pg_constraint WHERE contype = 'c' AND conname = ANY($1::text[])`,
    [expected],
  );

  assert.deepEqual(new Set(result.rows.map(({ conname }) => conname)), new Set(expected));
});

test("solo puede haber una foto y una plantilla activas por ámbito", async () => {
  const expected = [
    "student_photos_one_active_per_student",
    "document_templates_one_active_per_type",
  ];

  const result = await pool.query<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
    [expected],
  );

  assert.deepEqual(new Set(result.rows.map(({ indexname }) => indexname)), new Set(expected));
  for (const { indexdef } of result.rows) {
    assert.match(indexdef, /UNIQUE INDEX/);
    assert.match(indexdef, /WHERE \(is_active = true\)/);
  }
});

test("las búsquedas por nombre usan índices trigram y pg_trgm", async () => {
  const extension = await pool.query(`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`);
  assert.equal(extension.rowCount, 1);

  const expected = [
    "students_search_name_trgm",
    "guardians_search_name_trgm",
    "sponsors_search_name_trgm",
  ];
  const result = await pool.query<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])`,
    [expected],
  );

  assert.deepEqual(new Set(result.rows.map(({ indexname }) => indexname)), new Set(expected));
  for (const { indexdef } of result.rows) assert.match(indexdef, /gin_trgm_ops/);
});

test("no existen columnas para PAN completo ni CVV", async () => {
  const result = await pool.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND lower(column_name) IN ('pan', 'card_number', 'full_card_number', 'cvv', 'cvc')
  `);

  assert.deepEqual(result.rows, []);
});

