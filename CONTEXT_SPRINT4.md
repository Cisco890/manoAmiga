# Contexto del Sprint 4 — Padrinos y padrinazgos (epic MA-5)

> Guía para **Juan Francisco Martínez** (o su agente de IA) antes de trabajar MA-35, MA-36 y MA-38.
> Resume lo que ya quedó hecho en MA-37, MA-33 y MA-34, los contratos de la API que puede
> reutilizar y una propuesta técnica para cada historia pendiente. Si algo de aquí contradice al
> código, **manda el código**.

---

## 0. División del sprint

| Clave | Historia | Responsable | Estado |
|---|---|---|---|
| MA-37 | Modelo muchos a muchos padrinos ↔ alumnos | Luis Pedro | ✅ Hecha |
| MA-33 | Crear o localizar un padrino existente | Luis Pedro | ✅ Hecha |
| MA-34 | Asignar padrino a un alumno con compromiso de donación | Luis Pedro | ✅ Hecha |
| **MA-35** | **Datos fiscales del padrino** | **Juan Francisco** | Por hacer |
| **MA-36** | **Ciclo de estados del padrinazgo** | **Juan Francisco** | Por hacer |
| **MA-38** | **Indicadores de cobertura en el dashboard** | **Juan Francisco** | Por hacer |

**Antes de empezar:** haga `git pull` y confirme que `main` tiene los tres commits
`feat(MA-37)`, `feat(MA-33)` y `feat(MA-34)`. Después aplique la migración nueva y el seed:
`cd database; npm run db:deploy; npm run db:generate; npm run db:seed`.

Supabase **sigue fuera** de este sprint. Todo corre contra PostgreSQL local.

---

## 1. Lo que ya existe

### Base de datos

- `sponsors` ahora tiene **`school_id`** (migración `20261111182825_sponsor_school`). Todas las
  consultas de padrinos filtran por el colegio del usuario.
- `sponsorships` es muchos a muchos. Estados: `PENDING`, `ACTIVE`, `PAUSED`, `ENDED`, `CANCELLED`.
  Tiene `start_date`, `end_date` y un CHECK `end_date >= start_date`.
- `donation_commitments` está vinculado al padrinazgo. Estados: `PENDING`, `ACTIVE`, `PAUSED`,
  `COMPLETED`, `CANCELLED`. Tiene `amount DECIMAL(12,2) > 0`.
- `sponsor_receipt_profiles` (para MA-35) **ya existe** con `sponsor_id` único, `receipt_name`,
  `nit_encrypted`, `nit_hash` (único), `fiscal_address` y `receipt_email`. No hace falta migración
  para crearla.
- Ajuste `sponsorship.max_open_per_student = 1` en `system_settings` (seed).

### Backend (`database/src/school/`)

| Archivo | Qué tiene |
|---|---|
| `sponsorships.ts` (MA-37) | `OPEN_SPONSORSHIP_STATUSES` = PENDING, ACTIVE, PAUSED. `assertStudentCanReceiveSponsor(tx, schoolId, studentId)` bloquea la fila del alumno y responde 409 si ya llegó al cupo. `assertNoOpenSponsorshipForPair(client, sponsorId, studentId)`. |
| `sponsors.ts` (MA-33) | CRUD de padrinos, `findSponsorMatches`, `publicSponsor`, `publicSponsorship`, `sponsorDisplayName`, y además `commitmentSelect` y `publicCommitment` (MA-34). |
| `sponsorshipAssignment.ts` (MA-34) | `parseAssignmentInput`, `assignSponsor` (crea el padrinazgo **PENDING** + el compromiso **PENDING** en una transacción), `listStudentSponsorships`. |
| `studentSummary.ts` | La ficha muestra los padrinazgos **abiertos** (PENDING, ACTIVE, PAUSED) con `status` y `commitment`. |
| `http.ts` | Rutas en `handleSchoolRoutes`, sección `// --- Padrinos (MA-33) ---` y `// --- Padrinazgos del alumno (MA-34) ---`. |

### Endpoints

| Endpoint | Permiso |
|---|---|
| `GET /api/sponsors?q&active&page&limit` | `sponsor.read` |
| `GET /api/sponsors/matches?name&email&phone&excludeId` | `sponsor.read` |
| `GET /api/sponsors/:id` | `sponsor.read` |
| `POST /api/sponsors`, `PATCH /api/sponsors/:id`, `DELETE /api/sponsors/:id` (desactiva) | `sponsor.write` |
| `GET /api/students/:id/sponsorships` | `sponsor.read` |
| `POST /api/students/:id/sponsorships` | `sponsor.write` + `donation.write` |

Forma de un padrinazgo en las respuestas:

```jsonc
{
  "id": "…", "status": "PENDING", "startDate": "2026-02-01", "endDate": null, "notes": null,
  "student": { "id": "…", "studentCode": "MA-2026-00001", "fullName": "Ana Pérez" }, // desde el padrino
  "sponsor": { "id": "…", "fullName": "José Solidario", "contactName": null, "active": true }, // desde el alumno
  "commitment": {
    "id": "…", "authorizedAmount": "250.00", "currency": "GTQ", "frequency": "MONTHLY",
    "startDate": "2026-02-01", "endDate": null, "status": "PENDING"
  }
}
```

> **Regla de negocio importante:** el compromiso es dinero **autorizado**, nunca recibido. La API
> lo llama `authorizedAmount` y la UI siempre dice «autorizado». Respete esto en MA-38.

### Frontend (`front/src/`)

- `api/sponsors.ts`: tipos (`Sponsor`, `SponsorshipSummary`, `SponsorshipCommitment`,
  `StudentSponsorship`, …) y funciones del cliente. **Amplíelo**; no cree otro archivo de padrinos.
- `lib/labels.ts`: `sponsorshipStatusLabels`, `donationFrequencyLabels`, `sponsorTypeLabels`.
- `lib/money.ts`: `formatMoney(amount, currency)` y `describeCommitment(commitment)`.
- `pages/SponsorsPage.tsx`: listado de padrinos con búsqueda.
- `components/sponsors/SponsorDetailModal.tsx`: detalle del padrino. **Tiene dos puntos de
  extensión marcados con comentarios**:
  - `{/* MA-35: sección "Datos fiscales" … */}`
  - el comentario de cabecera sobre MA-36: agregar una columna «Acciones» en la tabla de padrinazgos.
- `components/sponsors/AssignSponsorModal.tsx` y la sección «Padrino» de
  `components/school/StudentSummaryModal.tsx`.
- `auth/types.ts` ya incluye `donation.read` y `donation.write`.

### Pruebas

- `database/test/support/schoolFixtures.ts` ahora tiene `createSponsor()`,
  `createSponsorshipRow(sponsorId, studentId, status)` y `trackSponsor(id)`. `cleanup()` borra los
  padrinos, padrinazgos, compromisos y documentos de padrinazgo que se crearon. **Úselos.**
- Ejemplos: `sponsors.test.ts`, `sponsorship-model.test.ts`, `sponsorship-assignment.test.ts`,
  `front/src/components/sponsors/*.test.tsx`.
- `database/test/database.test.ts` cuenta los ajustes del seed (hoy **4**) y los permisos (hoy
  **17**). Si agrega alguno, actualice la prueba.

---

## 2. Trampas conocidas

1. **`prisma migrate dev` propone borrar índices hechos a mano** (trigram, parciales y otros).
   Cree las migraciones con `npx prisma migrate dev --create-only --name …`, **borre** del SQL
   todos los `DROP INDEX`, `ALTER INDEX … RENAME` y `CREATE INDEX` que no sean suyos, y luego
   aplíquela con `npm run db:deploy`. Así se hizo `20261111182825_sponsor_school`.
2. **Toda tabla nueva necesita** `ALTER TABLE "x" ENABLE ROW LEVEL SECURITY;` en su migración. La
   prueba `todas las tablas del esquema public tienen RLS activo` falla si se olvida.
3. `prisma migrate dev` puede tocar `migration_lock.toml` (solo el fin de línea). Revierta ese
   archivo antes de commitear.
4. No hay rol «Padrinazgo»: solo ADMIN y COLLABORATOR. En el Sprint 3 se decidió **usar permisos
   en lugar de roles nuevos**. COLLABORATOR solo tiene permisos de lectura (`sponsor.read`,
   `donation.read`, `dashboard.read`, …).
5. La prueba de frontend «carga la foto con la solicitud autenticada…» ya fallaba antes del
   Sprint 4. No la causa este trabajo.
6. Un padrino desactivado no se puede asignar (409) ni desactivar si tiene padrinazgos abiertos.

---

## 3. MA-35 — Datos fiscales del padrino

**Criterios:** los datos fiscales se guardan en `receipt_profiles` asociados al padrino, y solo los
ven el rol Padrinazgo y el Administrador.

**Propuesta:**

- **Cifrado del NIT:** cree `database/src/privacy/nit.ts` copiando el patrón de `privacy/cui.ts` y
  `privacy/medical.ts`. AES-256-GCM para `nit_encrypted` y hash con *pepper* para `nit_hash`, con
  variables nuevas **solo en el backend**: `NIT_ENCRYPTION_KEY` y `NIT_HASH_PEPPER`. Documéntelas en
  `database/.env.example` y en el README. Admita «CF» (consumidor final) si el colegio lo usa;
  el NIT guatemalteco tiene dígitos más un dígito verificador que puede ser `K`.
- **Endpoints:** `GET /api/sponsors/:id/receipt-profile` y `PUT /api/sponsors/:id/receipt-profile`
  (upsert), con `receiptName` obligatorio, `nit`, `fiscalAddress` y `receiptEmail`. Devuelva el NIT
  enmascarado salvo que se pida explícitamente. Registre auditoría sin copiar el NIT.
- **Visibilidad:** como no existe el rol Padrinazgo, hay dos opciones. **Confírmela con Luis Pedro:**
  1. Usar `sponsor.write`, que hoy solo tiene ADMIN. No requiere cambios en el seed.
  2. Crear un permiso `sponsor.fiscal.read` para ADMIN (seed y la prueba de 17 → 18 permisos).
  En cualquier caso, `GET /api/sponsors/:id` **no** debe incluir los datos fiscales.
- `parseSponsorInput` (MA-33) rechaza campos desconocidos como `nit`: los datos fiscales van en su
  propio endpoint, no en el del padrino.
- **Frontend:** llenar la sección marcada en `SponsorDetailModal.tsx`, visible solo con el permiso
  elegido.
- **Pruebas:** cifrado (el valor guardado no contiene el NIT), NIT duplicado → 409, colaborador →
  403, la respuesta del padrino no expone los datos fiscales, y OpenAPI.

---

## 4. MA-36 — Ciclo de estados del padrinazgo

**Criterios:** PENDIENTE → ACTIVO → PAUSADO/FINALIZADO. Cada cambio registra la fecha y el usuario.
Los padrinazgos guardan fecha de inicio, finalización y estado.

**Propuesta:**

- **Migración:** una tabla `sponsorship_status_events` (`id`, `sponsorship_id`, `from_status`,
  `to_status`, `reason`, `changed_by_user_id`, `changed_at`) **con RLS**. Así se conserva el
  historial completo, además del `AuditEvent`.
- **Transiciones** sugeridas (defínalas en un mapa, como `transitionEnrollmentStatus` en
  `enrollments.ts`):
  - `PENDING → ACTIVE | CANCELLED`
  - `ACTIVE → PAUSED | ENDED`
  - `PAUSED → ACTIVE | ENDED`
  - `ENDED` y `CANCELLED` son finales.
- **Endpoint:** `PATCH /api/sponsorships/:id/status` con `{ status, reason?, endDate? }`. Aplique un
  `updateMany` condicionado al estado actual (`where: { id, status: actual }` y `count === 1`),
  como en MA-26, para evitar que dos cambios se pisen.
- Al **finalizar**, fije `end_date` (por defecto hoy). Al **cancelar** o **finalizar**, el cupo
  del alumno se libera solo, porque `OPEN_SPONSORSHIP_STATUSES` ya no lo cuenta.
- **Compromiso:** mantenga el estado del `DonationCommitment` en línea con el del padrinazgo
  (`ACTIVE`/`PAUSED`, y `COMPLETED` o `CANCELLED` al finalizar o cancelar).
- `PAUSED → ACTIVE` no cambia el cupo, porque PAUSED ya es abierto. Si permite reabrir algo
  terminado, llame antes a `assertStudentCanReceiveSponsor`.
- **Permiso:** `sponsor.write` (y `donation.write` si cambia el compromiso).
- **Frontend:** la columna «Acciones» en la tabla de `SponsorDetailModal.tsx`, y opcionalmente en
  la ficha del alumno. Use `sponsorshipStatusLabels`.
- **Pruebas:** cada transición válida, 409 en las inválidas o concurrentes, el evento con usuario
  y fecha, el `end_date` al finalizar, y el cupo liberado (que se pueda asignar otro padrino).

---

## 5. MA-38 — Indicadores de cobertura en el dashboard

**Criterios:** los indicadores se calculan sobre las inscripciones activas del ciclo
seleccionado, y el compromiso mensual se etiqueta como «autorizado», no como dinero recibido.

**Propuesta:**

- `GET /api/dashboard/sponsorship-coverage?academicCycleId=…` con `dashboard.read` (el colaborador
  también lo tiene). Hoy no existe ningún endpoint de dashboard.
- **Base:** alumnos con inscripción activa en el ciclo. Confirme la definición con Luis Pedro; se
  sugiere `APPROVED`, o bien todos los estados excepto `CLOSED`, `CANCELLED` y `REJECTED`.
- **Con padrino:** el alumno tiene un padrinazgo **`ACTIVE`** vigente. Decida si `PAUSED` cuenta.
  `PENDING` no debería contar como cubierto.
- **Respuesta sugerida:** `totalStudents`, `withSponsor`, `withoutSponsor`, `coveragePercent`,
  `byGrade: [{ gradeId, gradeName, total, withSponsor, coveragePercent }]` y
  `monthlyAuthorizedAmount` (suma de los compromisos `MONTHLY` de padrinazgos `ACTIVE`, como texto
  con dos decimales).
- **Frontend:** `DashboardPage.tsx` ya tiene las `MetricCard` vacías («con padrino», «sin padrino»)
  y los marcadores de los gráficos «Cobertura de padrinazgo» y «Alumnos por grado». Para el monto,
  use `formatMoney` y la etiqueta «Compromiso mensual autorizado».
- **Pruebas:** porcentajes con datos controlados (un ciclo de prueba propio), que los alumnos sin
  inscripción activa no cuenten, que PENDING no cuente como cubierto, y el texto «autorizado» en la UI.

---

## 6. Archivos que se comparten

Los tres trabajos tocan los mismos archivos: `database/src/school/http.ts`,
`database/src/openapi.ts` (tag «Padrinos»), `database/test/support/schoolFixtures.ts`,
`front/src/api/sponsors.ts`, `front/src/lib/labels.ts`,
`front/src/components/sponsors/SponsorDetailModal.tsx` y `README.md` (sección «Padrinos y
padrinazgos»). Para evitar conflictos, **haga un commit por historia** y `git pull` antes de
empezar cada una.

## 7. Cómo validar

```powershell
cd database; npm run typecheck; npm test      # requiere PostgreSQL con migraciones y seed
cd ../front; npm run lint; npm test; npm run build
```
