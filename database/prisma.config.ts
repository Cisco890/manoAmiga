import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // En Supabase las migraciones usan la conexión directa (o el pooler en modo sesión);
    // la API conserva DATABASE_URL. Localmente basta con DATABASE_URL.
    url: process.env.DIRECT_URL || env("DATABASE_URL"),
  },
});
