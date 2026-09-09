import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_DISPLAY_NAME?.trim();
const schoolCode = process.env.SCHOOL_CODE?.trim() || "MANO_AMIGA";

if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");
if (!email) throw new Error("ADMIN_EMAIL es obligatoria");
if (!displayName) throw new Error("ADMIN_DISPLAY_NAME es obligatoria");
if (!password || password.length < 12) {
  throw new Error("ADMIN_PASSWORD debe contener al menos 12 caracteres");
}
const adminEmail = email;
const adminDisplayName = displayName;
const adminPassword = password;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) throw new Error(`Ya existe un usuario con el correo ${adminEmail}`);

  const [school, adminRole] = await Promise.all([
    prisma.school.findUnique({ where: { code: schoolCode } }),
    prisma.role.findUnique({ where: { code: "ADMIN" } }),
  ]);

  if (!school) throw new Error(`No existe el colegio ${schoolCode}; ejecute primero db:seed`);
  if (!adminRole) throw new Error("No existe el rol ADMIN; ejecute primero db:seed");

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const user = await prisma.user.create({
    data: {
      schoolId: school.id,
      email: adminEmail,
      passwordHash,
      displayName: adminDisplayName,
      roles: { create: { roleId: adminRole.id } },
    },
    select: { id: true, email: true, displayName: true },
  });

  console.info(`Administrador creado: ${user.email} (${user.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
