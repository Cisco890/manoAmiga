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
| `npm test` | Ejecuta las pruebas de base de datos y JWT. |

## Comandos del frontend

Ejecute estos comandos desde `front/`:

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Inicia el servidor de desarrollo. |
| `npm run build` | Comprueba TypeScript y genera la compilación de producción. |
| `npm run lint` | Ejecuta el análisis estático. |
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

## Producción

Antes de desplegar:

- Use secretos únicos y generados aleatoriamente.
- Configure `NODE_ENV=production` para que la cookie de sesión utilice `Secure`.
- Sirva frontend y API mediante HTTPS.
- Configure `FRONTEND_ORIGIN` con el dominio exacto del frontend.
- Aplique migraciones con `npm run db:deploy`; no use `prisma db push`.
- Mantenga respaldos cifrados de PostgreSQL fuera del repositorio.
- No reutilice contraseñas de desarrollo en producción.
