# Base de datos del CRM Mano Amiga

Implementación de PostgreSQL 17 y Prisma ORM 7.10 para el CRM escolar.

## Inicio rápido

1. Copie `.env.example` como `.env` y reemplace la contraseña de ejemplo.
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

## Migraciones

- Desarrollo: `npm run db:migrate`
- Integración y producción: `npm run db:deploy`
- Estado: `npx prisma migrate status`

No use `prisma db push` en producción. Revise el SQL de cada migración y respalde la base antes de cambios destructivos.

## Archivos sensibles

`.env`, respaldos, dependencias y el cliente generado están excluidos de Git. CUI, DPI y NIT deben cifrarse en la aplicación con AES-256-GCM y buscarse mediante HMAC-SHA-256 usando claves distintas y externas a PostgreSQL.
