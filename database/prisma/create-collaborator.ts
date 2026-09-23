import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.COLLABORATOR_EMAIL?.trim().toLowerCase();
const password = process.env.COLLABORATOR_PASSWORD;
const displayName = process.env.COLLABORATOR_DISPLAY_NAME?.trim();
const schoolCode = process.env.SCHOOL_CODE?.trim() || "MANO_AMIGA";

if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");
if (!email) throw new Error("COLLABORATOR_EMAIL es obligatoria");
if (!displayName) throw new Error("COLLABORATOR_DISPLAY_NAME es obligatoria");
if (!password || password.length < 12) {
  throw new Error("COLLABORATOR_PASSWORD debe contener al menos 12 caracteres");
}
const collaboratorEmail = email;
const collaboratorDisplayName = displayName;
const collaboratorPassword = password;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: collaboratorEmail } });
  if (existing) throw new Error(`Ya existe un usuario con el correo ${collaboratorEmail}`);

  const [school, collaboratorRole] = await Promise.all([
    prisma.school.findUnique({ where: { code: schoolCode } }),
    prisma.role.findUnique({ where: { code: "COLLABORATOR" } }),
  ]);

  if (!school) throw new Error(`No existe el colegio ${schoolCode}; ejecute primero db:seed`);
  if (!collaboratorRole) throw new Error("No existe el rol COLLABORATOR; ejecute primero db:seed");

  const passwordHash = await bcrypt.hash(collaboratorPassword, 12);
  const user = await prisma.user.create({
    data: {
      schoolId: school.id,
      email: collaboratorEmail,
      passwordHash,
      displayName: collaboratorDisplayName,
      roles: { create: { roleId: collaboratorRole.id } },
    },
    select: { id: true, email: true, displayName: true },
  });

  console.info(`Colaborador creado: ${user.email} (${user.id})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
