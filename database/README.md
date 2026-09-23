# Base de datos del CRM Mano Amiga

Implementación de PostgreSQL 17 y Prisma ORM 7.10 para el CRM escolar.

Incluye una API HTTP de autenticación con JWT de acceso, refresh token rotativo y control de permisos por rol.

## Inicio rápido

1. Copie `.env.example` como `.env` y reemplace la contraseña de ejemplo.
   Genere `JWT_ACCESS_SECRET` con un valor aleatorio de al menos 32 bytes, por ejemplo:

   ```bash
   openssl rand -base64 48
   ```
2. Inicie PostgreSQL:

   ```bash
   docker compose up -d
   docker compose ps
   ```

3. Con Node.js 20.19 o posterior instalado, prepare y despliegue la base:

   ```bash
   npm install
   npm run db:validate
   npm run db:deploy
   npm run db:generate
   npm run db:seed
   ```

Si no hay Node.js en el host, use el servicio de herramientas incluido:

```bash
docker compose run --rm tooling npm install
docker compose run --rm tooling npm run db:validate
docker compose run --rm tooling npm run db:deploy
docker compose run --rm tooling npm run db:generate
docker compose run --rm tooling npm run db:seed
docker compose run --rm tooling npm test
```

El seed es idempotente: crea el colegio, el ciclo del año en curso, grados, secciones A, parámetros, roles y permisos mediante `upsert`.

## API y autenticación

Inicie la API en `http://localhost:3000`:

```bash
npm run dev
```

Rutas disponibles:

- `POST /api/auth/login` — valida correo y contraseña, entrega un JWT de acceso y establece el refresh token en una cookie `HttpOnly`.
- `POST /api/auth/refresh` — rota la sesión y entrega un nuevo JWT.
- `POST /api/auth/logout` — revoca la sesión actual.
- `GET /api/auth/me` — valida el JWT y devuelve el usuario, sus roles y permisos.
- `GET /api/roles` — lista los roles asignables; requiere `user.manage`.
- `GET /api/users` — lista y filtra usuarios; requiere `user.manage`.
- `POST /api/users` — crea un usuario con exactamente un rol; requiere `user.manage`.
- `GET /api/users/:id` — consulta un usuario; requiere `user.manage`.
- `PATCH /api/users/:id` — edita correo, nombre, rol o estado; requiere `user.manage`.
- `DELETE /api/users/:id` — desactiva la cuenta y revoca sus sesiones; requiere `user.manage`.

Las rutas administrativas responden `401` cuando falta un JWT válido y `403` cuando el usuario autenticado no posee `user.manage`.

## Swagger y OpenAPI

Con la API activa, abra:

- Swagger UI: `http://localhost:3000/api/docs`
- Documento OpenAPI: `http://localhost:3000/api/openapi.json`

Para probar rutas protegidas desde Swagger:

1. Ejecute `POST /api/auth/login`.
2. Copie el valor `accessToken` de la respuesta.
3. Presione **Authorize** y pegue únicamente el token.
4. Ejecute los endpoints de Usuarios.

El JWT dura 15 minutos. La sesión renovable dura 7 días y queda registrada en `user_sessions`. Cinco intentos fallidos bloquean temporalmente la cuenta durante 15 minutos.

Los roles activos son:

- `ADMIN`: acceso completo, creación de registros, documentos y administración.
- `COLLABORATOR`: acceso de consulta sin creación de alumnos, padrinos, inscripciones o documentos y sin opciones administrativas.

## Primer administrador

El seed no contiene contraseñas. Cree el primer administrador pasando los secretos solo al proceso:

```bash
ADMIN_EMAIL=admin@ejemplo.edu.gt \
ADMIN_DISPLAY_NAME="Administrador" \
ADMIN_PASSWORD="una-clave-larga-y-unica" \
npm run db:create-admin
```

Con el contenedor de herramientas:

```bash
ADMIN_EMAIL=admin@ejemplo.edu.gt \
ADMIN_DISPLAY_NAME="Administrador" \
ADMIN_PASSWORD="una-clave-larga-y-unica" \
docker compose run --rm \
  -e ADMIN_EMAIL -e ADMIN_DISPLAY_NAME -e ADMIN_PASSWORD \
  tooling npm run db:create-admin
```

La contraseña se almacena únicamente como hash bcrypt con factor de costo 12. El comando rechaza contraseñas menores de 12 caracteres y no reemplaza cuentas existentes.

## Primer colaborador

Después de ejecutar el seed, cree una cuenta de consulta:

```bash
COLLABORATOR_EMAIL=colaborador@ejemplo.edu.gt \
COLLABORATOR_DISPLAY_NAME="Colaborador" \
COLLABORATOR_PASSWORD="una-clave-larga-y-unica" \
npm run db:create-collaborator
```

También puede ejecutar este comando con el contenedor `tooling`, siguiendo el mismo patrón usado para el administrador.

## Restablecer una contraseña

El restablecimiento vuelve a generar el hash bcrypt, limpia los intentos fallidos y revoca todas las sesiones abiertas de la cuenta:

```bash
USER_EMAIL=colaborador@ejemplo.edu.gt \
USER_PASSWORD="una-nueva-clave-larga-y-unica" \
npm run db:set-password
```

La contraseña debe contener al menos 12 caracteres y no se imprime ni se almacena en texto plano.

## Migraciones

- Desarrollo: `npm run db:migrate`
- Integración y producción: `npm run db:deploy`
- Estado: `npx prisma migrate status`

No use `prisma db push` en producción. Revise el SQL de cada migración y respalde la base antes de cambios destructivos.

## Archivos sensibles

`.env`, respaldos, dependencias y el cliente generado están excluidos de Git. CUI, DPI y NIT deben cifrarse en la aplicación con AES-256-GCM y buscarse mediante HMAC-SHA-256 usando claves distintas y externas a PostgreSQL.
