# CRM Mano Amiga

Sistema institucional para la gestión de alumnos, inscripciones, padrinos y documentos de Mano Amiga.

El repositorio contiene:

- `front/`: aplicación web React + TypeScript + Vite.
- `database/`: PostgreSQL, Prisma y API HTTP con autenticación JWT.

## Requisitos

- Node.js 20.19 o posterior. Se recomienda Node.js 24.
- npm.
- Docker con Docker Compose.
- OpenSSL para generar secretos.

En Fedora 44 puede instalar Node.js y npm con:

```bash
sudo dnf install nodejs24-npm-bin
```

Verifique la instalación:

```bash
node --version
npm --version
docker --version
docker compose version
```

## 1. Instalar dependencias

Desde la raíz del proyecto:

```bash
cd database
npm install

cd ../front
npm install

cd ..
```

Para instalaciones reproducibles en integración continua puede utilizar `npm ci` en lugar de `npm install`.

## 2. Configurar las variables de entorno

Copie el archivo de ejemplo del backend:

```bash
cp database/.env.example database/.env
```

Genere dos valores aleatorios diferentes:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Edite `database/.env` y reemplace los valores de ejemplo:

```env
POSTGRES_PASSWORD=contraseña_aleatoria_para_postgresql
DATABASE_URL=postgresql://crm_user:contraseña_aleatoria_para_postgresql@localhost:5432/crm_colegio?schema=public
JWT_ACCESS_SECRET=secreto_aleatorio_diferente_de_al_menos_32_bytes
JWT_ISSUER=mano-amiga-api
JWT_AUDIENCE=mano-amiga-web
FRONTEND_ORIGIN=http://localhost:5173
PORT=3001
```

`POSTGRES_PASSWORD` debe coincidir con la contraseña incluida dentro de `DATABASE_URL`.
Si el puerto `3000` ya está ocupado en su máquina, use `3001` u otro libre y alinee el proxy de Vite.

No suba `database/.env` a GitHub. El archivo ya está excluido mediante `.gitignore`.

### URL de la API en el frontend

Durante el desarrollo no es necesario crear `front/.env`: Vite redirige `/api` hacia `http://localhost:3001`.

Si la API está en otro dominio, copie el archivo de ejemplo y configure la URL:

```bash
cp front/.env.example front/.env.local
```

```env
VITE_API_URL=https://api.ejemplo.edu.gt/api
```

No coloque secretos del backend en variables cuyo nombre comience con `VITE_`, porque quedan expuestas en el navegador.

## 3. Iniciar PostgreSQL

```bash
cd database
docker compose up -d
docker compose ps
```

El servicio debe aparecer con estado `healthy` y queda disponible en el puerto `5432`.

Para ver sus registros:

```bash
docker compose logs -f postgres
```

## 4. Preparar la base de datos

Desde `database/`:

```bash
npm run db:validate
npm run db:deploy
npm run db:generate
npm run db:seed
```

El seed es idempotente y crea:

- El colegio Mano Amiga.
- El ciclo escolar actual.
- Grados y secciones iniciales.
- Configuración básica.
- Los roles `ADMIN` y `COLLABORATOR`.
- Los permisos correspondientes a cada rol.

Puede ejecutar el seed nuevamente sin duplicar estos registros:

```bash
npm run db:seed
```

## 5. Crear usuarios

Las contraseñas deben contener al menos 12 caracteres. Se almacenan únicamente como hashes bcrypt y no pueden recuperarse después.

### Crear un administrador

Este ejemplo solicita la contraseña sin mostrarla en la terminal:

```bash
cd database

read -rsp "Contraseña del administrador: " MANO_AMIGA_ADMIN_PASSWORD
echo

ADMIN_EMAIL=admin@manoamiga.edu.gt \
ADMIN_DISPLAY_NAME="Administrador" \
ADMIN_PASSWORD="$MANO_AMIGA_ADMIN_PASSWORD" \
npm run db:create-admin

unset MANO_AMIGA_ADMIN_PASSWORD
```

Cambie el correo y el nombre según corresponda. El comando no reemplaza una cuenta existente.

### Crear un colaborador

```bash
cd database

read -rsp "Contraseña del colaborador: " MANO_AMIGA_COLLABORATOR_PASSWORD
echo

COLLABORATOR_EMAIL=colaborador@manoamiga.edu.gt \
COLLABORATOR_DISPLAY_NAME="Colaborador" \
COLLABORATOR_PASSWORD="$MANO_AMIGA_COLLABORATOR_PASSWORD" \
npm run db:create-collaborator

unset MANO_AMIGA_COLLABORATOR_PASSWORD
```

### Restablecer una contraseña

El proceso genera un nuevo hash, limpia los intentos fallidos, desbloquea la cuenta y revoca todas sus sesiones activas:

```bash
cd database

read -rsp "Nueva contraseña: " MANO_AMIGA_PASSWORD
echo

USER_EMAIL=usuario@manoamiga.edu.gt \
USER_PASSWORD="$MANO_AMIGA_PASSWORD" \
npm run db:set-password

unset MANO_AMIGA_PASSWORD
```

## 6. Ejecutar el proyecto

Se necesitan dos terminales.

### Terminal 1: API

```bash
cd database
npm run dev
```

La API queda disponible en `http://localhost:3001` (o el valor de `PORT`).

Compruebe su estado con:

```bash
curl http://localhost:3001/api/health
```

Respuesta esperada:

```json
{"status":"ok"}
```

### Terminal 2: frontend

```bash
cd front
npm run dev
```

Abra `http://localhost:5173` en el navegador e inicie sesión con una cuenta creada previamente.

## Roles y permisos

### Administrador (`ADMIN`)

- Acceso a todas las vistas del CRM.
- Acciones de creación y administración.
- Generación e impresión de documentos.
- Acceso a Usuarios y Configuración.

### Colaborador (`COLLABORATOR`)

- Acceso de consulta al dashboard, alumnos, inscripciones y padrinos.
- Puede consultar las vistas de documentos.
- No ve acciones para crear alumnos, inscripciones, padrinos o documentos.
- No ve Usuarios ni Configuración.
- Tampoco puede ingresar a rutas administrativas escribiendo directamente la URL.

## Grados y fechas

En **Configuración → Grados**, el formulario de creación y edición permite indicar la
**Cantidad de estudiantes** (entero no negativo, opcional). El listado muestra el valor
guardado o «Sin definir». Este dato se registra manualmente y no limita las inscripciones.
La migración `20261022000000_grade_student_count` agrega el campo sin asignar cantidades
a los grados existentes; aplíquela con `npm run db:deploy` desde `database/` y regenere
el cliente con `npm run db:generate`.

Las fechas de la interfaz se muestran e ingresan como **dd/mm/aaaa**. La API conserva
el formato ISO `YYYY-MM-DD` para guardar e intercambiar fechas.

## Búsqueda y ficha resumida de alumnos

El **Dashboard** y la vista **Alumnos** comparten el directorio de búsqueda. También
puede buscar desde la barra superior. El botón **Ver ficha** abre el expediente sin
cambiar de pantalla.

- La búsqueda admite nombres parciales y palabras en cualquier orden, código,
  **CUI completo**, nombre/código de grado, nombre/año de ciclo y nombre de
  padre, madre, tutor o padrino. El CUI se compara por hash y se muestra enmascarado.
- Los filtros **Grado** y **Ciclo escolar** se combinan sobre una misma inscripción,
  incluidas las anteriores. Los resultados se paginan de diez en diez.
- La ficha muestra fotografía, grado, estado, responsable, padrinos activos,
  estado de documentos e historial por ciclo. La inscripción actual es la abierta
  más reciente de un ciclo no cerrado. Si no hay datos, se indica explícitamente.
- El responsable es el contacto principal vigente; en su defecto, el representante
  legal u otro guardián vigente. Si solo existe un contacto en la inscripción,
  se muestra identificado como tal. Registrar un responsable no lo agrega a la
  lista de personas autorizadas para recoger al alumno.
- Los documentos distinguen pendiente de generar, generado, firmado, impreso y
  anulado. Cada inscripción conserva su grado, ciclo, estado, documentos y lista
  de autorizados; los cambios actuales no reemplazan los registros históricos.
- Las fotografías existentes se descargan mediante la API autenticada desde el
  almacenamiento privado configurado. Las claves y rutas privadas no llegan al
  navegador. Un problema con la imagen no impide consultar el resto de la ficha.

**Personas autorizadas:** quien tiene `student.write` puede registrar, editar o
retirar hasta tres personas desde la ficha, siguiendo el límite del formulario de
inscripción. Se mantienen los campos separados de nombres y apellidos, parentesco
y teléfono. No es necesario crear un guardián ni una inscripción. Guardar una lista
vacía revoca todas las autorizaciones actuales. Los cambios se auditan sin copiar
los datos personales a la auditoría.

Una nueva inscripción copia los autorizados actuales. El formulario de inscripción
y la ficha sincronizan la lista de la inscripción más reciente mientras está en
Borrador o Incompleta. Las inscripciones en revisión, aprobadas y pasadas conservan
su lista registrada.

| Endpoint | Permiso | Resultado |
| --- | --- | --- |
| `GET /api/students?q=&gradeId=&academicCycleId=&status=&page=&limit=` | `student.read` | Búsqueda paginada, aislada por colegio. |
| `GET /api/students/:id/summary` | `student.read` | Ficha resumida con autorizados e historial. |
| `PUT /api/students/:id/authorized-pickups` | `student.write` | Reemplazo de la lista actual, con `{ "authorizedPickups": [...] }`. |
| `GET /api/students/:id/photo` | `student.read` | Imagen privada, sin caché. |

La migración `20261022120000_student_directory` conserva los autorizados de cada
inscripción y crea la lista vigente a partir de la inscripción abierta más reciente,
sin reactivar permisos de ciclos cerrados. Agrega índices para búsquedas parciales y
filtros. Aplíquela desde `database/` con `npm run db:deploy` y `npm run db:generate`.

`database/test/student-directory.test.ts` verifica los seis criterios, permisos,
aislamiento por colegio, fotografías, sincronización e historial. Incluye una prueba
con 2,000 alumnos e inscripciones adicionales que exige menos de 2 segundos por
búsqueda común. La medición valida el entorno de prueba; en producción también
depende del volumen real, la infraestructura y la red.

## Padres, madres y tutores

Un responsable (padre, madre o tutor) se registra **una sola vez** y se vincula a cada
alumno. Así, al inscribir a un hermano se busca al responsable existente y se reutiliza
sin volver a digitar sus datos. Se administra desde la ficha del alumno
(**Administrar responsables**) o desde el paso **Responsables** del formulario de inscripción.

- Cada vínculo (`student_guardians`) guarda el **parentesco** (madre, padre, tutor,
  abuelo/a, hermano/a u otro con su descripción), si **vive con el alumno**, si es el
  **responsable principal**, si es representante legal y si está autorizado para trámites.
- Solo hay **un responsable principal** por alumno. Marcar a otro desmarca al anterior, y
  el primer responsable vigente queda como principal si no se indica. El índice único
  parcial `student_guardians_one_primary_per_student` (migración
  `20261022180000_guardian_primary_contact`) lo garantiza también en la base de datos.
- El **DPI** se guarda cifrado con AES-256-GCM, se busca por hash y se muestra enmascarado.
  No puede haber dos responsables con el mismo DPI: la API sugiere buscarlo y vincularlo.
- Editar los datos personales del responsable actualiza la información para todos sus
  alumnos. Desvincular no borra el registro: marca el vínculo como inactivo con fecha de fin.
- La búsqueda de responsables solo muestra los vinculados a alumnos del mismo colegio.

| Endpoint | Permiso | Resultado |
| --- | --- | --- |
| `GET /api/guardians?q=` | `student.read` | Busca responsables por nombre o DPI completo, con sus alumnos. |
| `PATCH /api/guardians/:id` | `student.write` | Actualiza los datos personales del responsable. |
| `GET /api/students/:id/guardians` | `student.read` | Responsables vigentes, con los hermanos que comparten cada uno. |
| `POST /api/students/:id/guardians` | `student.write` | Vincula uno existente (`guardianId`) o registra uno nuevo (`guardian`). |
| `PATCH /api/students/:id/guardians/:linkId` | `student.write` | Cambia parentesco, convivencia o responsabilidad principal. |
| `DELETE /api/students/:id/guardians/:linkId` | `student.write` | Termina el vínculo y conserva el historial. |

> **Índices parciales y Prisma:** Prisma no representa índices parciales, así que
> `student_guardians_one_primary_per_student` y `enrollments_one_open_per_student_cycle`
> no aparecen en `schema.prisma`. Igual que con los índices trigram, al crear una migración
> con `npx prisma migrate dev --create-only` revise el SQL y borre cualquier `DROP INDEX`
> de estos índices antes de aplicarla.

Las pruebas están en `database/test/guardians.test.ts`.

## Inscripciones

Flujo de estados: Borrador → Pendiente de revisión → Incompleta/Aprobada → Cerrada. Un cambio de grado en el mismo ciclo cierra la inscripción anterior y crea una nueva, para conservar el historial.

### Una inscripción activa por alumno y ciclo

Un alumno solo puede tener una inscripción activa (Borrador, Pendiente de revisión, Incompleta o Aprobada) en cada ciclo escolar. Las inscripciones Cerradas, Canceladas o Rechazadas no cuentan, así que no impiden crear una nueva.

- **En la base de datos:** el índice único parcial `enrollments_one_open_per_student_cycle` (migración `20261007120000_enrollment_grade_history`) bloquea el duplicado, aunque los datos se inserten sin pasar por la API.
- **En la API:** `POST /api/enrollments` responde `409` con un mensaje claro, por ejemplo *"El alumno ya tiene una inscripción activa en el ciclo 2026…"*. También ocurre si dos personas inscriben al mismo alumno al mismo tiempo: la validación previa de ambas pasa, pero el índice rechaza la segunda y la API traduce ese error.

La prueba `database/test/enrollment-constraint.test.ts` verifica el índice, los casos permitidos y la carrera entre dos transacciones.

### Formulario por pasos y campos obligatorios

La secretaría completa cada inscripción en Borrador o Incompleta con el botón **Completar formulario**. Cada paso se guarda como borrador (`PATCH /api/enrollments/:id/form`), así que el formulario puede llenarse en varias sesiones.

| Paso | Campos obligatorios |
| --- | --- |
| Responsables | Un padre, madre o tutor vigente marcado como responsable principal. Se administra en la ficha del alumno, así que sirve para todas sus inscripciones. |
| Contacto y salida | Nombre, teléfono y parentesco del contacto para mensajes. Al menos una persona autorizada para recoger al alumno (máximo 3), salvo que pueda retirarse solo. |
| Hogar | Con quién vive el alumno (al menos una opción; si marca "Otros", el detalle) y número de personas en el hogar. |
| Salud | Tipo de sangre o "se desconoce". El detalle de enfermedades, alergias a medicamentos o vacunas pendientes cuando se marcan. |
| Firma | Nombre y parentesco de quien firma. |

- `GET /api/enrollments/:id/form` devuelve los datos guardados y `missingFields`: la lista de faltantes, cada uno con su paso y una etiqueta en español. El indicador de pasos y el paso **Revisar y enviar** usan esa lista.
- La API no permite pasar a Pendiente de revisión con campos faltantes: responde `422` con `missingFields`. La validación vive en `database/src/school/enrollmentForm.ts` (`missingEnrollmentFields`) y se ejecuta dentro de la misma transacción del cambio de estado.
- Ver y editar el formulario requiere `enrollment.write`, porque incluye datos médicos. Solo se edita en Borrador o Incompleta.
- Pendiente para otra historia: perfil religioso y documento de identificación de las personas autorizadas, que debe guardarse cifrado.

### Aprobación, devolución y rechazo

Solo los usuarios con el permiso `enrollment.approve` (hoy, `ADMIN`) deciden sobre una inscripción **Pendiente de revisión**, con `PATCH /api/enrollments/:id/status`:

| Decisión | Estado resultante | Requisitos |
| --- | --- | --- |
| Aprobar | `APPROVED` | Registra `approvedAt` y `approvedByUserId`. La respuesta incluye `canGenerateDocuments: true`: la ficha PDF y el carné (Sprint 5) solo se generan para inscripciones aprobadas. |
| Devolver para corrección | `INCOMPLETE` | `rejectionReason` obligatorio (5 a 1000 caracteres). La secretaría corrige y la envía otra vez a revisión. |
| Rechazar definitivamente | `REJECTED` | `rejectionReason` obligatorio. No puede volver a revisión. |

- Una inscripción Incompleta no puede aprobarse directamente: primero debe volver a Pendiente de revisión.
- El cambio de estado es atómico. Si dos personas deciden a la vez sobre la misma inscripción, solo se aplica la primera y la otra recibe un error.
- Cada decisión queda en `audit_events` con el estado anterior, el nuevo y el motivo.
- En la vista **Inscripciones**, el botón *Pendientes de revisión* filtra la bandeja de dirección. Devolver y Rechazar piden el motivo, que después se muestra en la fila de la inscripción.

## Autenticación

- El login utiliza correo y contraseña.
- El JWT de acceso dura 15 minutos y se conserva únicamente en memoria.
- La sesión renovable dura 7 días.
- El refresh token se rota y se almacena en una cookie `HttpOnly`.
- El cierre de sesión revoca la sesión en PostgreSQL.
- Cinco intentos fallidos bloquean temporalmente la cuenta durante 15 minutos.
- Restablecer una contraseña revoca todas las sesiones existentes de ese usuario.
- Si la sesión no es válida, cualquier vista protegida redirige a `/login`. Después de iniciar sesión se vuelve a la vista solicitada.

### Contrato del JWT de acceso

`POST /api/auth/login` y `POST /api/auth/refresh` responden `{ accessToken, expiresIn, user }`. El `accessToken` es un JWT HS256 firmado con `JWT_ACCESS_SECRET` que contiene:

| Claim | Contenido |
| --- | --- |
| `sub` | Id del usuario (UUID). |
| `sid` | Id de la sesión en `user_sessions`. Al revocar la sesión, el token deja de ser válido aunque no haya vencido. |
| `schoolId` | Id del colegio del usuario. |
| `name` | Nombre visible. |
| `roles` | Códigos de rol, por ejemplo `["ADMIN"]` o `["COLLABORATOR"]`. |
| `permissions` | Códigos de permiso del rol, por ejemplo `student.read` o `user.manage`. |
| `iss` / `aud` | `JWT_ISSUER` y `JWT_AUDIENCE`. |
| `iat` / `exp` | Emisión y vencimiento (15 minutos). |

El frontend usa `roles` y `permissions` solo para decidir qué vistas y acciones muestra. La API vuelve a validar la firma, la sesión y el permiso en cada solicitud. Las pruebas `database/test/auth-api.test.ts` y `front/src/auth/authFlow.test.tsx` verifican este contrato y la protección de rutas.

Rutas disponibles:

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/health`
- `GET /api/roles` — roles disponibles, solo para administradores.
- `GET /api/users` — listado paginado con filtros, solo para administradores.
- `POST /api/users` — creación de usuarios, solo para administradores.
- `GET /api/users/:id` — detalle de usuario, solo para administradores.
- `PATCH /api/users/:id` — edición, cambio de rol y reactivación, solo para administradores.
- `DELETE /api/users/:id` — desactivación y revocación de sesiones, solo para administradores.

Los endpoints protegidos responden `401` cuando el JWT falta o es inválido, y `403` cuando el usuario autenticado no tiene el permiso necesario.

## Swagger y documentación REST

Con la API en ejecución están disponibles:

- Swagger UI: `http://localhost:3001/api/docs`
- OpenAPI JSON: `http://localhost:3001/api/openapi.json`

Para probar el CRUD desde Swagger:

1. Abra Swagger UI.
2. Ejecute `POST /api/auth/login` con una cuenta administradora.
3. Copie `accessToken` de la respuesta.
4. Presione **Authorize** y pegue el token.
5. Ejecute los endpoints bajo la sección **Usuarios**.

Swagger carga su interfaz desde `unpkg.com`; el documento OpenAPI JSON permanece disponible aunque no haya conexión externa.

## Comandos del backend

Ejecute estos comandos desde `database/`:

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Inicia la API con recarga automática. |
| `npm start` | Inicia la API sin modo de observación. |
| `npm run typecheck` | Comprueba los tipos de TypeScript. |
| `npm run db:validate` | Valida el esquema Prisma. |
| `npm run db:generate` | Genera el cliente Prisma. |
| `npm run db:migrate` | Crea y aplica una migración de desarrollo. |
| `npm run db:deploy` | Aplica migraciones existentes. |
| `npm run db:seed` | Crea o actualiza catálogos, roles y permisos. |
| `npm run db:studio` | Abre Prisma Studio. |
| `npm run db:create-admin` | Crea una cuenta administradora. |
| `npm run db:create-collaborator` | Crea una cuenta colaboradora. |
| `npm run db:set-password` | Restablece la contraseña de una cuenta. |
| `npm run storage:setup` | Crea y verifica el bucket privado de Supabase Storage. |
| `npm test` | Ejecuta las pruebas de base de datos, autenticación y almacenamiento. |

## Comandos del frontend

Ejecute estos comandos desde `front/`:

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Inicia el servidor de desarrollo. |
| `npm run build` | Comprueba TypeScript y genera la compilación de producción. |
| `npm run lint` | Ejecuta el análisis estático. |
| `npm test` | Ejecuta las pruebas de autenticación y protección de rutas. |
| `npm run preview` | Sirve localmente la compilación de producción. |

## Pruebas y validación

Backend:

```bash
cd database
npm run typecheck
npm test
```

Frontend:

```bash
cd front
npm run lint
npm test
npm run build
```

Las pruebas del backend necesitan que PostgreSQL esté activo y que `DATABASE_URL` esté configurada correctamente.

## Detener los servicios

Detener PostgreSQL sin borrar los datos:

```bash
cd database
docker compose down
```

Los datos permanecen en el volumen de Docker `crm_postgres_data`.

Para volver a iniciar PostgreSQL:

```bash
docker compose up -d
```

## Persistencia y GitHub

- La base de datos vive en el volumen local de Docker `crm_postgres_data`.
- El volumen, sus usuarios y sus contraseñas no se suben a GitHub.
- `database/.env` está ignorado por Git.
- Las contraseñas de usuarios se guardan como hashes bcrypt, nunca en texto plano.
- Cada desarrollador debe crear su propio `.env`, ejecutar las migraciones y crear sus cuentas locales.
- No suba respaldos, archivos `.env`, secretos JWT ni contraseñas reales al repositorio.

Las migraciones SQL que aparecen en `database/prisma/migrations/` contienen la estructura versionada de la base, no los datos locales.

## Solución de problemas

### `npm: command not found`

En Fedora 44:

```bash
sudo dnf install nodejs24-npm-bin
```

Después cierre y abra la terminal, y verifique:

```bash
node --version
npm --version
```

### La API indica que falta `JWT_ACCESS_SECRET`

Genere un valor nuevo:

```bash
openssl rand -base64 48
```

Guárdelo como `JWT_ACCESS_SECRET` dentro de `database/.env` y reinicie la API.

### No se puede conectar a PostgreSQL

```bash
cd database
docker compose ps
docker compose logs postgres
```

Compruebe que el contenedor esté activo y que `POSTGRES_PASSWORD` coincida con la contraseña de `DATABASE_URL`.

### El correo ya está registrado

Los comandos de creación no reemplazan usuarios existentes. Use `npm run db:set-password` para restablecer la contraseña de la cuenta existente.

### La cuenta está bloqueada

Espere 15 minutos o ejecute el restablecimiento de contraseña. El comando elimina el bloqueo y los intentos fallidos.

## Base de datos en Supabase

Staging y producción usan Supabase como PostgreSQL administrado y como almacenamiento privado de archivos. El esquema se aplica con las mismas migraciones de Prisma que se usan localmente, por lo que la base es idéntica en todos los ambientes. En desarrollo puede seguir usando PostgreSQL con Docker.

El frontend nunca se conecta a Supabase: todas las lecturas y escrituras pasan por la API.

### 1. Obtener las credenciales

En el panel del proyecto de Supabase:

1. **Connect → Session pooler**: copie la cadena de conexión. Tiene la forma `postgresql://postgres.REF:CLAVE@aws-0-REGION.pooler.supabase.com:5432/postgres`. El pooler en modo sesión funciona con IPv4; la conexión directa `db.REF.supabase.co` solo funciona con IPv6.
2. **Project Settings → Database → SSL Configuration**: descargue el certificado y guárdelo como `database/certs/supabase-ca.crt`. Es un certificado público de la CA de Supabase y no contiene secretos.
3. **Project Settings → API Keys**: copie la clave `service_role` (o la clave secreta `sb_secret_…`). Opcionalmente copie la clave `anon` (o `sb_publishable_…`) para verificar el bucket.

Si la contraseña de la base contiene caracteres especiales, codifíquela para URL (por ejemplo `@` → `%40`).

### 2. Configurar `database/.env`

```env
DATABASE_URL=postgresql://postgres.REF:CLAVE@aws-0-REGION.pooler.supabase.com:5432/postgres?schema=public&sslmode=verify-full&sslrootcert=certs/supabase-ca.crt
DIRECT_URL=postgresql://postgres.REF:CLAVE@aws-0-REGION.pooler.supabase.com:5432/postgres?schema=public&sslmode=require
SUPABASE_URL=https://REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=clave_service_role
SUPABASE_ANON_KEY=clave_anon_opcional
SUPABASE_STORAGE_BUCKET=crm-privado
```

- `DATABASE_URL` la usa la API. `sslmode=verify-full` comprueba el certificado del servidor con el archivo descargado.
- `DIRECT_URL` la usa Prisma CLI para aplicar migraciones. Si no está definida, Prisma usa `DATABASE_URL`.
- `SUPABASE_SERVICE_ROLE_KEY` omite todas las reglas de seguridad de Supabase. Solo puede existir en el backend; nunca en el frontend, en variables `VITE_*` ni en el repositorio.

### 3. Aplicar el esquema

Desde `database/`:

```bash
npm run db:deploy
npm run db:seed
npm run db:create-admin   # con las variables ADMIN_* descritas arriba
```

Use siempre `db:deploy` contra Supabase. No ejecute `db:migrate` (`prisma migrate dev`) contra Supabase: necesita una base temporal y puede pedir reiniciar el esquema. Cree las migraciones nuevas contra el PostgreSQL local de Docker y después aplíquelas con `db:deploy`.

No ejecute `npm test` contra la base de producción, porque las pruebas crean y eliminan usuarios temporales.

### 4. Crear y verificar el bucket privado

```bash
npm run storage:setup
```

El comando es idempotente:

- Crea el bucket `SUPABASE_STORAGE_BUCKET` (por defecto `crm-privado`) con `public = false`, un límite de 10 MB y solo archivos JPEG, PNG, WebP y PDF. Si el bucket ya existía como público, lo cambia a privado.
- Sube un archivo de prueba y confirma que **no** se puede descargar por la URL pública. Si `SUPABASE_ANON_KEY` está definida, confirma también que la clave anónima no tiene acceso.
- Elimina el archivo de prueba y termina con error si alguna comprobación falla.

Las fotografías de alumnos y los documentos generados se guardarán en este bucket. `student_photos.storage_path` y `generated_documents.storage_path` contienen la ruta del objeto dentro del bucket. La API los entregará mediante URLs firmadas de corta duración.

### Seguridad a nivel de filas (RLS)

Supabase publica automáticamente el esquema `public` mediante su API REST. La migración `20260923120000_enable_row_level_security` activa RLS sin políticas en todas las tablas, por lo que las claves `anon` y `authenticated` no pueden leer ni modificar datos por esa vía. La API se conecta como propietaria de las tablas y no se ve afectada.

Cada migración que cree una tabla nueva debe incluir:

```sql
ALTER TABLE "nombre_tabla" ENABLE ROW LEVEL SECURITY;
```

La prueba `todas las tablas del esquema public tienen RLS activo` falla si alguna tabla queda sin RLS.

### Error `self-signed certificate in certificate chain`

La API no encuentra el certificado de Supabase. Compruebe que `database/certs/supabase-ca.crt` exista y que ejecute los comandos desde `database/`, porque `sslrootcert` es una ruta relativa.

## Producción

Antes de desplegar:

- Use secretos únicos y generados aleatoriamente.
- Configure `NODE_ENV=production` para que la cookie de sesión utilice `Secure`.
- Sirva frontend y API mediante HTTPS.
- Configure `FRONTEND_ORIGIN` con el dominio exacto del frontend.
- Aplique migraciones con `npm run db:deploy`; no use `prisma db push`.
- Mantenga respaldos cifrados de PostgreSQL fuera del repositorio.
- No reutilice contraseñas de desarrollo en producción.

## Ambientes

El proyecto usa tres ambientes. Cada uno tiene su propia base de datos y sus propios secretos, y nunca se comparten entre ambientes.

| Ambiente | Base de datos | API | Frontend |
| --- | --- | --- | --- |
| Desarrollo | PostgreSQL en Docker (o un proyecto Supabase de desarrollo) | `npm run dev` | `npm run dev` (proxy `/api`) |
| Staging | Proyecto Supabase de staging | Servidor de staging, `NODE_ENV=production` | `npm run build:staging` |
| Producción | Proyecto Supabase de producción | Servidor de producción, `NODE_ENV=production` | `npm run build` |

### Dónde vive cada variable

| Variable | Dónde se usa | ¿Secreta? |
| --- | --- | --- |
| `DATABASE_URL`, `DIRECT_URL`, `POSTGRES_PASSWORD` | Backend | Sí |
| `JWT_ACCESS_SECRET` | Backend | Sí. Debe ser distinta en cada ambiente. |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend (Storage) | Sí. Omite todas las reglas de seguridad de Supabase. |
| `SUPABASE_URL`, `SUPABASE_STORAGE_BUCKET`, `SUPABASE_ANON_KEY` | Backend | No, pero solo el backend las necesita. |
| `JWT_ISSUER`, `JWT_AUDIENCE`, `FRONTEND_ORIGIN`, `PORT`, `NODE_ENV` | Backend | No |
| `VITE_API_URL` | Frontend (queda dentro del bundle) | No |

Reglas:

- Los valores reales viven en archivos locales ignorados por Git (`database/.env`, `database/.env.staging`, `front/.env.staging.local`, etc.) o en el gestor de secretos del servidor donde se despliega. Solo se versionan las plantillas `.env.example`.
- El frontend solo recibe variables `VITE_*`, y solo la URL de la API. `vite.config.ts` detiene el build si una variable `VITE_*` tiene nombre de secreto (`SECRET`, `SERVICE_ROLE`, `PASSWORD`, `JWT`, etc.).
- `scripts/check-secrets.mjs` falla si se versiona un archivo `.env`, si el repositorio contiene claves reales (`sb_secret_…`, JWT `service_role`, llaves privadas) o si el bundle compilado contiene referencias a `service_role`, cadenas de conexión o variables secretas del backend. Puede ejecutarlo localmente:

  ```bash
  npm --prefix front run build
  node scripts/check-secrets.mjs front/dist
  ```

### Ejecutar comandos contra otro ambiente

El backend lee `database/.env` por defecto. Para usar otro archivo, indique su ruta en `DOTENV_CONFIG_PATH`. Por ejemplo, para aplicar las migraciones en staging desde `database/`:

```bash
# bash
DOTENV_CONFIG_PATH=.env.staging npm run db:deploy
```

```powershell
# PowerShell
$env:DOTENV_CONFIG_PATH = ".env.staging"; npm run db:deploy; Remove-Item Env:DOTENV_CONFIG_PATH
```

En el frontend, Vite elige el archivo según el modo: `npm run build:staging` lee `.env.staging.local` y `npm run build` lee `.env.production.local`.

## Integración continua

`.github/workflows/ci.yml` se ejecuta con GitHub Actions en cada push a cualquier rama y en cada pull request. Tiene tres jobs:

| Job | Qué comprueba |
| --- | --- |
| Secretos en el repositorio | `node scripts/check-secrets.mjs` sobre los archivos versionados. |
| Backend | `npm ci`, validación del esquema Prisma, `typecheck`, migraciones y seed sobre un PostgreSQL 17 temporal, y `npm test`. |
| Frontend | `npm ci`, `lint`, `npm test`, `build` y revisión de secretos en `front/dist`. |

El CI no usa secretos reales: la base de datos y `JWT_ACCESS_SECRET` son temporales y solo existen durante la ejecución.

Para impedir que se integren cambios con el CI en rojo, active en GitHub **Settings → Branches → Branch protection rules** para `main` la opción *Require status checks to pass before merging* y seleccione los tres jobs.
