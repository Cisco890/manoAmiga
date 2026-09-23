import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL es obligatoria para ejecutar el seed");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const grades = [
  { code: "PRE-KINDER", name: "Prekínder", level: "PRE_PRIMARY" as const, displayOrder: 1, minAge: 3, maxAge: 4 },
  { code: "KINDER", name: "Kínder", level: "PRE_PRIMARY" as const, displayOrder: 2, minAge: 4, maxAge: 5 },
  { code: "PREPARATORIA", name: "Preparatoria", level: "PRE_PRIMARY" as const, displayOrder: 3, minAge: 5, maxAge: 6 },
  ...Array.from({ length: 6 }, (_, index) => ({
    code: `PRIMARIA-${index + 1}`,
    name: `${index + 1}.º primaria`,
    level: "PRIMARY" as const,
    displayOrder: index + 4,
    minAge: index + 6,
    maxAge: index + 8,
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    code: `BASICO-${index + 1}`,
    name: `${index + 1}.º básico`,
    level: "SECONDARY" as const,
    displayOrder: index + 10,
    minAge: index + 12,
    maxAge: index + 14,
  })),
];

const permissions = [
  ["student.read", "Consultar alumnos"],
  ["student.write", "Administrar alumnos"],
  ["student.medical.read", "Consultar información médica"],
  ["enrollment.read", "Consultar inscripciones"],
  ["enrollment.write", "Administrar inscripciones"],
  ["enrollment.approve", "Aprobar inscripciones"],
  ["sponsor.read", "Consultar padrinos"],
  ["sponsor.write", "Administrar padrinos"],
  ["donation.read", "Consultar compromisos de donación"],
  ["donation.write", "Administrar compromisos de donación"],
  ["document.generate", "Generar documentos"],
  ["document.print", "Imprimir documentos"],
  ["dashboard.read", "Consultar dashboard"],
  ["export.data", "Exportar información"],
  ["audit.read", "Consultar auditoría"],
  ["user.manage", "Administrar usuarios"],
  ["settings.manage", "Administrar configuración"],
] as const;

const roles = [
  ["ADMIN", "Administración", "Usuarios, permisos y configuración"],
  ["COLLABORATOR", "Colaborador", "Consulta de información sin permisos de creación ni administración"],
] as const;

const rolePermissions: Record<string, readonly string[]> = {
  ADMIN: permissions.map(([code]) => code),
  COLLABORATOR: [
    "dashboard.read",
    "student.read",
    "enrollment.read",
    "sponsor.read",
    "donation.read",
  ],
};

async function main() {
  const school = await prisma.school.upsert({
    where: { code: "MANO_AMIGA" },
    update: { name: "Colegio Mano Amiga" },
    create: {
      code: "MANO_AMIGA",
      name: "Colegio Mano Amiga",
      country: "Guatemala",
    },
  });

  const cycleYear = new Date().getUTCFullYear();
  const cycle = await prisma.academicCycle.upsert({
    where: { schoolId_year: { schoolId: school.id, year: cycleYear } },
    update: { name: `Ciclo ${cycleYear}` },
    create: {
      schoolId: school.id,
      name: `Ciclo ${cycleYear}`,
      year: cycleYear,
      startDate: new Date(`${cycleYear}-01-01T00:00:00.000Z`),
      endDate: new Date(`${cycleYear}-10-31T00:00:00.000Z`),
      status: "ACTIVE",
    },
  });

  for (const gradeData of grades) {
    const grade = await prisma.grade.upsert({
      where: { schoolId_code: { schoolId: school.id, code: gradeData.code } },
      update: gradeData,
      create: { schoolId: school.id, ...gradeData },
    });

    await prisma.classSection.upsert({
      where: {
        academicCycleId_gradeId_name: {
          academicCycleId: cycle.id,
          gradeId: grade.id,
          name: "A",
        },
      },
      update: { active: true },
      create: {
        academicCycleId: cycle.id,
        gradeId: grade.id,
        name: "A",
        active: true,
      },
    });
  }

  const settings = [
    ["authorized_pickups.max", 3, "Cantidad máxima de autorizados activos por inscripción"],
    ["currency.default", "GTQ", "Moneda predeterminada para compromisos de donación"],
    ["student.code.format", "MA-{YEAR}-{SEQUENCE:5}", "Formato del código único de alumno"],
  ] as const;

  for (const [key, value, description] of settings) {
    await prisma.systemSetting.upsert({
      where: { schoolId_key: { schoolId: school.id, key } },
      update: { value, description },
      create: { schoolId: school.id, key, value, description },
    });
  }

  const permissionIds = new Map<string, string>();
  for (const [code, name] of permissions) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
    permissionIds.set(code, permission.id);
  }

  for (const [code, name, description] of roles) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name, description },
      create: { code, name, description },
    });

    const allowedPermissionIds = rolePermissions[code].map((permissionCode) => {
      const permissionId = permissionIds.get(permissionCode);
      if (!permissionId) throw new Error(`Permiso desconocido: ${permissionCode}`);
      return permissionId;
    });

    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: allowedPermissionIds } },
    });

    for (const permissionCode of rolePermissions[code]) {
      const permissionId = permissionIds.get(permissionCode);
      if (!permissionId) throw new Error(`Permiso desconocido: ${permissionCode}`);

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
  }

  await prisma.role.deleteMany({
    where: {
      code: { notIn: roles.map(([code]) => code) },
      users: { none: {} },
    },
  });

  console.info(`Seed completado para ${school.name}, ciclo ${cycle.year}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
