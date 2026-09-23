import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
const email = process.env.USER_EMAIL?.trim().toLowerCase();
const password = process.env.USER_PASSWORD;

if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria");
if (!email) throw new Error("USER_EMAIL es obligatorio");
if (!password || password.length < 12) {
  throw new Error("USER_PASSWORD debe contener al menos 12 caracteres");
}

const userEmail = email;
const newPassword = password;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true, email: true },
  });
  if (!user) throw new Error(`No existe un usuario con el correo ${userEmail}`);

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }),
    prisma.userSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  console.info(`Contraseña restablecida y sesiones revocadas para ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
