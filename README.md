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
PORT=3000
```

`POSTGRES_PASSWORD` debe coincidir con la contraseña incluida dentro de `DATABASE_URL`.

No suba `database/.env` a GitHub. El archivo ya está excluido mediante `.gitignore`.

### URL de la API en el frontend

Durante el desarrollo no es necesario crear `front/.env`: Vite redirige `/api` hacia `http://localhost:3000`.

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

La API queda disponible en `http://localhost:3000`.

Compruebe su estado con:

```bash
curl http://localhost:3000/api/health
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

- Swagger UI: `http://localhost:3000/api/docs`
- OpenAPI JSON: `http://localhost:3000/api/openapi.json`

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
