import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Client } from "pg";

test("la migración conserva los autorizados históricos y solo inicializa permisos vigentes", async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Temporary tables shadow public tables on this connection. Real records are never changed.
    await client.query(`
      CREATE TEMP TABLE students (id UUID PRIMARY KEY, deleted_at TIMESTAMPTZ, student_code TEXT);
      CREATE TEMP TABLE grades (id UUID PRIMARY KEY, name TEXT, code TEXT);
      CREATE TEMP TABLE academic_cycles (id UUID PRIMARY KEY, name TEXT, year INTEGER, status TEXT);
      CREATE TEMP TABLE enrollments (id UUID PRIMARY KEY, student_id UUID, academic_cycle_id UUID, grade_id UUID, status TEXT, created_at TIMESTAMPTZ);
      CREATE TEMP TABLE authorized_pickups (
        id UUID PRIMARY KEY, enrollment_id UUID NOT NULL, given_names TEXT, first_surname TEXT,
        second_surname TEXT, relationship TEXT, identifier_encrypted TEXT, identifier_hash TEXT,
        phone TEXT, sort_order INTEGER, active BOOLEAN, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
      );
      INSERT INTO students VALUES
        ('00000000-0000-4000-8000-000000000001', NULL, 'MIGRATION-1'),
        ('00000000-0000-4000-8000-000000000002', NULL, 'MIGRATION-2'),
        ('00000000-0000-4000-8000-000000000003', now(), 'MIGRATION-DELETED');
      INSERT INTO academic_cycles (id, year, status) VALUES
        ('10000000-0000-4000-8000-000000000001', 2024, 'ACTIVE'),
        ('10000000-0000-4000-8000-000000000002', 2025, 'CLOSED'),
        ('10000000-0000-4000-8000-000000000003', 2026, 'ACTIVE');
      INSERT INTO enrollments (id, student_id, academic_cycle_id, status, created_at) VALUES
        ('20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'APPROVED', '2026-10-01'),
        ('20000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'APPROVED', '2026-01-01'),
        ('20000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'APPROVED', '2025-01-01'),
        ('20000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003', 'CLOSED', '2026-01-01'),
        ('20000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'APPROVED', '2026-01-01');
      INSERT INTO authorized_pickups
        (id, enrollment_id, given_names, first_surname, relationship, sort_order, active, created_at, updated_at)
        SELECT gen_random_uuid(), id, CASE WHEN id = '20000000-0000-4000-8000-000000000002' THEN 'Vigente' ELSE 'Histórica' END,
          'López', 'Vecina', 1, true, now(), now() FROM enrollments;
    `);
    const original = (await client.query("SELECT * FROM authorized_pickups ORDER BY enrollment_id")).rows;
    const sql = await readFile(new URL("../prisma/migrations/20261022120000_student_directory/migration.sql", import.meta.url), "utf8");
    await client.query(sql);
    const snapshots = (await client.query("SELECT * FROM authorized_pickups WHERE enrollment_id IS NOT NULL ORDER BY enrollment_id")).rows;
    assert.deepEqual(snapshots.map(({ student_id, ...snapshot }) => snapshot), original);
    const current = (await client.query("SELECT student_id, given_names FROM authorized_pickups WHERE student_id IS NOT NULL")).rows;
    assert.deepEqual(current, [{ student_id: "00000000-0000-4000-8000-000000000001", given_names: "Vigente" }]);
    await assert.rejects(client.query("INSERT INTO authorized_pickups (id, student_id, enrollment_id) VALUES (gen_random_uuid(), '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001')"), /authorized_pickups_one_owner/);
  } finally {
    await client.end();
  }
});
